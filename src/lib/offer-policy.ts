/**
 * The delivery policy an offer is written under, in the sentences an organizer and a sponsor read.
 *
 * `delivery_policies` (migration 0045) holds one row per category per version: the release rule, how
 * long the sponsor has to send their materials, and the matrix's cells in words. src/lib/payment-gate.ts
 * asks the same table a different question, which is whether money may move at all. This asks what
 * the terms say, so the editor can state them instead of letting an organizer promise something else.
 *
 * Nothing here is an organizer's to choose. What happens if a sponsorship is called off, what is
 * refunded, and what happens when materials never arrive are the policy's answers, the same for
 * every offer in the category, and recorded against the purchase by its version
 * (`purchase_snapshots`). The editor shows them and offers a note beside them, which is display only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentPolicy, type PolicyStatus, type ReleaseRule } from "@/lib/delivery-policy";
import { LATE_MATERIALS_CONSEQUENCE } from "@/lib/offer-terms";

export type OfferPolicy = {
  categoryKey: string;
  version: number;
  status: PolicyStatus;
  releaseRule: ReleaseRule;
  /** How long the sponsor has to send their materials where the offer does not say. */
  materialsWindowDays: number;
  /** The matrix's cells in words, as the policy row carries them. Absent keys simply draw nothing. */
  terms: Record<string, string>;
};

type PolicyRow = { category_key: string; version: number; status: string; release_rule: string; materials_window_days: number; terms: unknown };

/**
 * The policy a new sponsorship in this category would be sold under, or null where the category has
 * none at all. Null is a real answer and not a failure: Restaurants & hospitality and Other have no
 * row on purpose, which is exactly why nothing in them can be bought.
 */
export async function loadOfferPolicy(sb: SupabaseClient, categoryKey: string | null | undefined): Promise<OfferPolicy | null> {
  const key = categoryKey ?? "music";
  const { data, error } = await sb
    .from("delivery_policies")
    .select("category_key,version,status,release_rule,materials_window_days,terms")
    .eq("category_key", key);
  if (error || !data?.length) return null;
  const row = currentPolicy(data as PolicyRow[]);
  if (!row) return null;
  const terms = row.terms && typeof row.terms === "object" && !Array.isArray(row.terms) ? (row.terms as Record<string, string>) : {};
  return {
    categoryKey: row.category_key,
    version: row.version,
    status: row.status as PolicyStatus,
    releaseRule: row.release_rule === "evidence" ? "evidence" : "calendar",
    materialsWindowDays: row.materials_window_days,
    terms,
  };
}

export type PolicyStatement = { key: string; label: string; sentence: string };

/**
 * What the policy decides, as three statements the editor and the sponsor's summary both show.
 *
 * Where the policy row has written its own words, those are used. Where it has not, the statement
 * falls back to what the code does, which is the same thing said more plainly. A category with no
 * policy gets the one sentence that is true of it: nothing in it can be bought yet.
 */
export function policyStatements(policy: OfferPolicy | null): PolicyStatement[] {
  if (!policy) {
    return [{
      key: "none",
      label: "Cancellation and refunds",
      sentence: "Door Money has not set a delivery policy for this kind of fundraiser yet, so nothing in it can be bought and no cancellation or refund terms apply.",
    }];
  }
  const t = policy.terms;
  return [
    {
      key: "organizer_cancellation",
      label: "If the organizer calls it off",
      sentence: t.organizer_cancellation ?? "Every share not yet released goes back to the sponsor, with Door Money's fee on that share. Anything already released stays released.",
    },
    {
      key: "sponsor_cancellation",
      label: "If the sponsor wants out",
      sentence: t.sponsor_cancellation ?? "Not offered. A sponsor may flag a placement and Door Money looks at it.",
    },
    {
      key: "unresolved_materials",
      label: "If the sponsor never sends their materials",
      sentence: t.unresolved_materials && t.unresolved_materials !== "Held. Open: decision 16." ? t.unresolved_materials : LATE_MATERIALS_CONSEQUENCE,
    },
  ];
}

/** How the organizer's share is released under this policy, in one sentence. */
export function releaseSentenceFor(policy: OfferPolicy | null): string | null {
  if (!policy) return null;
  return policy.terms.release ?? (policy.releaseRule === "evidence"
    ? "Door Money releases the organizer's share as each deliverable is documented, once the sponsor's materials are accepted."
    : "Door Money releases the organizer's share in weekly slices across the fundraiser's dates, once the sponsor's materials are accepted.");
}

/**
 * The same three statements, out of a purchase snapshot instead of the live policy.
 *
 * What a sponsor was sold under, not what the category says today. The snapshot records the policy
 * version and its words at the moment of purchase (migration 0045) and can never be edited, so a
 * later version of the policy cannot rewrite what somebody already bought.
 */
export function policyStatementsFromSnapshot(snapshot: unknown): PolicyStatement[] {
  const policy = (snapshot as { policy?: { release_rule?: string; materials_window_days?: number; terms?: unknown; category_key?: string; version?: number } } | null)?.policy;
  if (!policy?.category_key) return [];
  const terms = policy.terms && typeof policy.terms === "object" && !Array.isArray(policy.terms) ? (policy.terms as Record<string, string>) : {};
  return policyStatements({
    categoryKey: policy.category_key,
    version: policy.version ?? 1,
    status: "active",
    releaseRule: policy.release_rule === "evidence" ? "evidence" : "calendar",
    materialsWindowDays: policy.materials_window_days ?? 14,
    terms,
  });
}
