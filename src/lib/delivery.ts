import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverableShares, evidenceProblem, fridayOnOrAfter, releaseRuleOf, type EvidenceInput, type ReleaseRule } from "@/lib/delivery-policy";

/*
  Deliverables, evidence, and the release that follows them. Server only, service-role client.

  Nothing here talks to Stripe. Releasing means laying a row in payout_schedule, exactly as a
  calendar slice is laid, and the Friday job pays it through the same slicePlan, the same database
  guard (migration 0031: the sponsor's materials must have been accepted) and the same idempotency
  key, which is the payout row's id. So a release cannot be paid twice, cannot be paid before the
  materials are accepted, and is refunded by refundDue like any other unreleased share.

  Every function is safe to run twice. Each write is conditional on the state it expects, and the
  one-row-per-deliverable rule is a unique index in the database, not a check made here.
*/

type Admin = SupabaseClient;

/**
 * The release rule a purchase was sold under, read from its immutable snapshot.
 *
 * Calendar when there is no snapshot to read. That covers a purchase made before migration 0045,
 * and it covers this code deployed before the migration is applied, where the table does not
 * exist: in both cases the purchase behaves exactly as purchases always have.
 */
export async function releaseRuleForPurchase(sb: Admin, purchaseId: string): Promise<ReleaseRule> {
  try {
    const { data, error } = await sb.from("purchase_snapshots").select("snapshot").eq("purchase_id", purchaseId).maybeSingle();
    if (error || !data) return "calendar";
    return releaseRuleOf((data as { snapshot: unknown }).snapshot);
  } catch {
    return "calendar";
  }
}

type DeliverableRow = {
  id: string;
  purchase_id: string;
  position: number;
  status: string;
  purchases: { id: string; amount_cents: number; fee_cents: number; payment_status: string; lots: { runs: { act_id: string; category_details: Record<string, string> | null } } };
};

export type EvidenceResult =
  | { ok: true; evidenceId: string; released: boolean; releaseCents: number }
  | { ok: false; error: string };

/**
 * The organizer documents one deliverable.
 *
 * Stores the evidence (private unless this item is published), marks the deliverable delivered,
 * and lays that deliverable's share of the organizer's net for the next Friday. Ownership is the
 * caller's job and is done before this runs. Door Money checks that evidence exists here, and
 * never whether it is good.
 */
export async function submitEvidence(sb: Admin, params: { deliverableId: string; submittedBy: string; evidence: EvidenceInput; now?: Date }): Promise<EvidenceResult> {
  const { data, error } = await sb
    .from("deliverables")
    .select("id,purchase_id,position,status,purchases!inner(id,amount_cents,fee_cents,payment_status,lots!inner(runs!inner(act_id,category_details)))")
    .eq("id", params.deliverableId)
    .maybeSingle();
  if (error) return { ok: false, error: "That did not load. Try once more." };
  const d = data as unknown as DeliverableRow | null;
  if (!d) return { ok: false, error: "That deliverable is not on this account." };

  const youth = d.purchases.lots.runs.category_details?.level === "youth";
  const problem = evidenceProblem(params.evidence, { youth });
  if (problem) return { ok: false, error: problem };

  // Money that has gone back is owed nothing, and money never paid has nothing to release.
  if (d.purchases.payment_status !== "held") return { ok: false, error: "This sponsorship is not being held, so there is nothing to deliver against." };

  const { data: stored, error: storeError } = await sb
    .from("evidence")
    .insert({
      deliverable_id: d.id,
      kind: params.evidence.kind,
      url: params.evidence.url?.trim() || null,
      note: params.evidence.note?.trim() || null,
      visibility: params.evidence.visibility ?? "private",
      shows_minor: Boolean(params.evidence.showsMinor),
      submitted_by: params.submittedBy,
    })
    .select("id")
    .single();
  if (storeError || !stored) return { ok: false, error: "That did not save. Try once more." };

  await sb.from("deliverables").update({ status: "delivered", delivered_at: (params.now ?? new Date()).toISOString() }).eq("id", d.id).eq("status", "pending");

  const release = await releaseDeliverable(sb, d, params.now ?? new Date());
  return { ok: true, evidenceId: (stored as { id: string }).id, released: release.laid, releaseCents: release.cents };
}

/**
 * Lays one deliverable's share. Once: payout_schedule carries a unique index on deliverable_id, so
 * a second call, a retry, or two organizers clicking at once all end with one row.
 */
async function releaseDeliverable(sb: Admin, d: DeliverableRow, now: Date): Promise<{ laid: boolean; cents: number }> {
  const { data: siblings } = await sb.from("deliverables").select("id,position,status").eq("purchase_id", d.purchase_id).order("position");
  const owed = ((siblings ?? []) as { id: string; position: number; status: string }[]).filter((s) => s.status !== "waived");
  const index = owed.findIndex((s) => s.id === d.id);
  if (index < 0) return { laid: false, cents: 0 };

  const net = d.purchases.amount_cents - d.purchases.fee_cents;
  const cents = deliverableShares(net, owed.length)[index];
  const { error } = await sb.from("payout_schedule").insert({
    act_id: d.purchases.lots.runs.act_id,
    purchase_id: d.purchase_id,
    deliverable_id: d.id,
    due_on: fridayOnOrAfter(now),
    amount_cents: cents,
  });
  // 23505: this deliverable's share is already laid. That is the idempotent answer, not a failure.
  if (error && error.code !== "23505") throw new Error(`release for deliverable ${d.id}: ${error.message}`);
  return { laid: !error, cents };
}

/** The organizer publishes one item, or takes it back. The database refuses a minor and a youth team. */
export async function setEvidenceVisibility(sb: Admin, evidenceId: string, visibility: "private" | "public"): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("evidence").update({ visibility }).eq("id", evidenceId).is("removed_at", null);
  if (!error) return { ok: true };
  if (error.message.includes("evidence_youth_private")) return { ok: false, error: "Evidence from a youth team is never published." };
  if (error.code === "23514") return { ok: false, error: "An item that shows a minor stays private." };
  return { ok: false, error: "That did not save. Try once more." };
}
