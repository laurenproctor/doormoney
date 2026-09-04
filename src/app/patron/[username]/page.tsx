import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { HeroArt } from "@/components/HeroArt";
import { Nav } from "@/components/Nav";
import { Theme } from "@/components/Theme";
import { websiteLabel } from "@/lib/links";
import { SITE } from "@/lib/site";
import { formatMonth, impactTotals, initialsFor, profileLink, SUPPORT_LABEL, yearOf } from "@/lib/profile";
import { normalizeUsername } from "@/lib/username";
import {
  currentUsernameFor,
  getPublicActivity,
  getPublicProfile,
  signedPhotoUrl,
  type PublicActivity,
  type PublicProfile,
} from "@/lib/patronprofile";

/*
  A patron's public page.

  Everything here was chosen twice: once when the patron published the profile, and once for each
  placement or backing they put on it. A profile nobody published, and a username nobody holds,
  read the same from outside: not found. There is no page that says "private", because a page that
  says "private" says somebody is there.

  Nothing on this page came from a private column. The two reads go through the sanitised views in
  migration 0022, which carry no email address, no payment status, no Stripe id and no amount.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

/** The published profile, or where the visitor should have gone instead. */
async function resolve(raw: string): Promise<{ profile: PublicProfile } | { moved: string } | null> {
  const username = normalizeUsername(raw);
  const profile = await getPublicProfile(username);
  if (profile) return { profile };
  // A word this patron used to hold still knows where they went. Nothing is said about whether
  // the page at the other end exists: that address answers for itself.
  const now = await currentUsernameFor(username);
  if (now && now !== username) return { moved: now };
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const found = await resolve(username);
  if (!found || "moved" in found) return { title: "Patron", robots: { index: false, follow: false } };
  const p = found.profile;
  const description = p.bio ?? `${p.displayName} puts money behind working musicians on Door Money.`;
  const image = await signedPhotoUrl(p.photoPath);
  return {
    title: `${p.displayName}, patron`,
    description,
    alternates: { canonical: `${SITE.url}/patron/${p.username}` },
    openGraph: {
      title: `${p.displayName} on Door Money`,
      description,
      type: "profile",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: "summary", title: `${p.displayName} on Door Money`, description },
  };
}

export default async function PatronProfilePage({ params }: Props) {
  const { username } = await params;
  const found = await resolve(username);
  if (!found) notFound();
  if ("moved" in found) permanentRedirect(`/patron/${found.moved}`);

  const profile = found.profile;
  const [activity, photo] = await Promise.all([getPublicActivity(profile.username), signedPhotoUrl(profile.photoPath)]);
  const link = profileLink(profile.website);
  const totals = impactTotals(activity);

  return (
    <Theme name="blue">
      <Nav />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden border-b border-line">
          <HeroArt theme="blue" />
          <div className="hero-in relative mx-auto w-full max-w-[1120px] px-7 pb-[64px] pt-[80px]">
            <Eyebrow className="mb-8">Patron profile</Eyebrow>
            <div className="grid items-start gap-8 sm:grid-cols-[160px_1fr] sm:gap-10">
              <Avatar name={profile.displayName} photo={photo} />
              <div className="min-w-0">
                <h1 className="display break-words text-[clamp(36px,6vw,72px)] leading-[0.98]">{profile.displayName}</h1>
                <p className="caps mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14.5px] text-muted">
                  <span className="break-all text-accent-ink">@{profile.username}</span>
                  {profile.location && <span>{profile.location}</span>}
                  <span>Patron since {yearOf(profile.patronSince)}</span>
                </p>
                {profile.bio && <p className="mt-6 max-w-[54ch] text-[17px] leading-[1.6]">{profile.bio}</p>}
                {link && (
                  <p className="mt-5 text-[15px]">
                    <a
                      href={link}
                      rel="nofollow noopener noreferrer ugc"
                      target="_blank"
                      className="text-accent-ink underline decoration-1 underline-offset-4"
                    >
                      {websiteLabel(link)}
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {profile.interests.length > 0 && (
          <Section>
            <SectionHead eyebrow="Musical interests">Listening for</SectionHead>
            <ul className="mt-7 flex flex-wrap gap-2.5">
              {profile.interests.map((i) => (
                <li key={i} className="edge caps bg-panel px-4 py-2.5 text-[14px] text-ink">
                  {i}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section>
          <SectionHead eyebrow="Public support">Put behind the music</SectionHead>
          {activity.length === 0 ? (
            <p className="max-w-[56ch] text-[15px] text-muted">
              {profile.displayName} has not put anything on this page yet. What a patron shows here is their own
              choice, one placement or backing at a time.
            </p>
          ) : (
            <>
              <ul className="caps mb-9 flex flex-wrap gap-x-8 gap-y-2 text-[14.5px] text-accent-ink">
                {totals.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <ul className="divide-y divide-line border-y border-line">
                {activity.map((a, i) => (
                  <ActivityRow key={`${a.kind}-${a.actSlug}-${a.runTitle}-${i}`} item={a} />
                ))}
              </ul>
            </>
          )}
        </Section>

        <Section>
          <SectionHead eyebrow="The live boards">Back a run</SectionHead>
          <p className="mb-8 max-w-[56ch] text-[15px] text-muted">
            Every open board names its run, its rooms and its prices. Door Money holds the money and pays the
            musician weekly through the run.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/auctions" arrow>
              See the live boards
            </ButtonLink>
            <ButtonLink href="/placements" variant="ghost">
              What a placement is
            </ButtonLink>
          </div>
        </Section>
      </main>
      <Footer />
    </Theme>
  );
}

/** The photograph, or the patron's initials in the page's light. Same square either way. */
function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const box = "h-[140px] w-[140px] max-sm:h-[104px] max-sm:w-[104px]";
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        width={140}
        height={140}
        className={`lit ${box} flex-none rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`lit heading ${box} flex flex-none items-center justify-center rounded-full border border-accent/70 text-[42px] leading-none text-accent-ink max-sm:text-[32px]`}
    >
      {initialsFor(name)}
    </div>
  );
}

/** One thing a patron chose to show: who, which run, what kind of support, and when. No amount. */
function ActivityRow({ item }: { item: PublicActivity }) {
  const live = item.runStatus === "open" || item.runStatus === "live";
  return (
    <li className="grid gap-1.5 py-5 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
      <div className="min-w-0">
        <b className="block text-[16px] font-medium">
          {live ? (
            <Link href={`/board/${item.actSlug}`} className="text-accent-ink underline decoration-1 underline-offset-4">
              {item.actName}
            </Link>
          ) : (
            item.actName
          )}
          , {item.runTitle}
        </b>
        <span className="block text-[14.5px] text-muted">{item.detail}</span>
      </div>
      <span className="caps text-[14px] text-muted sm:justify-self-end sm:text-right">
        {SUPPORT_LABEL[item.kind]} <span aria-hidden="true">&middot;</span> {formatMonth(item.supportedAt)}
      </span>
    </li>
  );
}
