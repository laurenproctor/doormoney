/**
 * Delivery and release policy, in the parts that are arithmetic and rules.
 *
 * docs/DELIVERY_POLICY_MATRIX.md is the policy. The database holds the registry and the records
 * (migration 0045). This file says what they mean: whether a policy may take real money, how an
 * organizer's share is divided across deliverables, and when a released share is due.
 *
 * Two release rules, and only two:
 *   calendar  music, as built. Equal weekly slices across the fundraiser's dates.
 *   evidence  everything else. A share is released as each deliverable is documented.
 * Both wait for the sponsor's materials to be accepted, which is one gate (migration 0031) whatever
 * the materials are: a logo, a credit line, a name to be said aloud, a product.
 *
 * Pure, and importable anywhere: nothing here reads the database or Stripe.
 */

export type ReleaseRule = "calendar" | "evidence";
export type PolicyStatus = "proposed" | "active" | "retired";

export type PolicyRef = { categoryKey: string; version: number; releaseRule: ReleaseRule };

/**
 * Whether a purchase under this policy may be a real one.
 *
 * A proposed policy is how a category is verified in Stripe's test mode. Only a policy the owner
 * has switched to active takes live money, and a category with no policy takes none at all.
 */
export function policyAllowsPayment(status: PolicyStatus | null | undefined, live: boolean): boolean {
  if (status === "active") return true;
  if (status === "proposed") return !live;
  return false;
}

/**
 * Which of a category's policies a new purchase is sold under: the newest one switched on, and only
 * failing that the newest proposal. A draft of a later version changes nothing until the owner
 * switches it on. The database chooses the same way (migration 0046), so the version the checkout
 * gate asks about is the version the purchase is recorded under.
 */
export function currentPolicy<T extends { version: number; status: string }>(rows: readonly T[]): T | null {
  const usable = rows.filter((r) => r.status === "active" || r.status === "proposed");
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.version - a.version)[0];
}

/** The release rule a purchase was sold under, from its snapshot. Calendar where nothing says otherwise: that is every purchase made before policies existed. */
export function releaseRuleOf(snapshot: unknown): ReleaseRule {
  const rule = (snapshot as { policy?: { release_rule?: unknown } } | null)?.policy?.release_rule;
  return rule === "evidence" ? "evidence" : "calendar";
}

/**
 * The organizer's net share, divided across the deliverables on a purchase.
 *
 * Equal parts, with the odd cents on the last one, the same way weeklySlices divides a calendar.
 * The parts always add up to the net exactly: Door Money's fee is still the part never transferred.
 */
export function deliverableShares(netCents: number, count: number): number[] {
  if (!Number.isInteger(netCents) || netCents < 0) throw new Error("net must be whole cents");
  if (!Number.isInteger(count) || count < 1) throw new Error("a purchase has at least one deliverable");
  const base = Math.floor(netCents / count);
  return Array.from({ length: count }, (_, i) => base + (i === count - 1 ? netCents - base * count : 0));
}

/** The Friday on or after a day, as a date. Releases ride the same weekly job as everything else. */
export function fridayOnOrAfter(from: Date): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------

export const EVIDENCE_KINDS = ["photo", "link", "document", "note"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceVisibility = "private" | "public";

export type EvidenceInput = { kind: EvidenceKind; url?: string | null; note?: string | null; showsMinor?: boolean; visibility?: EvidenceVisibility };

/**
 * What may be stored, in words a person can act on. Null means it may.
 *
 * Evidence is private unless this one item is published, and never publishable when it shows a
 * minor or comes from a youth team. The database holds both rules again (migration 0045).
 */
export function evidenceProblem(input: EvidenceInput, context: { youth: boolean }): string | null {
  if (!EVIDENCE_KINDS.includes(input.kind)) return "Choose what kind of evidence this is.";
  const url = input.url?.trim() ?? "";
  const note = input.note?.trim() ?? "";
  if (!url && !note) return "Add a link or a note.";
  if (url && !/^https:\/\/[^\s/?#]+\.[^\s/?#]+/.test(url)) return "Enter a full address starting with https://.";
  if (url.length > 500) return "Keep the link under 500 characters.";
  if (note.length > 2000) return "Keep the note under 2,000 characters.";
  if (input.visibility === "public" && input.showsMinor) return "An item that shows a minor stays private.";
  if (input.visibility === "public" && context.youth) return "Evidence from a youth team is never published.";
  return null;
}

/** Who may see one evidence item. The fundraiser being public is not on this list. */
export function mayViewEvidence(item: { visibility: EvidenceVisibility; showsMinor: boolean; removed: boolean }, viewer: "organizer" | "sponsor" | "door_money" | "public"): boolean {
  if (item.removed) return viewer === "door_money";
  if (viewer !== "public") return true;
  return item.visibility === "public" && !item.showsMinor;
}
