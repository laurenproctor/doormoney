import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { ButtonLink } from "@/components/Button";
import { NewsletterCTA } from "@/components/Newsletter";
import { FilterPanel } from "@/components/discovery/FilterPanel";
import { ActiveFilters } from "@/components/discovery/ActiveFilters";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { getCategoryLabels } from "@/lib/category-registry";
import { getDiscoveryRegistry } from "@/lib/discovery-registry";
import { discoveryChoicesForCategories } from "@/lib/discovery";
import { discoveryCountries, findFundraisers } from "@/lib/discovery-query";
import { SORTS, hasFilters, hasOfferFilters, hrefWith, parseQuery, type RawParams } from "@/lib/discovery-filters";
import { AVAILABILITY_NOTE } from "@/lib/starting-categories";

export const metadata: Metadata = {
  title: "Find a sponsorship",
  description:
    "Every open fundraiser on Door Money: what each one funds, who it reaches, and the sponsorship options still open. Narrow by category, place, funding purpose, audience, price and how it is sold.",
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

  Everything a sponsor chooses lives in the query string and nothing lives in client state, so a
  filtered page can be shared, bookmarked and reloaded, and the back button behaves. The filters are
  one plain GET form; the chips, the sort and the pages are plain links. There is no JavaScript
  needed to use this page and no personalization in what it returns.

  The read is src/lib/discovery-query.ts, which is two queries against the two public read-only
  views whatever the number of fundraisers. It deliberately does not use listOpenBoards: that loads
  a whole board per organizer, bids, buyers and backers included, which is a page of cards paid for
  with payment history nobody is going to read.
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

  return (
    <Page
      theme="magenta"
      current="/fundraisers"
      eyebrow="Organizers raising now"
      title="Find a"
      accent="sponsorship"
      headline="md"
      intro={
        <p>
          Every open fundraiser on Door Money: who is raising, what the funding is for, who it
          reaches, and which sponsorship options are still open. Each sponsorship is either fixed
          price or open to bids; the organizer decides which, and sets the price.
        </p>
      }
    >
      <div className="mx-auto w-full max-w-[1120px] px-7 pb-[90px]">
        <div className="grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-12">
          <FilterPanel
            query={query}
            categories={Object.entries(labels).map(([key, label]) => ({ key, label }))}
            facets={facets}
            countries={countries}
          />

          <div>
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-b border-line pb-5">
              <h2 className="heading text-[22px]">{countLine(result.total, filtersActive)}</h2>
              <nav aria-label="Sort" className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="caps text-[14px] text-muted">Sort</span>
                {SORTS.map((s) => (
                  <Link
                    key={s.key}
                    href={hrefWith(query, { sort: s.key })}
                    aria-current={query.sort === s.key ? "true" : undefined}
                    className={`caps text-[14px] no-underline ${
                      query.sort === s.key ? "text-accent-ink underline decoration-1 underline-offset-4" : "text-ink hover:text-accent-ink"
                    }`}
                  >
                    {s.label}
                  </Link>
                ))}
              </nav>
            </div>

            <ActiveFilters query={query} labels={chipLabels} />

            {query.sort === "relevant" && result.total > 1 && (
              <p className="mb-7 text-[14.5px] text-muted">
                Most relevant puts the fundraisers with the most matching sponsorship options first,
                then the ones that answered the most about what the funding enables, who it reaches
                and what a sponsor receives. Nobody pays for a place in this list.
              </p>
            )}

            {result.capped && (
              <p className="mb-7 text-[14.5px] text-accent-ink">
                More fundraisers match than one page can rank. Narrow the list to see the rest.
              </p>
            )}

            {result.cards.length === 0 ? (
              <Empty filtersActive={filtersActive} live={result.live} />
            ) : (
              <div className="grid gap-[30px] md:grid-cols-2">
                {result.cards.map((card) => (
                  <DiscoveryCard
                    key={card.id}
                    card={card}
                    categoryLabel={labels[card.categoryKey] ?? null}
                    tagLabels={card.tags.map((t) => tagLabel.get(t)).filter((l): l is string => Boolean(l))}
                    filtersActive={offerFiltersActive}
                  />
                ))}
              </div>
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

            {/* The organizer's way in, kept below the results so it never sits among the controls. */}
            <aside className="edge mt-12 flex flex-col items-start gap-3.5 bg-panel px-[26px] py-7">
              <div className="caps text-[14.5px] text-accent-ink">For organizers</div>
              <div className="heading text-[clamp(24px,3vw,32px)] leading-[1.05]">Raise money for your own work</div>
              <p className="text-[15px] leading-[1.7] text-muted">
                Organizers choose what they offer, set the prices and keep the final say. {AVAILABILITY_NOTE}
              </p>
              <ButtonLink href="/list">Create a fundraiser</ButtonLink>
            </aside>
          </div>
        </div>
      </div>

      <NewsletterCTA source="auctions" eyebrow="The next fundraiser" />
    </Page>
  );
}

/** How many matched, said plainly. The number is the whole result, not the page. */
function countLine(total: number, filtersActive: boolean): string {
  if (total === 0) return filtersActive ? "No fundraisers match" : "No fundraisers are open";
  const noun = total === 1 ? "fundraiser" : "fundraisers";
  return filtersActive ? `${total} ${noun} match` : `${total} ${noun} open`;
}

/**
 * Nothing matched, said honestly.
 *
 * It never suggests the filters were wrong or that something is coming. With no database connected
 * it says so, because an empty page and an unconfigured one are different facts.
 */
function Empty({ filtersActive, live }: { filtersActive: boolean; live: boolean }) {
  return (
    <div className="edge bg-panel px-[26px] py-9">
      {filtersActive ? (
        <>
          <p className="text-[15px] leading-[1.7]">
            No open fundraiser matches all of those filters right now.
          </p>
          <p className="mt-3 text-[15px] leading-[1.7] text-muted">
            Removing one of them will widen the list. Organizers add sponsorship options as they
            prepare, so the answer can change from one week to the next.
          </p>
          <ButtonLink href="/fundraisers" variant="ghost" className="mt-6">
            Clear all filters
          </ButtonLink>
        </>
      ) : (
        <p className="text-[15px] leading-[1.7]">
          No fundraiser is open to sponsors at the moment. {AVAILABILITY_NOTE}
        </p>
      )}
      {/* An unconfigured app and an empty one are different facts, and the page says which. */}
      {!live && (
        <p className="mt-4 text-[14.5px] text-muted">
          No database is connected, so this page is showing the built-in sample. The sample records
          none of the structured discovery fields, so most filters correctly match nothing.
        </p>
      )}
    </div>
  );
}

export const revalidate = 0;
