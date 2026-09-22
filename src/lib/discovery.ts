/**
 * The structured facts a sponsor could search on, and the words for them.
 *
 * Discovery needs answers it can narrow by. The free-text fields (`purpose`, `description`,
 * `audience_description`, `sponsor_promise`) stay exactly as they are and stay the authoritative
 * description of a fundraiser; nothing here replaces them and nothing here is read out of them.
 * Reading a filter out of prose would invent a fact the organizer never stated, which is the thing
 * docs/PRODUCT_CONTRACT.md is most explicit about.
 *
 * The registry is the database (`discovery_facets`, `discovery_tags`, migration 0053), the way
 * `fundraiser_categories` is for categories and `surfaces` is for templates. A facet is a row, a
 * tag is a row, and a tag's categories are an array of registry keys. There is no union type here
 * on purpose: a seventh category, or a third facet, is rows and nothing else.
 *
 * Six things this file keeps apart, because blurring any of them is how discovery starts lying:
 *
 *   the fundraiser's funding purpose   vs  what one sponsorship option is
 *   activity location                  vs  the organizer's own location (`acts.country_code`)
 *   audience reach                     vs  physical location
 *   a fixed price                      vs  an auction reserve (one column, `mode` says which)
 *   the fundraising end date           vs  an option's closing time
 *   a template's suggested price       vs  the organizer's own price
 *
 * Pure, and importable from a client component: nothing here reads the database. The loader is
 * src/lib/discovery-registry.ts.
 */

// ---------------------------------------------------------------
// The registry
// ---------------------------------------------------------------

/** A kind of structured question. Two today: what the funding pays for, and who it reaches. */
export type DiscoveryFacet = {
  key: string;
  label: string;
  /** The line the organizer form puts above the choices, or null. */
  prompt: string | null;
  /** Whether a fundraiser may carry a tag in this facet. */
  onFundraiser: boolean;
  /** Whether a sponsorship option template may carry one. */
  onTemplate: boolean;
  /** How many tags in this facet one object may carry. Choosing everything is not a filter. */
  maxTags: number;
  sort: number;
};

export type DiscoveryTag = {
  key: string;
  facetKey: string;
  label: string;
  /** One short line under the label, or null. */
  help: string | null;
  /** The categories this tag is honestly about. Null means every category. */
  categoryKeys: string[] | null;
  /** False once it is retired: it stays on whatever already carries it and is offered to nobody. */
  active: boolean;
  sort: number;
};

export type DiscoveryRegistry = { facets: DiscoveryFacet[]; tags: DiscoveryTag[] };

export const EMPTY_REGISTRY: DiscoveryRegistry = { facets: [], tags: [] };

/** Where a tag is being carried. The database asks the same question in validate_discovery_tags. */
export type DiscoveryScope = "fundraiser" | "template";

const scopeAllows = (facet: DiscoveryFacet, scope: DiscoveryScope) =>
  scope === "fundraiser" ? facet.onFundraiser : facet.onTemplate;

const categoryAllows = (tag: DiscoveryTag, categoryKey: string) =>
  tag.categoryKeys === null || tag.categoryKeys.includes(categoryKey);

// ---------------------------------------------------------------
// What to offer, and what to accept
// ---------------------------------------------------------------

/** One facet with the tags this category may actually choose from, in the registry's order. */
export type DiscoveryChoice = { facet: DiscoveryFacet; tags: DiscoveryTag[] };

/**
 * The choices to draw, for one category on one kind of object.
 *
 * Retired tags are not offered. A facet with nothing left to offer is left out rather than drawn
 * empty: an empty question is worse than no question.
 */
export function discoveryChoices(
  registry: DiscoveryRegistry,
  scope: DiscoveryScope,
  categoryKey: string,
): DiscoveryChoice[] {
  return registry.facets
    .filter((facet) => scopeAllows(facet, scope))
    .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))
    .map((facet) => ({
      facet,
      tags: registry.tags
        .filter((tag) => tag.facetKey === facet.key && tag.active && categoryAllows(tag, categoryKey))
        .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)),
    }))
    .filter((choice) => choice.tags.length > 0);
}

/**
 * What is wrong with a set of chosen tags, in words an organizer can act on.
 *
 * The same rules the database enforces in `validate_discovery_tags`, said here first so the form
 * can answer without a round trip. The database is the gate; this is the sentence. A tag that is
 * already stored and has since been retired is left alone: pass what the row carried as `previous`.
 */
export function discoveryTagErrors(
  tags: readonly string[],
  registry: DiscoveryRegistry,
  categoryKey: string,
  scope: DiscoveryScope,
  previous: readonly string[] = [],
): string[] {
  const out: string[] = [];
  if (tags.length === 0) return out;
  if (tags.some((tag) => tag.trim() === "")) out.push("A discovery tag cannot be blank.");
  if (new Set(tags).size !== tags.length) out.push("Each discovery tag may be chosen once.");

  const byKey = new Map(registry.tags.map((tag) => [tag.key, tag]));
  const facets = new Map(registry.facets.map((facet) => [facet.key, facet]));
  const counts = new Map<string, number>();

  for (const key of tags) {
    if (key.trim() === "") continue;
    const tag = byKey.get(key);
    if (!tag) {
      out.push(`${key} is not a discovery tag.`);
      continue;
    }
    if (!tag.active && !previous.includes(key)) out.push(`${tag.label} is no longer offered.`);
    if (!categoryAllows(tag, categoryKey)) out.push(`${tag.label} belongs to another category.`);
    const facet = facets.get(tag.facetKey);
    if (facet && !scopeAllows(facet, scope)) out.push(`${tag.label} does not belong here.`);
    counts.set(tag.facetKey, (counts.get(tag.facetKey) ?? 0) + 1);
  }

  for (const [facetKey, count] of counts) {
    const facet = facets.get(facetKey);
    if (facet && count > facet.maxTags) {
      out.push(`Choose at most ${facet.maxTags} under "${facet.label}".`);
    }
  }
  return [...new Set(out)];
}

/**
 * The choices to draw when a sponsor may have picked several categories, or none.
 *
 * A tag scoped to one category is offered while that category is among the chosen ones, and also
 * when nothing is chosen at all: with no category narrowing the list, every category's fundraisers
 * are in play, so every category's tags are worth offering. Unscoped tags are always offered.
 */
export function discoveryChoicesForCategories(
  registry: DiscoveryRegistry,
  scope: DiscoveryScope,
  categoryKeys: readonly string[],
): DiscoveryChoice[] {
  const wanted = (tag: DiscoveryTag) =>
    tag.categoryKeys === null || categoryKeys.length === 0 || tag.categoryKeys.some((k) => categoryKeys.includes(k));
  return registry.facets
    .filter((facet) => scopeAllows(facet, scope))
    .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))
    .map((facet) => ({
      facet,
      tags: registry.tags
        .filter((tag) => tag.facetKey === facet.key && tag.active && wanted(tag))
        .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)),
    }))
    .filter((choice) => choice.tags.length > 0);
}

// ---------------------------------------------------------------
// Reading stored tags back
// ---------------------------------------------------------------

export type DiscoveryTagView = { key: string; label: string };
export type DiscoveryFacetView = { key: string; label: string; tags: DiscoveryTagView[] };

/**
 * Stored keys, grouped by facet and already in words.
 *
 * A retired tag still reads, because something already carries it. A key with no row at all is
 * dropped rather than shown as itself: a raw key on a page is not a label, and what is not known
 * is not drawn.
 */
export function groupDiscoveryTags(
  tags: readonly string[] | null | undefined,
  registry: DiscoveryRegistry,
): DiscoveryFacetView[] {
  if (!tags?.length) return [];
  const byKey = new Map(registry.tags.map((tag) => [tag.key, tag]));
  const out: DiscoveryFacetView[] = [];
  for (const facet of [...registry.facets].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))) {
    const found = tags
      .map((key) => byKey.get(key))
      .filter((tag): tag is DiscoveryTag => Boolean(tag) && tag!.facetKey === facet.key)
      .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))
      .map((tag) => ({ key: tag.key, label: tag.label }));
    if (found.length) out.push({ key: facet.key, label: facet.label, tags: found });
  }
  return out;
}

// ---------------------------------------------------------------
// The read model
//
// One row of `public_fundraiser_discovery` or `public_opportunity_discovery`, turned into the view
// the interface takes. Both views are read-only and hold no patron, no bid, no amount anybody paid,
// no fee, no Stripe id, no evidence and no delivery state. Discovery and settlement stay apart.
// ---------------------------------------------------------------

export type FundraiserDiscoveryRow = {
  id: string;
  slug: string;
  organizer_slug: string;
  title: string;
  category_key: string;
  status: string;
  activity_mode: string | null;
  activity_locations: { city?: string | null; region?: string | null; country_code?: string | null }[] | null;
  activity_country_codes: string[] | null;
  discovery_tags: string[] | null;
  fundraising_starts_on: string | null;
  fundraising_ends_on: string | null;
  created_at: string;
};

export type FundraiserDiscoveryView = {
  id: string;
  slug: string;
  organizerSlug: string;
  title: string;
  categoryKey: string;
  status: string;
  /** Null until somebody says. Never guessed from a location or the lack of one. */
  activityMode: "in_person" | "online" | "hybrid" | null;
  locations: { city: string | null; region: string | null; countryCode: string | null }[];
  /** The countries the activity happens in. Empty for online-only, which is a fact, not a gap. */
  countryCodes: string[];
  /** The chosen tags, grouped by facet and in words. Empty when the organizer chose none. */
  discovery: DiscoveryFacetView[];
  /** When the fundraiser is raising. Not when the activity happens, and not when an offer closes. */
  fundraisingWindow: { startsOn: string | null; endsOn: string | null } | null;
  createdAt: string;
};

const MODES = ["in_person", "online", "hybrid"] as const;
const mode = (value: string | null): FundraiserDiscoveryView["activityMode"] =>
  (MODES as readonly string[]).includes(value ?? "") ? (value as FundraiserDiscoveryView["activityMode"]) : null;

export function fundraiserDiscoveryView(
  row: FundraiserDiscoveryRow,
  registry: DiscoveryRegistry = EMPTY_REGISTRY,
): FundraiserDiscoveryView {
  const window =
    row.fundraising_starts_on || row.fundraising_ends_on
      ? { startsOn: row.fundraising_starts_on, endsOn: row.fundraising_ends_on }
      : null;
  return {
    id: row.id,
    slug: row.slug,
    organizerSlug: row.organizer_slug,
    title: row.title,
    categoryKey: row.category_key,
    status: row.status,
    activityMode: mode(row.activity_mode),
    locations: (row.activity_locations ?? []).map((l) => ({
      city: l.city ?? null,
      region: l.region ?? null,
      countryCode: l.country_code ?? null,
    })),
    countryCodes: row.activity_country_codes ?? [],
    discovery: groupDiscoveryTags(row.discovery_tags, registry),
    fundraisingWindow: window,
    createdAt: row.created_at,
  };
}

export type OpportunityDiscoveryRow = {
  id: string;
  run_id: string;
  fundraiser_slug: string;
  organizer_slug: string;
  category_key: string;
  name: string;
  template_name: string;
  description: string | null;
  price_cents: number;
  mode: string;
  buy_now_cents: number | null;
  closes_at: string | null;
  status: string;
  audience_tags: string[] | null;
  reach_estimate: number | null;
  reach_basis: string | null;
  created_at: string;
};

export type OpportunityDiscoveryView = {
  id: string;
  runId: string;
  fundraiserSlug: string;
  organizerSlug: string;
  /** The category this option belongs to, which is always its fundraiser's (migration 0044). */
  categoryKey: string;
  name: string;
  description: string | null;
  /**
   * The organizer's own number. `saleMethod` says what it means: the price of a fixed-price
   * option, or the reserve under a bidding one. A template's suggestion is never this.
   */
  priceCents: number;
  saleMethod: "fixed" | "auction";
  /** Only ever set on a bidding option, and always above the reserve. */
  buyNowCents: number | null;
  /** When bidding on this option closes. Not when the fundraiser stops raising. */
  closesAt: string | null;
  status: string;
  /** Who this placement reaches, from the template. A fact about the placement, not a claim. */
  audience: DiscoveryTagView[];
  /** An estimate and why the organizer believes it. Never one without the other. */
  reach: { estimate: number; basis: string } | null;
  createdAt: string;
};

export function opportunityDiscoveryView(
  row: OpportunityDiscoveryRow,
  registry: DiscoveryRegistry = EMPTY_REGISTRY,
): OpportunityDiscoveryView {
  const byKey = new Map(registry.tags.map((tag) => [tag.key, tag]));
  return {
    id: row.id,
    runId: row.run_id,
    fundraiserSlug: row.fundraiser_slug,
    organizerSlug: row.organizer_slug,
    categoryKey: row.category_key,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    saleMethod: row.mode === "auction" ? "auction" : "fixed",
    buyNowCents: row.buy_now_cents,
    closesAt: row.closes_at,
    status: row.status,
    audience: (row.audience_tags ?? [])
      .map((key) => byKey.get(key))
      .filter((tag): tag is DiscoveryTag => Boolean(tag))
      .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))
      .map((tag) => ({ key: tag.key, label: tag.label })),
    reach: row.reach_estimate !== null && row.reach_basis ? { estimate: row.reach_estimate, basis: row.reach_basis } : null,
    createdAt: row.created_at,
  };
}
