import type { Metadata } from "next";
import Link from "next/link";
import { Theme } from "@/components/Theme";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ButtonLink } from "@/components/Button";
import { FilterPanel } from "@/components/discovery/FilterPanel";
import { ActiveFilters } from "@/components/discovery/ActiveFilters";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { ViewSwitch } from "@/components/discovery/ViewSwitch";
import { getCategoryLabels } from "@/lib/category-registry";
import { getDiscoveryRegistry } from "@/lib/discovery-registry";
import { discoveryChoicesForCategories } from "@/lib/discovery";
import { discoveryCountries, findFundraisers, type DiscoveryStatus } from "@/lib/discovery-query";
import { SORTS, hasFilters, hasOfferFilters, hrefWith, parseQuery, type RawParams } from "@/lib/discovery-filters";
import { AVAILABILITY_NOTE } from "@/lib/starting-categories";

export const metadata: Metadata = {
  title: "Find a project to sponsor",
  description:
    "Every open fundraiser on Door Money: what each one funds, who it reaches, and the sponsorship options still open. Search by name, or filter by category, place, funding purpose, audience and price.",
  // One address for search engines too, now that the old one redirects here.
  alternates: { canonical: "/fundraisers" },
};

/*
  Sponsor discovery.

  This page is at /fundraisers. It began at /auctions, which is in sent email and in pasted widget
  snippets, so that address redirects here and keeps doing so (next.config.ts): decision 13 settled
  that an address outlives the words on the page. Not everything here is bidding, and the
  marketplace is not called an auction: each sponsorship is fixed price or open to bids, and the
  organizer decides which.

  The word on the page is "project". A fundraiser is still what the thing is, in the database, in
  every address and in every other part of the site; "project" is the display word for this one
  surface, where a sponsor is looking at the work rather than at the mechanics of funding it, and
  the nav's link to it says "Browse projects" for the same reason.

  Everything a sponsor chooses lives in the query string and nothing lives in client state, so a
  filtered page can be shared, bookmarked and reloaded, and the back button behaves. The filters are
  one plain GET form; the chips, the sort and the pages are plain links. There is no JavaScript
  needed to use this page and no personalization in what it returns.

  The one thing that is not in the address is the layout. Tiles or rows is the reader's own choice,
  kept in their browser (src/lib/discovery-view.ts), and it changes nothing about what was asked or
  what came back: the same list, fetched once and ranked once, is drawn one way or the other by CSS.

  The read is src/lib/discovery-query.ts, which is two queries against the two public read-only
  views whatever the number of fundraisers. It deliberately does not use listOpenBoards: that loads
  a whole board per organizer, bids, buyers and backers included, which is a page of cards paid for
  with payment history nobody is going to read.

  This page composes Nav, Theme and Footer itself rather than using Page, whose hero is a full
  stage for a marketing headline. Discovery wants the heading small and the results high, and the
  shared shell keeps its own defaults for every other page.
*/

type Props = { searchParams: Promise<RawParams> };

export default async function FundraisersPage({ searchParams }: Props) {
  // App Router: searchParams is a Promise and has to be awaited before it is read.
  const params = await searchParams;

  const [labels, registry] = await Promise.all([getCategoryLabels(), getDiscoveryRegistry()]);
  // Any well-formed tag is accepted from the address, including one scoped to a category the
  // sponsor has not ticked: a shared link has to reproduce its own page, and a key nothing carries
  // narrows to nothing rather than quietly widening the list. What the panel *offers* is narrower,
  // and follows the categories chosen.
  const query = parseQuery(params, { categories: Object.keys(labels) });
  const facets = discoveryChoicesForCategories(registry, "fundraiser", query.categories);

  const [result, countries] = await Promise.all([findFundraisers(query), discoveryCountries()]);

  const filtersActive = hasFilters(query);
  const offerFiltersActive = hasOfferFilters(query);
  const chipLabels: Record<string, string> = {
    ...labels,
    ...Object.fromEntries(registry.tags.map((t) => [t.key, t.label])),
  };
  const tagLabel = new Map(registry.tags.map((t) => [t.key, t.label]));
  const unavailable = result.status === "unavailable";

  return (
    <Theme name="magenta">
      <Nav current="/fundraisers" />
      <main id="main" className="flex-1">
        {/* A compact heading: the light is on the results, not on a headline. */}
        <section className="pool border-b border-line">
          <div className="hero-in mx-auto w-full max-w-[1120px] px-7 pb-9 pt-14 max-md:pt-10">
            <h1 className="display max-w-[16ch] text-[clamp(34px,4.8vw,58px)] leading-[0.98]">
              Find a project to <em className="text-accent-ink">sponsor.</em>
            </h1>
            <p className="mt-4 text-[17px] text-muted">Explore the work. See what sponsorship includes.</p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[1120px] px-7 pb-[90px] pt-8">
          <FilterPanel
            query={query}
            categories={Object.entries(labels).map(([key, label]) => ({ key, label }))}
            facets={facets}
            countries={countries}
          />

          <div className="mt-6">
            <ActiveFilters query={query} labels={chipLabels} />
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line pb-5">
            <h2 id="results-heading" className="heading text-[22px]">
              {unavailable ? "Projects unavailable" : countLine(result.total, filtersActive, result.everyResultHasOffers)}
            </h2>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <nav aria-label="Sort" className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="caps text-[14px] text-muted">Sort</span>
                {SORTS.map((s) => (
                  <Link
                    key={s.key}
                    href={hrefWith(query, { sort: s.key, page: result.page })}
                    aria-current={query.sort === s.key ? "true" : undefined}
                    className={`caps text-[14px] no-underline ${
                      query.sort === s.key ? "text-accent-ink underline decoration-1 underline-offset-4" : "text-ink hover:text-accent-ink"
                    }`}
                  >
                    {s.label}
                  </Link>
                ))}
              </nav>
              <ViewSwitch />
            </div>
          </div>

          {query.sort === "relevant" && result.total > 1 && (
            <p className="mb-7 text-[14.5px] text-muted">
              Most relevant puts the projects with the most matching sponsorship options first.
              Nobody pays for a place in this list.
            </p>
          )}

          {result.capped && (
            <p className="mb-7 text-[14.5px] text-accent-ink">
              More projects match than one page can rank. Narrow the list to see the rest.
            </p>
          )}

          {/*
            Tiles are one height. Every tile in the grid is sized to the tallest of them
            (`grid-auto-rows: 1fr`, and no items-start, so each one stretches to fill the row it is
            in), and the card pins its action block to the bottom, so the buttons line up across
            the page however much any one organizer wrote. The card clamps its own prose, which is
            what keeps that shared height a reasonable one.

            One column and rows both put it back: a height shared down a single column is only a
            column of holes, and a row's height is its own.
          */}
          {result.cards.length === 0 ? (
            <Empty filtersActive={filtersActive} status={result.status} failedRead={result.failedRead} />
          ) : (
            <ul
              aria-labelledby="results-heading"
              className="discovery-rows:grid-cols-1 discovery-rows:gap-0 discovery-rows:border-t discovery-rows:border-line discovery-rows:[grid-auto-rows:auto] grid gap-[30px] md:grid-cols-2 md:[grid-auto-rows:1fr]"
            >
              {result.cards.map((card) => (
                <DiscoveryCard
                  key={card.id}
                  card={card}
                  categoryLabel={labels[card.categoryKey] ?? null}
                  tagLabels={card.tags.map((t) => tagLabel.get(t)).filter((l): l is string => Boolean(l))}
                  filtersActive={offerFiltersActive}
                />
              ))}
            </ul>
          )}

          {result.pageCount > 1 && (
            <nav aria-label="Pages" className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-6">
              {result.page > 1 ? (
                <ButtonLink href={hrefWith(query, { page: result.page - 1 })} variant="ghost">
                  Previous
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="caps text-[14px] text-muted">
                Page {result.page} of {result.pageCount}
              </span>
              {result.page < result.pageCount ? (
                <ButtonLink href={hrefWith(query, { page: result.page + 1 })} variant="ghost">
                  Next
                </ButtonLink>
              ) : (
                <span />
              )}
            </nav>
          )}

          {/* The organizer's way in, one line, below the results so it never sits among the controls. */}
          <aside className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-line pt-8">
            <p className="text-[15px] leading-[1.6] text-muted">
              Organizers choose what they offer, set the prices and keep the final say.
            </p>
            <ButtonLink href="/list" variant="ghost" arrow>Create a fundraiser</ButtonLink>
          </aside>
        </div>
      </main>
      {/* The footer carries the one newsletter ask, so this page adds no second one. */}
      <Footer />
    </Theme>
  );
}

/**
 * How many matched, said plainly. The number is the whole result, not the page.
 *
 * "Accepting sponsors" is said only when every counted project has at least one option open to
 * buy. When any has none, the count is the count and nothing more; nothing is dropped from it to
 * earn the phrase.
 */
function countLine(total: number, filtersActive: boolean, everyResultHasOffers: boolean): string {
  if (total === 0) return filtersActive ? "No projects match" : "No projects are open";
  const noun = total === 1 ? "project" : "projects";
  if (filtersActive) return `${total} ${noun} ${total === 1 ? "matches" : "match"}`;
  return everyResultHasOffers ? `${total} ${noun} accepting sponsors` : `${total} ${noun}`;
}

/**
 * Nothing matched, said honestly.
 *
 * It never suggests the filters were wrong or that something is coming. With no database connected
 * it says so, because an empty page and an unconfigured one are different facts. A read that
 * failed is a third fact and gets its own words: the list could not be read, which is not the same
 * as nothing being open, and the sample never stands in for it.
 */
function Empty({ filtersActive, status, failedRead }: { filtersActive: boolean; status: DiscoveryStatus; failedRead: "fundraisers" | "offers" | null }) {
  if (status === "unavailable") {
    return (
      <div className="edge bg-panel px-[26px] py-9" role="status">
        <p className="text-[15px] leading-[1.7]">
          {failedRead === "offers"
            ? "Door Money could not read the sponsorship options just now, so it is not listing the projects without them."
            : "Door Money could not read the projects just now."}
        </p>
        <p className="mt-3 text-[15px] leading-[1.7] text-muted">Reload the page to try again.</p>
      </div>
    );
  }
  return (
    <div className="edge bg-panel px-[26px] py-9">
      {filtersActive ? (
        <>
          <p className="text-[15px] leading-[1.7]">
            No open project matches all of those filters right now.
          </p>
          <p className="mt-3 text-[15px] leading-[1.7] text-muted">
            Removing one of them will widen the list.
          </p>
          <ButtonLink href="/fundraisers" variant="ghost" className="mt-6">
            Clear all filters
          </ButtonLink>
        </>
      ) : (
        <p className="text-[15px] leading-[1.7]">
          No project is open to sponsors at the moment. {AVAILABILITY_NOTE}
        </p>
      )}
      {/* An unconfigured app and an empty one are different facts, and the page says which. */}
      {status === "sample" && (
        <p className="mt-4 text-[14.5px] text-muted">
          No database is connected, so this page is showing the built-in sample. The sample records
          none of the structured discovery fields, so most filters correctly match nothing.
        </p>
      )}
    </div>
  );
}

export const revalidate = 0;
