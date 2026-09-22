/**
 * What a sponsor asked for, and how Door Money answers it.
 *
 * Pure: parsing the query string, deciding which offers match, ranking the fundraisers, and
 * building the next address. No database, no React, importable from a client component.
 *
 * Two rules govern everything here.
 *
 * **Structured only.** Every filter reads a structured, organizer-provided field: the category key,
 * the activity mode, the derived country codes, the discovery tags, `lots.mode`, `lots.price_cents`.
 * Nothing is inferred from `purpose`, `description`, `audience_description` or `sponsor_promise`.
 * Those are shown on a card and are never searched, because reading a filter out of prose would
 * claim a fact the organizer never stated (CLAUDE.md; docs/DISCOVERY_CONTRACT.md).
 *
 * **The grain is the fundraiser, the offer filters are real.** The page lists fundraisers, but
 * price, sale method and closing soon are facts about a sponsorship option. A fundraiser is
 * included when at least one of its currently available options matches all of them at once, which
 * is not the same as matching them separately: a $200 fixed-price option and a $9,000 bidding one
 * do not make the fundraiser a match for "bidding under $500".
 */

// ---------------------------------------------------------------
// Sale methods, in the product's words
//
// `lots.mode` stores 'fixed' and 'auction'. The product calls them fixed price and bidding, and
// the marketplace is never called an auction (decision 17, and the voice rules). The URL carries
// the product's word and this is the only place the stored one appears.
// ---------------------------------------------------------------

export const SALE_FILTERS = [
  { param: "fixed", stored: "fixed", label: "Fixed price" },
  { param: "bidding", stored: "auction", label: "Bidding" },
] as const;

export type SaleParam = (typeof SALE_FILTERS)[number]["param"];
const storedSale = (param: string) => SALE_FILTERS.find((s) => s.param === param)?.stored ?? null;

export const ACTIVITY_MODES = ["online", "in_person", "hybrid"] as const;
export type ActivityMode = (typeof ACTIVITY_MODES)[number];

export const SORTS = [
  { key: "relevant", label: "Most relevant" },
  { key: "newest", label: "Newest" },
  { key: "closing", label: "Closing soon" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

/** An option closing within this many days is closing soon. Calendar days, from now. */
export const CLOSING_SOON_DAYS = 7;
export const PAGE_SIZE = 12;

/**
 * How many fundraisers one request will rank.
 *
 * Relevance and closing-soon both depend on a fundraiser's matching options, so the ranking cannot
 * be done by the database before the options are read. The query narrows on every fundraiser-level
 * filter first, takes at most this many, reads their options in one further query, and ranks what
 * it has. Correct and exact while a filtered set fits; past it the ranking would have to move into
 * SQL. Said out loud in docs/DISCOVERY_CONTRACT.md rather than left to be discovered.
 */
export const CANDIDATE_CAP = 200;

// ---------------------------------------------------------------
// The query string
// ---------------------------------------------------------------

/**
 * Every parameter the page reads. Repeatable ones are repeated, not comma-joined, because that is
 * what an HTML checkbox produces and the page is a plain GET form.
 *
 *   category  repeatable  a `fundraiser_categories` key
 *   mode      repeatable  online | in_person | hybrid
 *   country   repeatable  a two-letter uppercase code
 *   purpose   repeatable  a `discovery_tags` key in the funding-purpose facet
 *   audience  repeatable  a `discovery_tags` key in the audience facet
 *   sale      repeatable  fixed | bidding
 *   place     single      free text matched against the activity locations
 *   min, max  single      whole dollars
 *   closing   single      "soon"
 *   sort      single      relevant | newest | closing
 *   page      single      1-based
 */
export type DiscoveryQuery = {
  categories: string[];
  modes: ActivityMode[];
  countries: string[];
  purposes: string[];
  audiences: string[];
  sales: SaleParam[];
  place: string | null;
  minCents: number | null;
  maxCents: number | null;
  closingSoon: boolean;
  sort: SortKey;
  page: number;
};

export type RawParams = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v === undefined ? [] : [v]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
const one = (v: string | string[] | undefined): string | null => {
  const found = (Array.isArray(v) ? v[0] : v)?.trim();
  return found ? found : null;
};

/** Whole dollars in the address, integer cents everywhere else. Anything else is no answer at all. */
function dollarsToCents(raw: string | null): number | null {
  if (raw === null) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** The shape every registry key has (migration 0053). Anything else was never a key. */
const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * The query, read from the address.
 *
 * A malformed value is dropped rather than refused: an address that has outlived a retired tag
 * should still show results, not an error page.
 *
 * **A filter is never silently widened.** A category is checked against the registry, whose
 * stand-in list is populated even with no database. A discovery tag is checked only for shape,
 * because the tag registry can come back empty (no database, or a read that failed) and dropping
 * the tag would quietly return *more* than the sponsor asked for while the page still said it was
 * filtering. A key that matches nothing narrows to nothing, which is the safe direction to be wrong
 * in: the sponsor sees an empty list rather than a full one they think is filtered.
 */
export function parseQuery(
  params: RawParams,
  known: { categories: readonly string[] },
): DiscoveryQuery {
  const keep = (values: string[], allowed: readonly string[]) => [...new Set(values.filter((v) => allowed.includes(v)))];
  const min = dollarsToCents(one(params.min));
  const max = dollarsToCents(one(params.max));
  // A backwards range is the same question asked the other way round, not an error.
  const [lo, hi] = min !== null && max !== null && min > max ? [max, min] : [min, max];
  const page = Number(one(params.page) ?? "1");

  return {
    categories: keep(list(params.category), known.categories),
    modes: keep(list(params.mode), ACTIVITY_MODES) as ActivityMode[],
    countries: [...new Set(list(params.country).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))],
    purposes: [...new Set(list(params.purpose).filter((k) => KEY_RE.test(k)))],
    audiences: [...new Set(list(params.audience).filter((k) => KEY_RE.test(k)))],
    sales: keep(list(params.sale), SALE_FILTERS.map((s) => s.param)) as SaleParam[],
    place: one(params.place),
    minCents: lo,
    maxCents: hi,
    closingSoon: one(params.closing) === "soon",
    sort: (SORTS.find((s) => s.key === one(params.sort))?.key ?? "relevant") as SortKey,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** True when the sponsor has narrowed anything at all. Sort and page are not narrowing. */
export function hasFilters(q: DiscoveryQuery): boolean {
  return (
    q.categories.length > 0 || q.modes.length > 0 || q.countries.length > 0 || q.purposes.length > 0 ||
    q.audiences.length > 0 || q.sales.length > 0 || q.place !== null || q.minCents !== null ||
    q.maxCents !== null || q.closingSoon
  );
}

/** Only the offer-level half. When none of these is set, every available option counts as matching. */
export function hasOfferFilters(q: DiscoveryQuery): boolean {
  return q.sales.length > 0 || q.minCents !== null || q.maxCents !== null || q.closingSoon;
}

/** The address for a query: the same answer every time, so a shared link reproduces a shared page. */
export function toSearchParams(q: DiscoveryQuery): URLSearchParams {
  const p = new URLSearchParams();
  for (const c of q.categories) p.append("category", c);
  for (const m of q.modes) p.append("mode", m);
  for (const c of q.countries) p.append("country", c);
  for (const t of q.purposes) p.append("purpose", t);
  for (const t of q.audiences) p.append("audience", t);
  for (const s of q.sales) p.append("sale", s);
  if (q.place) p.set("place", q.place);
  if (q.minCents !== null) p.set("min", String(q.minCents / 100));
  if (q.maxCents !== null) p.set("max", String(q.maxCents / 100));
  if (q.closingSoon) p.set("closing", "soon");
  if (q.sort !== "relevant") p.set("sort", q.sort);
  if (q.page > 1) p.set("page", String(q.page));
  return p;
}

export const BASE_PATH = "/fundraisers";

/** One address, with these changes folded in. Changing a filter always returns to the first page. */
export function hrefWith(q: DiscoveryQuery, changes: Partial<DiscoveryQuery>): string {
  const next = { ...q, ...changes };
  if (!("page" in changes)) next.page = 1;
  const search = toSearchParams(next).toString();
  return search ? `${BASE_PATH}?${search}` : BASE_PATH;
}

/** The same query with one value of one repeatable filter taken out. What a removable chip links to. */
export function hrefWithout(q: DiscoveryQuery, key: keyof DiscoveryQuery, value?: string): string {
  const current = q[key];
  if (Array.isArray(current) && value !== undefined) {
    return hrefWith(q, { [key]: current.filter((v) => v !== value) } as Partial<DiscoveryQuery>);
  }
  const cleared: Partial<DiscoveryQuery> = key === "closingSoon" ? { closingSoon: false } : ({ [key]: null } as Partial<DiscoveryQuery>);
  return hrefWith(q, cleared);
}

// ---------------------------------------------------------------
// Matching
// ---------------------------------------------------------------

/** One available sponsorship option, as discovery reads it. A row of public_opportunity_discovery. */
export type DiscoveryOffer = {
  id: string;
  runId: string;
  name: string;
  /** The organizer's own number: the price of a fixed-price option, or the reserve under bidding. */
  priceCents: number;
  saleMethod: "fixed" | "auction";
  /** Only ever on a bidding option, and always above the reserve. */
  buyNowCents: number | null;
  /** lot_close_time's rule: the option's own time, or the fundraiser's bidding clock for bidding. */
  closesAt: string | null;
};

const within = (cents: number, lo: number | null, hi: number | null) =>
  (lo === null || cents >= lo) && (hi === null || cents <= hi);

/**
 * Whether one option matches the offer-level filters.
 *
 * Price reads the organizer's own number and never a template's suggestion: a suggestion is not a
 * price and no fundraiser is matched on one (docs/PRODUCT_CONTRACT.md). For a fixed-price option
 * that number is the price. For a bidding option it is the reserve, which is where the bidding
 * starts, so it is what a sponsor is deciding whether they can afford. Where a bidding option also
 * carries a take-it-now price, either number falling inside the range is a match: both are real
 * ways to buy it at a real number.
 */
export function offerMatches(offer: DiscoveryOffer, q: DiscoveryQuery, now: Date): boolean {
  if (q.sales.length > 0) {
    const wanted = q.sales.map(storedSale).filter((s): s is DiscoveryOffer["saleMethod"] => s !== null);
    if (!wanted.includes(offer.saleMethod)) return false;
  }
  if (q.minCents !== null || q.maxCents !== null) {
    const priced = within(offer.priceCents, q.minCents, q.maxCents)
      || (offer.buyNowCents !== null && within(offer.buyNowCents, q.minCents, q.maxCents));
    if (!priced) return false;
  }
  if (q.closingSoon && !isClosingSoon(offer.closesAt, now)) return false;
  return true;
}

/**
 * Closing within seven calendar days, and not already past.
 *
 * An option with no closing time is never closing soon. The fundraiser's activity end date is not
 * a substitute: it says when the work happens, not when an option stops being available.
 */
export function isClosingSoon(closesAt: string | null, now: Date): boolean {
  if (!closesAt) return false;
  const at = Date.parse(closesAt);
  if (!Number.isFinite(at)) return false;
  return at > now.getTime() && at <= now.getTime() + CLOSING_SOON_DAYS * 86_400_000;
}

/** A fundraiser, reduced to the structured facts discovery narrows on. Never its prose. */
export type DiscoveryFundraiserFacts = {
  categoryKey: string;
  activityMode: string | null;
  countryCodes: readonly string[];
  tags: readonly string[];
  locations: { city: string | null; region: string | null; countryCode: string | null }[];
};

/**
 * Whether a fundraiser matches the fundraiser-level filters.
 *
 * The database is asked the same questions first, so for a live read this is a second opinion that
 * agrees. It is here rather than only in the query for two reasons: the no-database fallback has no
 * query to be filtered by, and a filter that exists in exactly one place is a filter that silently
 * stops applying the moment anything else calls the read model.
 *
 * Within a group the values are alternatives; between groups they all have to hold. Someone who
 * ticks Music and Film wants either; someone who ticks Music and "travel" wants both.
 */
export function fundraiserMatches(f: DiscoveryFundraiserFacts, q: DiscoveryQuery): boolean {
  if (q.categories.length && !q.categories.includes(f.categoryKey)) return false;
  if (q.modes.length && !(f.activityMode && (q.modes as readonly string[]).includes(f.activityMode))) return false;
  if (q.countries.length && !q.countries.some((c) => f.countryCodes.includes(c))) return false;
  if (q.purposes.length && !q.purposes.some((t) => f.tags.includes(t))) return false;
  if (q.audiences.length && !q.audiences.some((t) => f.tags.includes(t))) return false;
  if (q.place && !placeMatches(f.locations, q.place)) return false;
  return true;
}

/** A place the organizer named, matched loosely on the words they wrote. Never the organizer's own city. */
export function placeMatches(locations: { city: string | null; region: string | null; countryCode: string | null }[], place: string): boolean {
  const needle = place.trim().toLowerCase();
  if (!needle) return true;
  return locations.some((l) =>
    [l.city, l.region, l.countryCode].some((part) => part && part.toLowerCase().includes(needle)));
}

// ---------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------

/**
 * What ranking is given, per fundraiser. Everything here is a fact about the fundraiser and the
 * sponsor's own filters. Nothing about who is looking, and nothing anybody paid for.
 */
export type Rankable = {
  matchingOffers: number;
  availableOffers: number;
  completeness: number;
  createdAt: string;
  /** The earliest close among the matching options, or null when none of them is on a clock. */
  soonestCloseAt: string | null;
  /** Last resort, so two identical fundraisers still come back in the same order every time. */
  id: string;
};

/**
 * How complete a fundraiser's structured discovery answers are, out of six.
 *
 * Only structured or organizer-written fields count, and each counts once. This is not a quality
 * score and nobody is ranked down for being small: it rewards a fundraiser a sponsor can actually
 * judge, which is the product's own test (what the funding enables, who it reaches, what the
 * sponsor receives). None of it is required to publish, so a fundraiser with none of it still
 * appears; it simply sorts below one that answered.
 */
export function completeness(f: {
  purpose: string | null;
  audience: string | null;
  sponsorPromise: string | null;
  activityMode: string | null;
  purposeTags: readonly string[];
  audienceTags: readonly string[];
  countryCodes: readonly string[];
  locations: readonly unknown[];
}): number {
  const said = (v: string | null) => Boolean(v && v.trim());
  return [
    said(f.purpose),
    said(f.audience),
    said(f.sponsorPromise),
    Boolean(f.activityMode),
    f.purposeTags.length > 0 || f.audienceTags.length > 0,
    f.countryCodes.length > 0 || f.locations.length > 0,
  ].filter(Boolean).length;
}

export const COMPLETENESS_MAX = 6;

/**
 * Most relevant, in full, and deliberately dull.
 *
 * Four comparisons in a fixed order, every one of them a published fact:
 *
 *   1. how many available options match what the sponsor asked for
 *   2. how completely the fundraiser answered the structured questions (`completeness`, above)
 *   3. how many available options it has at all
 *   4. newest first, then by id so the order never wobbles between two identical rows
 *
 * There is no personalization, no history, no model and nothing an organizer can buy. A sponsor
 * who wants one plain answer instead can sort by newest or by closing soon, and the same rows come
 * back in a different order. Written out in docs/DISCOVERY_CONTRACT.md too, because a ranking a
 * reader cannot check is a ranking they have to take on faith.
 */
export function compareRelevant(a: Rankable, b: Rankable): number {
  return (
    b.matchingOffers - a.matchingOffers ||
    b.completeness - a.completeness ||
    b.availableOffers - a.availableOffers ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function compareNewest(a: Rankable, b: Rankable): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
}

/** Earliest close first. A fundraiser with nothing on a clock sorts after every one that has. */
export function compareClosing(a: Rankable, b: Rankable): number {
  const at = a.soonestCloseAt ? Date.parse(a.soonestCloseAt) : null;
  const bt = b.soonestCloseAt ? Date.parse(b.soonestCloseAt) : null;
  if (at === null && bt === null) return compareNewest(a, b);
  if (at === null) return 1;
  if (bt === null) return -1;
  return at - bt || a.id.localeCompare(b.id);
}

export function comparerFor(sort: SortKey): (a: Rankable, b: Rankable) => number {
  return sort === "newest" ? compareNewest : sort === "closing" ? compareClosing : compareRelevant;
}
