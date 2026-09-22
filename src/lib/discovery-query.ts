import { supabaseServer } from "@/lib/supabase/server";
import {
  CANDIDATE_CAP, PAGE_SIZE, comparerFor, completeness, fundraiserMatches, hasOfferFilters,
  isClosingSoon, offerMatches, type DiscoveryOffer, type DiscoveryQuery, type Rankable,
} from "@/lib/discovery-filters";
import { SAMPLE_DISCOVERY } from "@/lib/sample-discovery";

/**
 * The discovery read model: what /fundraisers asks the database, and nothing more.
 *
 * This replaces `listOpenBoards` for discovery, which was one query for every organizer and then a
 * whole board for each of them: the fundraiser, its options, its public bids, its buyers and its
 * backers. Rendering a page of cards from that meant reading payment-adjacent history nobody was
 * going to look at, and the cost grew with the number of organizers.
 *
 * This is two reads, whatever the number of fundraisers:
 *
 *   1. `public_fundraiser_discovery`, narrowed on every fundraiser-level filter in the database,
 *      capped at CANDIDATE_CAP rows.
 *   2. `public_opportunity_discovery`, for those fundraisers' ids, in one `in (...)`.
 *
 * Both are the read-only views from migrations 0053 and 0054. Drafts are excluded by the views
 * themselves, a category that cannot publish has no published fundraiser to find, and neither view
 * carries a patron, a bid, an amount anybody paid, a fee, a Stripe id, evidence or a delivery
 * state. `anon` may select from both and write to neither.
 *
 * What is left for TypeScript is the part that genuinely cannot be a database filter without
 * becoming unreadable or untrue: the price rule, which is an OR across two columns; the place
 * match, which is a substring against a jsonb array with no index behind it; and the ranking, which
 * depends on how many options match and therefore cannot be decided before the options are read.
 * All three are in src/lib/discovery-filters.ts, pure and in one piece. The bound that makes this
 * safe is CANDIDATE_CAP, and the gap is written down in docs/DISCOVERY_CONTRACT.md.
 */

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Exactly the columns discovery reads. Kept as a literal so what leaves the database is greppable. */
const FUNDRAISER_COLUMNS = "id,slug,organizer_slug,organizer_name,title,category_key,status,activity_mode,activity_locations,activity_country_codes,discovery_tags,purpose,audience_description,sponsor_promise,fundraising_starts_on,fundraising_ends_on,bidding_closes_at,created_at";

const OFFER_COLUMNS = "id,run_id,name,price_cents,mode,buy_now_cents,effective_closes_at";

type LocationRow = { city?: string | null; region?: string | null; country_code?: string | null };

export type DiscoveryFundraiserRow = {
  id: string; slug: string; organizer_slug: string; organizer_name: string; title: string;
  category_key: string; status: string; activity_mode: string | null;
  activity_locations: LocationRow[] | null; activity_country_codes: string[] | null;
  discovery_tags: string[] | null; purpose: string | null; audience_description: string | null;
  sponsor_promise: string | null; fundraising_starts_on: string | null;
  fundraising_ends_on: string | null; bidding_closes_at: string | null; created_at: string;
};

type OfferRow = {
  id: string; run_id: string; name: string; price_cents: number;
  mode: string; buy_now_cents: number | null; effective_closes_at: string | null;
};

/** One card. Public, organizer-provided facts only, already in the shape the page draws. */
export type DiscoveryCardView = {
  id: string;
  title: string;
  href: string;
  organizerName: string;
  organizerHref: string;
  categoryKey: string;
  /** The organizer's own words. Shown, never filtered on. */
  purpose: string | null;
  audience: string | null;
  activityMode: string | null;
  locations: { city: string | null; region: string | null; countryCode: string | null }[];
  countryCodes: string[];
  /** The chosen discovery keys, for the page to turn into labels through the registry. */
  tags: string[];
  /** How many available options match the current filters. Equals `availableOffers` when none are set. */
  matchingOffers: number;
  availableOffers: number;
  /** The cheapest and dearest real number among the matching options, or null when there are none. */
  priceFromCents: number | null;
  priceToCents: number | null;
  /** Which sale methods the matching options are actually offered under. */
  hasFixed: boolean;
  hasBidding: boolean;
  /** The earliest close among the matching options, and whether that is inside seven days. */
  closesAt: string | null;
  closingSoon: boolean;
};

export type DiscoveryResult = {
  cards: DiscoveryCardView[];
  /** Fundraisers matching everything asked, before the page slice. */
  total: number;
  page: number;
  pageCount: number;
  /** True when more matched than one request ranks. The page says so rather than quietly cutting. */
  capped: boolean;
  /** False when no database is configured and the sample stood in. */
  live: boolean;
};

const runPathFor = (organizerSlug: string, runSlug: string) => `/${organizerSlug}/support-${runSlug}`;

function toOffer(row: OfferRow): DiscoveryOffer {
  return {
    id: row.id,
    runId: row.run_id,
    name: row.name,
    priceCents: row.price_cents,
    saleMethod: row.mode === "auction" ? "auction" : "fixed",
    buyNowCents: row.buy_now_cents,
    closesAt: row.effective_closes_at,
  };
}

/**
 * Everything a sponsor asked for, answered.
 *
 * Falls back to the in-memory sample when no database is connected, the way src/lib/boards.ts does,
 * so the page renders in a fresh checkout. The sample carries only what it can state honestly and
 * leaves the rest null; `live` says which it was, and a sample card is not evidence that anything
 * persisted.
 */
export async function findFundraisers(query: DiscoveryQuery, now: Date = new Date()): Promise<DiscoveryResult> {
  const { rows, offers, live } = configured() ? await read(query) : SAMPLE_DISCOVERY;
  const byRun = new Map<string, DiscoveryOffer[]>();
  for (const offer of offers) {
    const list = byRun.get(offer.runId);
    if (list) list.push(offer);
    else byRun.set(offer.runId, [offer]);
  }

  const offerFiltersOn = hasOfferFilters(query);
  const ranked: (Rankable & { card: DiscoveryCardView })[] = [];

  for (const row of rows) {
    const locations = (row.activity_locations ?? []).map((l) => ({
      city: l.city ?? null, region: l.region ?? null, countryCode: l.country_code ?? null,
    }));
    // Every fundraiser-level filter, applied here whatever the source. The database was asked the
    // same questions and agrees; the sample has no query behind it and is filtered only here.
    const facts = {
      categoryKey: row.category_key,
      activityMode: row.activity_mode,
      countryCodes: row.activity_country_codes ?? [],
      tags: row.discovery_tags ?? [],
      locations,
    };
    if (!fundraiserMatches(facts, query)) continue;

    const available = byRun.get(row.id) ?? [];
    const matching = offerFiltersOn ? available.filter((o) => offerMatches(o, query, now)) : available;
    // The grain rule: an offer-level filter includes a fundraiser only through an option that
    // satisfies all of them together.
    if (offerFiltersOn && matching.length === 0) continue;

    const prices = matching.flatMap((o) => (o.buyNowCents === null ? [o.priceCents] : [o.priceCents, o.buyNowCents]));
    const closes = matching.map((o) => o.closesAt).filter((c): c is string => Boolean(c)).sort();
    const soonest = closes[0] ?? null;

    ranked.push({
      id: row.id,
      matchingOffers: matching.length,
      availableOffers: available.length,
      completeness: completeness({
        purpose: row.purpose,
        audience: row.audience_description,
        sponsorPromise: row.sponsor_promise,
        activityMode: row.activity_mode,
        purposeTags: row.discovery_tags ?? [],
        audienceTags: row.discovery_tags ?? [],
        countryCodes: row.activity_country_codes ?? [],
        locations,
      }),
      createdAt: row.created_at,
      soonestCloseAt: soonest,
      card: {
        id: row.id,
        title: row.title,
        href: runPathFor(row.organizer_slug, row.slug),
        organizerName: row.organizer_name,
        organizerHref: `/${row.organizer_slug}`,
        categoryKey: row.category_key,
        purpose: row.purpose,
        audience: row.audience_description,
        activityMode: row.activity_mode,
        locations,
        countryCodes: row.activity_country_codes ?? [],
        tags: row.discovery_tags ?? [],
        matchingOffers: matching.length,
        availableOffers: available.length,
        priceFromCents: prices.length ? Math.min(...prices) : null,
        priceToCents: prices.length ? Math.max(...prices) : null,
        hasFixed: matching.some((o) => o.saleMethod === "fixed"),
        hasBidding: matching.some((o) => o.saleMethod === "auction"),
        closesAt: soonest,
        closingSoon: isClosingSoon(soonest, now),
      },
    });
  }

  ranked.sort(comparerFor(query.sort));
  const total = ranked.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * PAGE_SIZE;

  return {
    cards: ranked.slice(start, start + PAGE_SIZE).map((r) => r.card),
    total,
    page,
    pageCount,
    capped: rows.length >= CANDIDATE_CAP,
    live,
  };
}

/**
 * The two reads.
 *
 * Every fundraiser-level filter that the database can answer exactly is asked of the database:
 * category, activity mode, country and the discovery tags. Funding purpose and audience type are
 * two separate questions over one array column, so they are two separate `overlaps` filters, which
 * PostgREST combines with AND: a sponsor asking for "travel" and "an online audience" wants both,
 * not either.
 *
 * Only open and live fundraisers. A closed one is in the view (a link on a poster still has to
 * work) but nobody can sponsor it, so it is not a discovery result.
 */
async function read(query: DiscoveryQuery): Promise<{ rows: DiscoveryFundraiserRow[]; offers: DiscoveryOffer[]; live: boolean }> {
  const sb = await supabaseServer();
  let q = sb.from("public_fundraiser_discovery").select(FUNDRAISER_COLUMNS).in("status", ["open", "live"]);
  if (query.categories.length) q = q.in("category_key", query.categories);
  if (query.modes.length) q = q.in("activity_mode", query.modes);
  if (query.countries.length) q = q.overlaps("activity_country_codes", query.countries);
  if (query.purposes.length) q = q.overlaps("discovery_tags", query.purposes);
  if (query.audiences.length) q = q.overlaps("discovery_tags", query.audiences);

  const { data, error } = await q.limit(CANDIDATE_CAP);
  if (error) {
    // A discovery page that cannot read is an empty discovery page, not a crash and not the sample:
    // standing in with example fundraisers when the database is right there would be a lie.
    console.error("discovery fundraiser query failed", error.message);
    return { rows: [], offers: [], live: true };
  }
  const rows = (data ?? []) as DiscoveryFundraiserRow[];
  if (rows.length === 0) return { rows, offers: [], live: true };

  const { data: offerRows, error: offerError } = await sb
    .from("public_opportunity_discovery")
    .select(OFFER_COLUMNS)
    .in("run_id", rows.map((r) => r.id));
  if (offerError) console.error("discovery offer query failed", offerError.message);

  return { rows, offers: ((offerRows ?? []) as OfferRow[]).map(toOffer), live: true };
}

/**
 * The countries published fundraisers actually record, for the country question on the filters.
 *
 * One narrow read of one derived column, so the page offers only places that exist rather than a
 * list of every country on earth. Deliberately unfiltered by the sponsor's current choices: a
 * country they have already ticked has to stay on the list so it can be unticked again.
 *
 * Empty is a real answer and the page then asks no country question at all. Every fundraiser
 * published so far records no activity location, so empty is what this returns today.
 */
export async function discoveryCountries(): Promise<string[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("public_fundraiser_discovery")
    .select("activity_country_codes")
    .in("status", ["open", "live"])
    .limit(CANDIDATE_CAP);
  if (error) {
    console.error("discovery country facet query failed", error.message);
    return [];
  }
  const codes = new Set<string>();
  for (const row of (data ?? []) as { activity_country_codes: string[] | null }[]) {
    for (const code of row.activity_country_codes ?? []) codes.add(code);
  }
  return [...codes].sort();
}
