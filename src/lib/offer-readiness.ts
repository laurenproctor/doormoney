/**
 * Which sponsorship options still lack the terms the product contract asks for before a purchase,
 * for the publish gate and the checklist that shows it.
 *
 * The rule is per spot, and it is the one migrations 0060 and 0061 hold in the database:
 *
 *   A spot is held to the rule when it is open, not grandfathered, and does not carry the offer
 *   terms of a sibling on the same template that is bid on or sold.
 *
 * `lots.terms_grandfathered` is true only for a spot that already existed on an already-published
 * fundraiser when 0060 ran (the options sponsors had read before the rule), and nothing but that
 * migration writes it. So an option added to an older fundraiser after it was taken down is held to
 * the rule like any other, while the old ones are left as they were. A spot added beside a sale
 * carries the purchased terms, copied from the frozen sibling (src/app/actions/lots.ts), and is not
 * asked to be anything else; a spot on that template with a different document is.
 *
 * The requirement list is the one the builder shows as "Still missing" (offerTermsRequirements),
 * and `offer_terms_complete` in 0060 is the same list in SQL, so what the organizer is told to
 * finish, what the action refuses and what the database refuses cannot drift apart. Once the
 * fundraiser is public the same question is asked of every spot written (`publicLotProblem`, and
 * 0061's trigger on `lots`).
 *
 * Pure: nothing here reads the database.
 */
import { missingOfferRequirements, offerTermsOf, sameOfferTerms, storedOfferTerms } from "@/lib/offer-terms";

export type OfferReadinessLot = {
  surface_key: string;
  status: string;
  reach_estimate?: number | null;
  reach_basis?: string | null;
  offer_terms?: unknown;
  exclusive?: boolean | null;
  /** Absent on a row read before 0060 is applied, which reads as false: the rule applies. */
  terms_grandfathered?: boolean | null;
};

export type IncompleteOffer = { key: string; name: string; missing: string[] };

/**
 * Whether this spot's terms are required: open, not grandfathered, and not carrying the document
 * of a bid-on or sold sibling on its template. Sharing the template alone exempts nothing; the
 * document has to be the frozen one, which is what `saveLots` copies onto a spot added beside a
 * sale. Migration 0061's `lot_offer_terms_unfinished` asks exactly this, with jsonb equality.
 */
export function termsRequired(lot: OfferReadinessLot, siblings: readonly OfferReadinessLot[]): boolean {
  if (lot.status !== "open" || lot.terms_grandfathered === true) return false;
  const own = storedOfferTerms(lot);
  return !siblings.some((s) => s.surface_key === lot.surface_key && s.status !== "open" && sameOfferTerms(storedOfferTerms(s), own));
}

export function incompleteOffers(lots: readonly OfferReadinessLot[], templates: readonly { key: string; name: string }[]): IncompleteOffer[] {
  const out: IncompleteOffer[] = [];
  for (const key of [...new Set(lots.map((l) => l.surface_key))]) {
    const mine = lots.filter((l) => l.surface_key === key);
    const held = mine.filter((l) => termsRequired(l, lots));
    // Every spot on a template shares its terms, so the first one that is held to the rule answers
    // for the option. Each is still checked, the way the database checks each row.
    const unfinished = held.map((l) => missingOfferRequirements(offerTermsOf(l), { reach_estimate: l.reach_estimate ?? null, reach_basis: l.reach_basis ?? null })).find((m) => m.length > 0);
    if (!unfinished) continue;
    out.push({ key, name: templates.find((t) => t.key === key)?.name ?? key, missing: unfinished.map((m) => m.label) });
  }
  return out;
}

/** One sentence per unfinished option, as the publish refusal and the checklist say it. */
export function incompleteOfferSentence(offer: IncompleteOffer): string {
  const parts = offer.missing.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
  return `Finish the offer for ${offer.name}: ${parts.join("; ")}.`;
}

/** A `lots` row as `saveLots` is about to write it, for the public-fundraiser check. */
export type PendingLot = {
  surface_key: string;
  /** The row's own id on an update, so it is not its own sibling. Null for a new spot. */
  id: string | null;
  terms: unknown;
  reach_estimate: number | null;
  reach_basis: string | null;
  terms_grandfathered: boolean;
};

/**
 * Why a spot may not be written on a public fundraiser, or null. The same predicate as 0061's
 * `lot_offer_terms_unfinished`, asked before the write so the refusal names what is missing rather
 * than only that the database said no. `existing` is every spot on the fundraiser as it stands.
 */
export function publicLotProblem(pending: PendingLot, existing: readonly (OfferReadinessLot & { id: string })[]): string[] | null {
  if (pending.terms_grandfathered) return null;
  const own = storedOfferTerms({ offer_terms: pending.terms });
  const frozenTwin = existing.some((s) => s.surface_key === pending.surface_key && s.status !== "open" && s.id !== pending.id && sameOfferTerms(storedOfferTerms(s), own));
  if (frozenTwin) return null;
  const missing = missingOfferRequirements(own, { reach_estimate: pending.reach_estimate, reach_basis: pending.reach_basis });
  return missing.length ? missing.map((m) => m.label) : null;
}
