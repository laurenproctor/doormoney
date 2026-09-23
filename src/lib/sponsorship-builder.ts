/**
 * The sponsorships stage, in arithmetic: one option at a time, built from the rows that exist.
 *
 * An option here is what an organizer offers on one template: its spots (`lots` rows, one per
 * spot), their shared price and sale method, and the offer contract they share (`lots.offer_terms`,
 * src/lib/offer-terms.ts). Nothing new is stored: the builder reads the same rows the workspace
 * editor reads and posts the same field names to the same action (src/app/actions/lots.ts), scoped
 * to one template with `only`.
 *
 * Money is kept in separate boxes on purpose. A price is what one spot costs. A possible maximum is
 * that price times the spots, which is a ceiling and never money. A funding goal is what the work
 * needs, from the funding stage. Money raised is what sponsors have actually paid, which for a
 * draft is nothing. No number here is ever drawn as progress toward another.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */
import { formatMoney } from "@/lib/money";
import { EMPTY_OFFER_TERMS_DRAFT, draftFromTerms, missingOfferRequirements, offerTermsOf, type OfferTerms, type OfferTermsDraft } from "@/lib/offer-terms";
import type { SaleMethod } from "@/lib/opportunities";

/** A `lots` row, as far as the builder reads it. The same columns the workspace editor reads. */
export type BuilderLot = {
  id: string; surface_key: string; label: string | null; price_cents: number; mode: "fixed" | "auction"; status: string;
  buy_now_cents: number | null; reach_estimate: number | null; reach_basis: string | null;
  offer_terms?: unknown; exclusive?: boolean | null;
  /** True for a spot that was on sale before offer terms were required to publish (migration 0060). */
  terms_grandfathered?: boolean | null;
};

/** The commercial half of one option, as the form holds it. The same shape the workspace editor posts. */
export type OptionRow = { on: boolean; count: string; price: string; mode: SaleMethod; buyNow: string; reach: string; reachBasis: string };

export type OptionState = {
  key: string;
  row: OptionRow;
  terms: OfferTermsDraft;
  /** True once a spot on this option has sold or has a bid on it: its terms are what that sponsor bought. */
  locked: boolean;
  /** How many spots exist in the database now. Zero for an option being built. */
  savedSpots: number;
  /** True when every spot was on sale before offer terms were required, so finishing them is optional. */
  grandfathered: boolean;
};

/** The bounds the save action holds a price to, repeated here so the form can say them first. */
export const MIN_PRICE_CENTS = 1_000;
export const MAX_PRICE_CENTS = 10_000_000;
export const MAX_SPOTS = 6;

export const dollarsOf = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);

/** Whole cents from a dollars string, or null when it is not a money amount. */
export function priceCentsOf(price: string): number | null {
  const cleaned = price.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** Whether the price is one the save action would accept. */
export function priceAcceptable(price: string): boolean {
  const cents = priceCentsOf(price);
  return cents !== null && cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS;
}

export function spotsOf(count: string): number {
  return Math.max(1, Math.min(MAX_SPOTS, Number(count) || 1));
}

/** An option as it stands in the database, or an empty one for a template nothing is saved on. */
export function optionFromLots(key: string, lots: readonly BuilderLot[], suggestedPriceCents: number | null): OptionState {
  const mine = lots.filter((l) => l.surface_key === key);
  if (mine.length === 0) {
    return {
      key,
      row: { on: true, count: "1", price: suggestedPriceCents === null ? "" : dollarsOf(suggestedPriceCents), mode: "fixed", buyNow: "", reach: "", reachBasis: "" },
      terms: { ...EMPTY_OFFER_TERMS_DRAFT },
      locked: false,
      savedSpots: 0,
      grandfathered: false,
    };
  }
  const first = mine[0];
  return {
    key,
    row: {
      on: true, count: String(mine.length), price: dollarsOf(first.price_cents), mode: first.mode,
      buyNow: first.buy_now_cents ? dollarsOf(first.buy_now_cents) : "",
      reach: first.reach_estimate === null ? "" : String(first.reach_estimate),
      reachBasis: first.reach_basis ?? "",
    },
    terms: draftFromTerms(offerTermsOf(first)),
    locked: mine.some((l) => l.status !== "open"),
    savedSpots: mine.length,
    grandfathered: mine.every((l) => l.terms_grandfathered === true),
  };
}

/** The template keys that have spots saved, in the order they were first saved. */
export function savedOptionKeys(lots: readonly BuilderLot[]): string[] {
  return [...new Set(lots.map((l) => l.surface_key))];
}

// ---------------------------------------------------------------
// Money, kept apart
// ---------------------------------------------------------------

export type MoneyLine = { key: string; label: string; value: string; note: string | null };

/**
 * The five numbers a sponsorship option touches, each in its own line and none drawn as progress.
 *
 * `raisedCents` is what sponsors have actually paid on the whole fundraiser, or null where nothing
 * can have been paid yet (a draft). It is never computed from prices.
 */
export function moneyLines(input: { priceCents: number | null; spots: number; saleMethod: SaleMethod; goalCents: number | null; raisedCents: number | null }): MoneyLine[] {
  const { priceCents, spots, saleMethod, goalCents, raisedCents } = input;
  const price = priceCents === null ? null : formatMoney(priceCents);
  const maximum = priceCents === null ? null : formatMoney(priceCents * spots);
  return [
    {
      key: "price",
      label: saleMethod === "auction" ? "Bidding starts at" : "Price per spot",
      value: price ?? "Not set",
      note: saleMethod === "auction" ? "The reserve. A sponsor may bid more, and a bid is not a sale until it wins." : null,
    },
    { key: "spots", label: "Spots", value: String(spots), note: spots === 1 ? null : "Each spot is one sponsor at this price." },
    {
      key: "maximum",
      label: "If every spot sells",
      value: maximum ?? "Not known",
      note: "A possible maximum, not money raised and not a goal.",
    },
    {
      key: "goal",
      label: "Funding goal",
      value: goalCents === null ? "None set" : formatMoney(goalCents),
      note: "From the funding stage. What the work needs, and separate from what any option can bring in.",
    },
    {
      key: "raised",
      label: "Money raised",
      value: raisedCents === null ? "Nothing yet" : formatMoney(raisedCents),
      note: raisedCents === null ? "Nothing can be bought while the fundraiser is a draft." : "What sponsors have actually paid.",
    },
  ];
}

// ---------------------------------------------------------------
// What is still missing
// ---------------------------------------------------------------

export type OptionMissing = { key: string; label: string; step: BuilderStepKey };

/**
 * Everything an option still lacks, in the order the builder asks for it. A price comes first,
 * because it is the one thing the database cannot store an option without; the rest is the product
 * contract's list (offerTermsRequirements), which nothing blocks saving on.
 */
export function optionMissing(row: OptionRow, terms: OfferTerms): OptionMissing[] {
  const out: OptionMissing[] = [];
  if (!priceAcceptable(row.price)) out.push({ key: "price", label: "A price between $10 and $100,000", step: "price" });
  const lot = { reach_estimate: row.reach ? Number(row.reach) : null, reach_basis: row.reachBasis || null };
  for (const r of missingOfferRequirements(terms, lot)) out.push({ key: r.key, label: r.label, step: STEP_OF_REQUIREMENT[r.key] ?? "deliver" });
  return out;
}

// ---------------------------------------------------------------
// The steps
// ---------------------------------------------------------------

export const BUILDER_STEPS = [
  { key: "placement", label: "Placement", question: "Where does the sponsor appear, and in what form?" },
  { key: "appearances", label: "Appearances", question: "How many times, and when?" },
  { key: "price", label: "Price", question: "What does a spot cost, and how many are there?" },
  { key: "materials", label: "Materials", question: "What does the sponsor send, and who accepts it?" },
  { key: "production", label: "Production", question: "Who pays to produce it, and is anything exclusive?" },
  { key: "deliver", label: "Delivery", question: "What do you deliver, and how will you document it?" },
] as const;

export type BuilderStepKey = (typeof BUILDER_STEPS)[number]["key"];

const STEP_OF_REQUIREMENT: Record<string, BuilderStepKey> = {
  placement: "placement",
  appearances: "appearances",
  delivery_window: "appearances",
  audience: "appearances",
  reach_basis: "price",
  production: "production",
  exclusivity: "production",
  sponsor_materials: "materials",
  approval: "materials",
  deliverables: "deliver",
  evidence: "deliver",
};

export function stepIndex(key: BuilderStepKey): number {
  return BUILDER_STEPS.findIndex((s) => s.key === key);
}
