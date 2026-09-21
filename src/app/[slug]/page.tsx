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
import { CategoryBadge } from "@/components/domain";
import { getActProfile, type ActRun } from "@/lib/boards";
import { getCategoryLabels } from "@/lib/category-registry";
import { categoryWords } from "@/lib/category-words";
import { formatDateRange } from "@/lib/dates";
import { periodOf } from "@/lib/periods";
import { instagramHandle, instagramUrl, safeWebsite, websiteLabel } from "@/lib/links";
import { currentSlugFor } from "@/lib/patronprofile";
import { actPath, runPath } from "@/lib/urls";
import { normalizeUsername } from "@/lib/username";

/*
  An organizer's own page: /gutter-hymns.

  The act's word sits at the root of the site, so this route sees every path the static routes did
  not claim. RESERVED_SLUGS in src/lib/slug.ts and the reserved_handles table keep the two apart:
  no musician holds "login", so no act page can shadow one.

  The page introduces the organizer and lists what they are raising for. A fundraiser has its own
  page one down from here, at /gutter-hymns/support-europe-tour.

  An organizer has no category of their own. A music act says what it is (acts.type), and keeps the
  words it always had. Anybody else is named by the one category all their fundraisers agree on, and
  otherwise is an organizer. No city, show count or date is printed that nobody entered.
*/

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getActProfile(slug);
  if (!profile) return { title: "Organizer" };
  const { act } = profile;
  const description = act.bio ?? `${[act.name, act.city].filter(Boolean).join(", ")}. Sponsors put money behind the work on Door Money.`;
  return {
    title: act.name,
    description,
    openGraph: { title: `${act.name} on Door Money`, description, type: "profile", ...(act.photoUrl ? { images: [{ url: act.photoUrl }] } : {}) },
    twitter: { card: act.photoUrl ? "summary_large_image" : "summary", title: `${act.name} on Door Money`, description },
  };
}



/** What a music act has always been called here. Only music has an act type. */
const MUSIC_EYEBROW: Record<string, string> = { soloist: "Musician", house_act: "House act", touring_band: "Band" };

function RunRow({ actSlug, run, live, categoryName }: { actSlug: string; run: ActRun; live: boolean; categoryName?: string }) {
  const music = run.categoryKey === "music";
  // Music counts shows, because a music fundraiser is built out of them. Nobody else has a count.
  const count = music && run.showCount !== null ? `${run.showCount} ${run.showCount === 1 ? periodOf(run.kind).unit : periodOf(run.kind).units}` : null;
  const dates = run.startsOn && run.endsOn ? formatDateRange(run.startsOn, run.endsOn) : null;
  const facts = [count, dates].filter(Boolean).join(", ");
  return (
    <li className="border-t border-line py-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div>
          <h3 className="heading text-[clamp(22px,3vw,32px)] leading-[1.1]">
            <Link href={runPath(actSlug, run.slug)} className="underline decoration-1 underline-offset-[6px] hover:text-accent-ink">
              {run.title}
            </Link>
          </h3>
          <p className="caps mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-muted">
            <CategoryBadge category={{ key: run.categoryKey, label: categoryName }} />
            {facts && <span>{facts}</span>}
          </p>
        </div>
        {live && (
          <ButtonLink href={runPath(actSlug, run.slug)} className="self-start">
            {music ? `Back the ${periodOf(run.kind).noun}` : "See the fundraiser"}
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
    // An address that moved keeps its old word pointing here. Retired words are never reissued
    // (migration 0024), so this can only ever land on the musician who left it behind.
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(actPath(moved));
    notFound();
  }

  const { act, running, past } = profile;
  const labels = await getCategoryLabels();
  const categoryKeys = [...new Set([...running, ...past].map((r) => r.categoryKey))];
  const eyebrow = (act.type && MUSIC_EYEBROW[act.type]) || (categoryKeys.length === 1 ? categoryWords(categoryKeys[0]).organizerTitle : "Organizer");
  // Every organizer gets their own color of light, the same one here and on every fundraiser below.
  const theme = themeFor(slug);
  const website = safeWebsite(act.website);
  const handle = instagramHandle(act.instagram);
  // "They are" is right for a band and a guess for anybody else, so only music gets a pronoun.
  const band = act.type === "touring_band" || act.type === "house_act";

  return (
    <Theme name={theme}>
      <Nav current="/auctions" />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden border-b border-line">
          <HeroArt theme={theme} src={act.photoUrl} />
          <div className="hero-in relative mx-auto max-w-[1120px] px-7 pb-14 pt-[72px]">
            <Eyebrow className="mb-7">{eyebrow}</Eyebrow>
            <h1 className={`display max-w-[14ch] leading-[0.98] ${act.name.length > 14 ? "text-[clamp(40px,7vw,92px)]" : "text-[clamp(48px,8.4vw,108px)]"}`}>{act.name}</h1>
            {act.city && <p className="caps mt-6 text-[14.5px] leading-[2]">{act.city}</p>}
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
                What {band ? "they are" : act.type === "soloist" ? "the musician is" : `${act.name} is`} raising for
              </>
            ) : (
              <>No fundraiser is open right now</>
            )}
          </SectionHead>
          {running.length ? (
            <ul className="mt-12">
              {running.map((r) => (
                <RunRow key={r.slug} actSlug={slug} run={r} live categoryName={labels[r.categoryKey]} />
              ))}
            </ul>
          ) : (
            <p className="mt-10 max-w-[56ch] text-[16px] text-muted">
              {act.name} {band ? "have" : "has"} no fundraiser open on Door Money at the moment. The next one shows up
              here.
            </p>
          )}
        </Section>

        {past.length > 0 && (
          <Section className="border-t border-line">
            <SectionHead eyebrow="Finished">What came before</SectionHead>
            <ul className="mt-12">
              {past.map((r) => (
                <RunRow key={r.slug} actSlug={slug} run={r} live={false} categoryName={labels[r.categoryKey]} />
              ))}
            </ul>
          </Section>
        )}

        <NewsletterCTA source={`act:${slug}`} eyebrow="The next fundraiser" />
      </main>
      <Footer />
    </Theme>
  );
}
