import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { HeroArt } from "@/components/HeroArt";
import { NewsletterCTA } from "@/components/Newsletter";
import { Theme, themeFor } from "@/components/Theme";
import { getActProfile, type ActRun } from "@/lib/boards";
import { formatDateRange } from "@/lib/dates";
import { instagramHandle, instagramUrl, safeWebsite, websiteLabel } from "@/lib/links";
import { currentSlugFor } from "@/lib/patronprofile";
import { actPath, runPath } from "@/lib/urls";
import { normalizeUsername } from "@/lib/username";

/*
  A musician's own page: /gutter-hymns.

  The act's word sits at the root of the site, so this route sees every path the static routes did
  not claim. RESERVED_SLUGS in src/lib/slug.ts and the reserved_handles table keep the two apart:
  no musician holds "login", so no act page can shadow one.

  The page introduces the act and lists what they are raising for. A run's own board is a page down
  from here, at /gutter-hymns/support-europe-tour.
*/

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getActProfile(slug);
  if (!profile) return { title: "Musician" };
  const { act } = profile;
  const description = act.bio ?? `${act.name}, ${act.city}. Patrons put money behind the run on Door Money.`;
  return {
    title: act.name,
    description,
    openGraph: { title: `${act.name} on Door Money`, description, type: "profile", ...(act.photoUrl ? { images: [{ url: act.photoUrl }] } : {}) },
    twitter: { card: act.photoUrl ? "summary_large_image" : "summary", title: `${act.name} on Door Money`, description },
  };
}

const runUnit = (kind: string) => (kind === "season" ? "gigs" : "shows");

function RunRow({ actSlug, run, live }: { actSlug: string; run: ActRun; live: boolean }) {
  return (
    <li className="border-t border-line py-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div>
          <h3 className="heading text-[clamp(22px,3vw,32px)] leading-[1.1]">
            <Link href={runPath(actSlug, run.slug)} className="underline decoration-1 underline-offset-[6px] hover:text-accent-ink">
              {run.title}
            </Link>
          </h3>
          <p className="caps mt-3 text-[14px] text-muted">
            {run.showCount} {runUnit(run.kind)}, {formatDateRange(run.startsOn, run.endsOn)}
          </p>
        </div>
        {live && (
          <ButtonLink href={runPath(actSlug, run.slug)} className="self-start">
            Back the run
          </ButtonLink>
        )}
      </div>
    </li>
  );
}

export default async function ActPage({ params }: Props) {
  const { slug } = await params;
  const profile = await getActProfile(slug);
  if (!profile) {
    // A board address that moved keeps its old word pointing here. Retired words are never
    // reissued (migration 0024), so this can only ever land on the musician who left it behind.
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(actPath(moved));
    notFound();
  }

  const { act, running, past } = profile;
  // Every act gets its own colour of light, the same one on the page and on every board under it.
  const theme = themeFor(slug);
  const website = safeWebsite(act.website);
  const handle = instagramHandle(act.instagram);
  const plural = act.type !== "soloist";

  return (
    <Theme name={theme}>
      <Nav current="/auctions" />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden border-b border-line">
          <HeroArt theme={theme} src={act.photoUrl} />
          <div className="hero-in relative mx-auto max-w-[1120px] px-7 pb-14 pt-[72px]">
            <Eyebrow className="mb-7">{act.type === "soloist" ? "Musician" : act.type === "house_act" ? "House act" : "Band"}</Eyebrow>
            <h1 className={`display max-w-[14ch] leading-[0.98] ${act.name.length > 14 ? "text-[clamp(40px,7vw,92px)]" : "text-[clamp(48px,8.4vw,108px)]"}`}>{act.name}</h1>
            <p className="caps mt-6 text-[14.5px] leading-[2]">{act.city}</p>
            {act.bio && <p className="mt-6 max-w-[58ch] border-l border-accent/60 pl-5 text-[clamp(16px,1.9vw,18px)] leading-[1.55]">{act.bio}</p>}
            {(website || handle) && (
              <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14.5px]">
                {website && (
                  <a
                    href={website}
                    rel="noopener noreferrer nofollow ugc"
                    target="_blank"
                    aria-label={`${act.name} website, opens in a new tab`}
                    className="break-all text-accent-ink underline decoration-1 underline-offset-4"
                  >
                    {websiteLabel(website)}
                  </a>
                )}
                {handle && (
                  <a
                    href={instagramUrl(handle)}
                    rel="noopener noreferrer nofollow ugc"
                    target="_blank"
                    aria-label={`${act.name} on Instagram, opens in a new tab`}
                    className="text-accent-ink underline decoration-1 underline-offset-4"
                  >
                    Instagram, @{handle}
                  </a>
                )}
              </p>
            )}
          </div>
        </section>

        <Section>
          <SectionHead eyebrow={running.length ? "Raising now" : "Nothing open"}>
            {running.length ? (
              <>
                What {plural ? "they are" : "the musician is"} raising for
              </>
            ) : (
              <>No run is open right now</>
            )}
          </SectionHead>
          {running.length ? (
            <ul className="mt-12">
              {running.map((r) => (
                <RunRow key={r.slug} actSlug={slug} run={r} live />
              ))}
            </ul>
          ) : (
            <p className="mt-10 max-w-[56ch] text-[16px] text-muted">
              {act.name} {plural ? "have" : "has"} no run open on Door Money at the moment. The next one shows up here.
            </p>
          )}
        </Section>

        {past.length > 0 && (
          <Section className="border-t border-line">
            <SectionHead eyebrow="Already run">What came before</SectionHead>
            <ul className="mt-12">
              {past.map((r) => (
                <RunRow key={r.slug} actSlug={slug} run={r} live={false} />
              ))}
            </ul>
          </Section>
        )}

        <NewsletterCTA source={`act:${slug}`} eyebrow="The next board" />
      </main>
      <Footer />
    </Theme>
  );
}
