import { supabaseServer } from "@/lib/supabase/server";
import {
  CANDIDATE_CAP, PAGE_SIZE, comparerFor, completeness, fundraiserMatches, hasOfferFilters,
  isClosingSoon, nameSearchFilter, offerMatches, routesWithinBudget,
  type DiscoveryOffer, type DiscoveryQuery, type PriceRoute, type PricedRoute, type Rankable,
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
 * Both are the read-only views from migrations 0053, 0054 and 0059. Drafts are excluded by the
 * views themselves, a category that cannot publish has no published fundraiser to find, and
 * neither view carries a patron, a bid, an amount anybody paid, a fee, a Stripe id, evidence or a
 * delivery state. `anon` may select from both and write to neither. The organizer's photo and an
 * option's placement (0059) come through the same two reads: there is no per-card query.
 *
 * What is left for TypeScript is the part that genuinely cannot be a database filter without
 * becoming unreadable or untrue: the price rule, which is an OR across two columns; the place
 * match, which is a substring against a jsonb array with no index behind it; the literal half of
 * the name search; and the ranking, which depends on how many options match and therefore cannot
 * be decided before the options are read. All of it is in src/lib/discovery-filters.ts, pure and
 * in one piece. The bound that makes this safe is CANDIDATE_CAP, and the gap is written down in
 * docs/DISCOVERY_CONTRACT.md.
 */

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Exactly the columns discovery reads. Kept as a literal so what leaves the database is greppable. */
const FUNDRAISER_COLUMNS = "id,slug,organizer_slug,organizer_name,title,category_key,status,activity_mode,activity_locations,activity_country_codes,discovery_tags,purpose,audience_description,sponsor_promise,fundraising_starts_on,fundraising_ends_on,bidding_closes_at,created_at,organizer_photo_url";

const OFFER_COLUMNS = "id,run_id,name,price_cents,mode,buy_now_cents,effective_closes_at,placement_description";

/** How many matching options a card previews. The count beside them says how many there are. */
export const PREVIEW_LIMIT = 3;

type LocationRow = { city?: string | null; region?: string | null; country_code?: string | null };

export type DiscoveryFundraiserRow = {
  id: string; slug: string; organizer_slug: string; organizer_name: string; title: string;
  category_key: string; status: string; activity_mode: string | null;
  activity_locations: LocationRow[] | null; activity_country_codes: string[] | null;
  discovery_tags: string[] | null; purpose: string | null; audience_description: string | null;
  sponsor_promise: string | null; fundraising_starts_on: string | null;
  fundraising_ends_on: string | null; bidding_closes_at: string | null; created_at: string;
  /** The organizer's own public photo (acts.photo_url, through the view since 0059). Null when they added none. */
  organizer_photo_url: string | null;
};

type OfferRow = {
  id: string; run_id: string; name: string; price_cents: number;
  mode: string; buy_now_cents: number | null; effective_closes_at: string | null;
  /** The offer contract's placement, through the public projection (0059). Null when unwritten. */
  placement_description: string | null;
};

/** One of the options that matched, in enough detail to be judged without opening it. */
export type DiscoveryPreview = {
  id: string;
  /** The organizer's own name for the option, or the template's name where they gave none. */
  name: string;
  saleMethod: "fixed" | "auction";
  /** The organizer's number: the fixed price, or where the bidding opens. Never a suggestion. */
  priceCents: number;
  /** A bidding option's take-it-now number, where the organizer set one. */
  buyNowCents: number | null;
  /** Where the sponsor appears, in the organizer's own words, or null when they have not written it. */
  placement: string | null;
  /**
   * The ways this option can be bought that fit the sponsor's budget, cheapest first; every way
   * when no budget was set. Each carries the number it is bought at, so a preview's price is
   * always this option's own.
   */
  routes: PricedRoute[];
};

export type PriceSpan = { fromCents: number; toCents: number };

/**
 * The prices on a card, one span per buying route, built only from the matching options and only
 * from the routes that fit the budget. Kept apart on purpose: a fixed price, an opening bid and a
 * take-it-now number are three different things to be told, and "from $150" over the lot of them
 * would promise a $150 sponsorship that nobody is selling.
 */
export type DiscoveryPricing = {
  fixed: PriceSpan | null;
  openingBid: PriceSpan | null;
  buyNow: PriceSpan | null;
  /** The lowest number among those spans, with the option and route it belongs to. */
  lowest: { offerId: string; offerName: string; route: PriceRoute; cents: number } | null;
};

/** One card. Public, organizer-provided facts only, already in the shape the page draws. */
export type DiscoveryCardView = {
  id: string;
  title: string;
  href: string;
  organizerName: string;
  organizerHref: string;
  /**
   * The organizer's public photo, or null. It is a picture of who is raising, not documentation of
   * the work or its delivery, and a page that draws it must not say otherwise. Nothing stands in
   * for a missing one.
   */
  organizerPhotoUrl: string | null;
  categoryKey: string;
  /** The organizer's own words. Shown, never filtered on. */
  purpose: string | null;
  audience: string | null;
  /**
   * The fundraiser-level statement of what a sponsor receives. It is the organizer's statement
   * about the fundraiser, not a promise that every option includes every part of it; what one
   * option includes is that option's own terms.
   */
  sponsorPromise: string | null;
  activityMode: string | null;
  locations: { city: string | null; region: string | null; countryCode: string | null }[];
  countryCodes: string[];
  /** The chosen discovery keys, for the page to turn into labels through the registry. */
  tags: string[];
  /**
   * How many available options match the current filters. Equals `availableOffers` when none are
   * set. Both count sponsorship options, which is to say `lots` rows a sponsor could buy now; they
   * are not a count of remaining spots, which discovery does not read.
   */
  matchingOffers: number;
  availableOffers: number;
  /** Up to PREVIEW_LIMIT of the matching options, cheapest fitting route first. */
  previews: DiscoveryPreview[];
  pricing: DiscoveryPricing;
  /** Which sale methods the matching options are actually offered under. */
  hasFixed: boolean;
  hasBidding: boolean;
  /** The earliest close among the matching options, and whether that is inside seven days. */
  closesAt: string | null;
  closingSoon: boolean;
};

/**
 * Where the answer came from, and whether there is one.
 *
 *   live         the database answered.
 *   sample       no database is configured and the built-in sample stood in.
 *   unavailable  a database is configured and a read failed. There are no cards, and the page must
 *                say the list could not be read rather than that nothing is open. The sample never
 *                stands in for a database that is there and not answering.
 */
export type DiscoveryStatus = "live" | "sample" | "unavailable";

export type DiscoveryResult = {
  cards: DiscoveryCardView[];
  /** Fundraisers matching everything asked, before the page slice. Zero when unavailable. */
  total: number;
  page: number;
  pageCount: number;
  /** True when more matched than one request ranks. The page says so rather than quietly cutting. */
  capped: boolean;
  /**
   * True when every fundraiser counted in `total` has at least one option open to buy, so the
   * count may say they are accepting sponsors. False when any has none, and false when there are
   * none at all. Nothing is dropped from the count to make this true.
   */
  everyResultHasOffers: boolean;
  status: DiscoveryStatus;
  /** Which read failed when `status` is unavailable. An offer failure is not zero options; it is unknown. */
  failedRead: "fundraisers" | "offers" | null;
  /** False when no database is configured and the sample stood in. Kept beside `status` for existing readers. */
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
    placement: row.placement_description,
  };
}

type Read =
  | { rows: DiscoveryFundraiserRow[]; offers: DiscoveryOffer[]; status: "live" | "sample" }
  | { rows: []; offers: []; status: "unavailable"; failedRead: "fundraisers" | "offers" };

/**
 * Everything a sponsor asked for, answered.
 *
 * Falls back to the in-memory sample when no database is connected, the way src/lib/boards.ts does,
 * so the page renders in a fresh checkout. The sample carries only what it can state honestly and
 * leaves the rest null; `status` says which it was, and a sample card is not evidence that anything
 * persisted.
 */
export async function findFundraisers(query: DiscoveryQuery, now: Date = new Date()): Promise<DiscoveryResult> {
  const source: Read = configured() ? await read(query) : { ...SAMPLE_DISCOVERY, status: "sample" };
  if (source.status === "unavailable") {
    return { cards: [], total: 0, page: 1, pageCount: 1, capped: false, everyResultHasOffers: false, status: "unavailable", failedRead: source.failedRead, live: true };
  }
  const { rows, offers, status } = source;
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
      title: row.title,
      organizerName: row.organizer_name,
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

    const previews = matching
      .map((o) => toPreview(o, query))
      .sort((a, b) => a.routes[0].cents - b.routes[0].cents || a.name.localeCompare(b.name));
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
        organizerPhotoUrl: row.organizer_photo_url?.trim() || null,
        categoryKey: row.category_key,
        purpose: row.purpose,
        audience: row.audience_description,
        sponsorPromise: row.sponsor_promise,
        activityMode: row.activity_mode,
        locations,
        countryCodes: row.activity_country_codes ?? [],
        tags: row.discovery_tags ?? [],
        matchingOffers: matching.length,
        availableOffers: available.length,
        previews: previews.slice(0, PREVIEW_LIMIT),
        pricing: pricingOf(previews),
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
    everyResultHasOffers: total > 0 && ranked.every((r) => r.availableOffers > 0),
    status,
    failedRead: null,
    live: status === "live",
  };
}

/**
 * One matching option as a card previews it. The routes are the ones that fit the budget, which
 * is never empty for a matching option: a price match is precisely an option with a fitting route,
 * and with no budget every route fits.
 */
function toPreview(offer: DiscoveryOffer, query: DiscoveryQuery): DiscoveryPreview {
  const routes = routesWithinBudget(offer, query).sort((a, b) => a.cents - b.cents);
  return {
    id: offer.id,
    name: offer.name,
    saleMethod: offer.saleMethod,
    priceCents: offer.priceCents,
    buyNowCents: offer.buyNowCents,
    placement: offer.placement,
    routes,
  };
}

/** The spans, one per route, from the fitting routes of every matching option. */
function pricingOf(previews: DiscoveryPreview[]): DiscoveryPricing {
  const spans: Record<PriceRoute, PriceSpan | null> = { fixed: null, opening_bid: null, buy_now: null };
  let lowest: DiscoveryPricing["lowest"] = null;
  for (const p of previews) {
    for (const r of p.routes) {
      const span = spans[r.route];
      spans[r.route] = span
        ? { fromCents: Math.min(span.fromCents, r.cents), toCents: Math.max(span.toCents, r.cents) }
        : { fromCents: r.cents, toCents: r.cents };
      if (!lowest || r.cents < lowest.cents) lowest = { offerId: p.id, offerName: p.name, route: r.route, cents: r.cents };
    }
  }
  return { fixed: spans.fixed, openingBid: spans.opening_bid, buyNow: spans.buy_now, lowest };
}

/**
 * The two reads.
 *
 * Every fundraiser-level filter that the database can answer exactly is asked of the database:
 * category, activity mode, country, the discovery tags and the name search. Funding purpose and
 * audience type are two separate questions over one array column, so they are two separate
 * `overlaps` filters, which PostgREST combines with AND: a sponsor asking for "travel" and "an
 * online audience" wants both, not either. The name search is one `or` across the title and the
 * organizer's name, applied before the cap so a name that exists is found rather than cut off; its
 * literal half is checked again in TypeScript (nameMatches).
 *
 * Only open and live fundraisers. A closed one is in the view (a link on a poster still has to
 * work) but nobody can sponsor it, so it is not a discovery result.
 *
 * A read that fails is reported as unavailable, never as empty: an empty discovery page says
 * nothing is open, and that is not what happened. The sample never stands in for a configured
 * database. An offer read that fails is treated the same way, because a card with unknown options
 * would show unknown availability as zero.
 */
async function read(query: DiscoveryQuery): Promise<Read> {
  const sb = await supabaseServer();
  let q = sb.from("public_fundraiser_discovery").select(FUNDRAISER_COLUMNS).in("status", ["open", "live"]);
  if (query.categories.length) q = q.in("category_key", query.categories);
  if (query.modes.length) q = q.in("activity_mode", query.modes);
  if (query.countries.length) q = q.overlaps("activity_country_codes", query.countries);
  if (query.purposes.length) q = q.overlaps("discovery_tags", query.purposes);
  if (query.audiences.length) q = q.overlaps("discovery_tags", query.audiences);
  if (query.q) q = q.or(nameSearchFilter(query.q));

  const { data, error } = await q.limit(CANDIDATE_CAP);
  if (error) {
    console.error("discovery fundraiser query failed", error.message);
    return { rows: [], offers: [], status: "unavailable", failedRead: "fundraisers" };
  }
  const rows = (data ?? []) as DiscoveryFundraiserRow[];
  if (rows.length === 0) return { rows, offers: [], status: "live" };

  const { data: offerRows, error: offerError } = await sb
    .from("public_opportunity_discovery")
    .select(OFFER_COLUMNS)
    .in("run_id", rows.map((r) => r.id));
  if (offerError) {
    console.error("discovery offer query failed", offerError.message);
    return { rows: [], offers: [], status: "unavailable", failedRead: "offers" };
  }

  return { rows, offers: ((offerRows ?? []) as OfferRow[]).map(toOffer), status: "live" };
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
