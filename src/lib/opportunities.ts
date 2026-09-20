/**
 * Sponsorship opportunities, in neutral terms.
 *
 * Three things that are easy to blur, kept apart on purpose (docs/PRODUCT_CONTRACT.md):
 *
 *   OpportunityTemplate  a `surfaces` row    what Door Money suggests: a name, where it is seen,
 *                                            and a price only where there is history behind one
 *   Opportunity          a `lots` row        what one organizer chose to offer, at their own price
 *   PurchasedOffer       a `purchases` row   what one sponsor bought, at the lot's offer version
 *
 * A template promises nothing. An organizer who never ticks an option has not offered it, and no
 * page may describe it as though they had. The organizer's price always wins over a suggestion.
 *
 * The tables keep the names they have (decision 14: addresses outlive words). This file is the
 * adapter between those rows and the words the product uses, the way src/lib/categories.ts is for
 * a category. The database is the registry: a category's templates are whatever `surfaces` holds
 * for it, so a fifth category needs rows, not a change to a union type here. src/lib/catalog.ts
 * supplies extra words for the options it knows and is never the list of what exists.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */
import { CATALOG, GROUPS, type ActType } from "@/lib/catalog";

// ---------------------------------------------------------------
// Sale methods. How something is sold is never what it is.
// ---------------------------------------------------------------

export const SALE_METHODS = [
  { key: "fixed", label: "Fixed price" },
  { key: "auction", label: "Bidding" },
] as const;

export type SaleMethod = (typeof SALE_METHODS)[number]["key"];

export function isSaleMethod(value: unknown): value is SaleMethod {
  return SALE_METHODS.some((m) => m.key === value);
}

// ---------------------------------------------------------------
// The template
// ---------------------------------------------------------------

export type OpportunityTemplate = {
  key: string;
  /** Bumped when the template's words change, so an opportunity can say what it was chosen from. */
  version: number;
  /** The one category whose fundraisers may offer this. */
  category: string;
  name: string;
  /** The section it is drawn in. A string, not a union: a new category brings its own sections. */
  group: string;
  /** Which music acts this suits. Null outside music, which does not divide organizers this way. */
  appliesTo: ActType[] | null;
  /** A suggestion, or null where Door Money has no history to base one on. Never the price. */
  defaultPriceCents: number | null;
  period: string;
  seenBy: string | null;
  /** Longer words, where src/lib/catalog.ts has written some. */
  blurb: string | null;
  /** False once retired: no new opportunity may be made from it, and existing ones are untouched. */
  active: boolean;
};

/** A `surfaces` row, as the browser may read it. */
export type TemplateRow = {
  key: string;
  name: string;
  group_key: string;
  category_key: string;
  applies_to: string[] | null;
  default_price_cents: number | null;
  default_period: string;
  seen_by: string | null;
  sort?: number | null;
  active?: boolean | null;
  version?: number | null;
};

const ACT_TYPES: readonly string[] = ["touring_band", "house_act", "soloist"];

/**
 * The registry's row, in the catalog's words where it has any.
 *
 * The row decides what exists and what it costs: category, section, act types, suggested price.
 * The words a reader sees come from src/lib/catalog.ts for an option it knows, because that file is
 * the copy held to the voice rules and the hosted rows still carry older wording ("every photo",
 * where the file says "most crowd photos"). A row the file has never heard of speaks for itself.
 */
export function templateFromRow(row: TemplateRow): OpportunityTemplate {
  const words = CATALOG.find((c) => c.key === row.key);
  // An act type is a music idea. Read it only on a music template, whatever the row carries.
  const appliesTo = row.category_key === "music" && row.applies_to ? (row.applies_to.filter((t) => ACT_TYPES.includes(t)) as ActType[]) : null;
  return {
    key: row.key,
    version: row.version ?? 1,
    category: row.category_key,
    name: row.name,
    group: row.group_key,
    appliesTo,
    defaultPriceCents: row.default_price_cents,
    period: row.default_period,
    seenBy: words?.seenBy ?? row.seen_by,
    blurb: words?.blurb ?? null,
    active: row.active ?? true,
  };
}

/** The catalog file as templates: what the app falls back to before a database is connected. */
export function catalogTemplates(): OpportunityTemplate[] {
  return CATALOG.map((s) => ({
    key: s.key,
    version: 1,
    category: s.category,
    name: s.name,
    group: s.group,
    appliesTo: s.appliesTo,
    defaultPriceCents: s.defaultPriceCents,
    period: s.period,
    seenBy: s.seenBy,
    blurb: s.blurb,
    active: true,
  }));
}

/**
 * What a fundraiser in this category may newly offer.
 *
 * Only its own category's templates, and only active ones. Music narrows by act type, because its
 * options depend on what the act carries; no other category is asked for one, and a category with
 * no templates yet offers nothing instead of borrowing music's.
 */
export function templatesForFundraiser(templates: readonly OpportunityTemplate[], categoryKey: string, actType: ActType | null): OpportunityTemplate[] {
  return templates.filter((t) => {
    if (t.category !== categoryKey || !t.active) return false;
    if (categoryKey !== "music") return true;
    return actType !== null && (t.appliesTo ?? []).includes(actType);
  });
}

/** Whether this template may sit on a fundraiser of this category. The database holds the same rule (migration 0044). */
export function templateFitsFundraiser(template: Pick<OpportunityTemplate, "category">, fundraiserCategory: string): boolean {
  return template.category === fundraiserCategory;
}

// ---------------------------------------------------------------
// Sections
// ---------------------------------------------------------------

export type TemplateSection = { group: string; eyebrow: string; heading: string | null; items: OpportunityTemplate[] };

function humanize(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Templates in the sections they are drawn in. Sections this build has words for come first, in
 * their written order; a section it has never heard of follows under its own name, so a category
 * added in SQL draws a usable editor. "online" stays last for everybody.
 */
export function templateSections(templates: readonly OpportunityTemplate[]): TemplateSection[] {
  const known = Object.keys(GROUPS);
  const present = [...new Set(templates.map((t) => t.group))];
  const rank = (g: string) => (g === "online" ? Number.MAX_SAFE_INTEGER : known.includes(g) ? known.indexOf(g) : known.length + present.indexOf(g));
  return present
    .sort((a, b) => rank(a) - rank(b))
    .map((group) => {
      const words = (GROUPS as Record<string, { eyebrow: string; heading: string }>)[group];
      return { group, eyebrow: words?.eyebrow ?? humanize(group), heading: words?.heading ?? null, items: templates.filter((t) => t.group === group) };
    });
}

// ---------------------------------------------------------------
// The opportunity: what an organizer chose
// ---------------------------------------------------------------

export type Opportunity = {
  id: string;
  fundraiserId: string;
  templateKey: string;
  /** "Case spot 2" where one template is offered more than once. */
  label: string | null;
  /** The organizer's own price: the fixed price, or the reserve for bidding. */
  priceCents: number;
  saleMethod: SaleMethod;
  /** Bidding only: a price that ends the bidding outright. */
  buyNowCents: number | null;
  status: string;
};

export type LotRow = { id: string; run_id: string; surface_key: string; label: string | null; price_cents: number; mode: string; buy_now_cents: number | null; status: string };

export function opportunityFromLot(row: LotRow): Opportunity {
  return {
    id: row.id,
    fundraiserId: row.run_id,
    templateKey: row.surface_key,
    label: row.label,
    priceCents: row.price_cents,
    saleMethod: isSaleMethod(row.mode) ? row.mode : "fixed",
    buyNowCents: row.buy_now_cents,
    status: row.status,
  };
}

/** What the opportunity is called: the organizer's label, then the template's name, then the key. */
export function opportunityName(opportunity: Pick<Opportunity, "label" | "templateKey">, templates: readonly Pick<OpportunityTemplate, "key" | "name">[]): string {
  return opportunity.label ?? templates.find((t) => t.key === opportunity.templateKey)?.name ?? opportunity.templateKey;
}

/**
 * The price a sponsor is asked for. The organizer's, always. A suggestion is only ever a starting
 * value in an empty form; once an opportunity exists the template's number is not consulted.
 */
export function askingPriceCents(opportunity: Pick<Opportunity, "priceCents">): number {
  return opportunity.priceCents;
}

/** What an empty price box starts at: the suggestion where there is one, and nothing where there is not. */
export function startingPriceCents(template: Pick<OpportunityTemplate, "defaultPriceCents">): number | null {
  return template.defaultPriceCents;
}

// ---------------------------------------------------------------
// The purchased offer: what a sponsor bought
// ---------------------------------------------------------------

/**
 * A reference to a purchase, in the product's words. Deliberately thin.
 *
 * Today a purchase is bound to its lot at an offer version (migration 0035), which is what stops a
 * sponsor paying for terms that moved. The immutable copy of everything that was promised, and the
 * delivery and evidence policy it was bought under, arrive with expansion Phase 4. They will be
 * built from `lots.template_snapshot` (migration 0044) and the lot's own terms at that version.
 * Nothing here reads or writes a payment.
 */
export type PurchasedOffer = {
  purchaseId: string;
  opportunityId: string;
  /** The lot's offer version the sponsor paid against. */
  offerVersion: number | null;
  /** What was charged. Never a template's suggestion, and not always the lot's list price. */
  amountCents: number;
};
