import type { SupabaseClient } from "@supabase/supabase-js";
import { recordRefund } from "@/lib/ledger";
import { stripe } from "@/lib/stripe";

/*
  Money going back. The rule is the one on /terms: a patron gets back every slice not yet released,
  and Door Money returns its fee on that part too. Slices already paid for weeks the run played stay
  paid. Before the first slice, that is everything.

  refund = amount * (unpaid share of the act's net) / (act's net)
*/

type Admin = SupabaseClient;

/**
 * Why money goes back. Matches the refund_reason enum (migrations 0032, 0034).
 * - run_cancelled: the musician called the fundraiser off.
 * - mark_declined: the musician refused the sponsor's logo.
 * - stale_offer: the payment landed for an auction offer that had already moved on to another bid.
 */
export type RefundReason = "run_cancelled" | "mark_declined" | "stale_offer";

type RowForRefund = {
  id: string;
  amount_cents: number;
  fee_cents: number;
  refunded_cents: number;
  payment_status: string;
  stripe_payment_intent_id: string | null;
};

/** A lot purchase and a fan backing refund the same way; only the table and the schedule column differ. */
const SOURCES = {
  purchases: { column: "purchase_id", key: "purchase" },
  backings: { column: "backing_id", key: "backing" },
} as const;
type SourceTable = keyof typeof SOURCES;

/** How much goes back, given what has already been sent to the act. */
export function refundDue(p: { amount_cents: number; fee_cents: number }, paidNetCents: number) {
  const net = p.amount_cents - p.fee_cents;
  if (net <= 0) return p.amount_cents;
  const unpaid = Math.max(0, net - paidNetCents);
  return Math.round((p.amount_cents * unpaid) / net);
}

/**
 * Refunds the unreleased part of one purchase or backing and skips its remaining slices.
 * Idempotent through the Stripe idempotency key and the refunded_cents check.
 */
async function refundRow(sb: Admin, table: SourceTable, id: string, reason: RefundReason) {
  const { column, key } = SOURCES[table];
  const { data } = await sb.from(table).select("id,amount_cents,fee_cents,refunded_cents,payment_status,stripe_payment_intent_id").eq("id", id).maybeSingle();
  const p = data as RowForRefund | null;
  if (!p) return { ok: false as const, reason: `${key} not found` };
  if (!["held", "released"].includes(p.payment_status)) return { ok: true as const, refundedCents: 0, already: true };
  if (p.refunded_cents > 0) return { ok: true as const, refundedCents: 0, already: true };

  const { data: slices } = await sb.from("payout_schedule").select("id,amount_cents,status").eq(column, p.id);
  const paidNet = (slices ?? []).filter((s) => s.status === "paid").reduce((n, s) => n + s.amount_cents, 0);
  const net = p.amount_cents - p.fee_cents;
  const amount = refundDue(p, paidNet);

  // Nothing left to send to the act either way.
  await sb.from("payout_schedule").update({ status: "skipped", paused_reason: reason }).eq(column, p.id).in("status", ["scheduled", "paused"]);

  if (amount <= 0) return { ok: true as const, refundedCents: 0, already: false };
  if (!p.stripe_payment_intent_id) return { ok: false as const, reason: `${key} has no payment to refund` };

  const refund = await stripe.refunds.create(
    { payment_intent: p.stripe_payment_intent_id, amount, reason: "requested_by_customer", metadata: { [column]: p.id, door_money_reason: reason } },
    { idempotencyKey: `refund_${p.id}_${reason}` },
  );
  // The books, before the row is marked: a write that fails after this is retried into "already"
  // above, and the refund would never reach the ledger. Keyed by the total refunded, which is what
  // the charge.refunded webhook for this same refund also names, so whichever arrives second
  // finds it written. The unreleased net is this function's own figure from payout_schedule.
  await recordRefund(sb, table === "purchases" ? { purchaseId: p.id } : { backingId: p.id }, {
    by: "door_money",
    refundCents: amount,
    totalRefundedCents: amount,
    unreleasedNetCents: Math.max(0, net - paidNet),
    stripeObjectId: refund.id,
    occurredAt: typeof refund.created === "number" ? new Date(refund.created * 1000) : null,
  });
  await sb
    .from(table)
    .update({ refunded_cents: amount, refunded_at: new Date().toISOString(), payment_status: amount >= p.amount_cents ? "refunded" : "partially_refunded" })
    .eq("id", p.id)
    .eq("refunded_cents", 0);
  return { ok: true as const, refundedCents: amount, already: false };
}

export const refundPurchase = (sb: Admin, purchaseId: string, reason: RefundReason) => refundRow(sb, "purchases", purchaseId, reason);
export const refundBacking = (sb: Admin, backingId: string, reason: RefundReason) => refundRow(sb, "backings", backingId, reason);

/* ---------------------------------------------------------------------------------------------
   Writing down that a refund is owed, before Stripe is called.

   The obligation has to outlive the request that created it. Until migration 0032 it did not: a
   cancelled fundraiser refunded its patrons in one in-memory loop, and a process that died halfway
   left nothing anywhere saying the rest were owed. src/lib/outbox.ts is what works the queue; this
   is the write, kept here because deciding a refund is owed is this file's job.
   --------------------------------------------------------------------------------------------- */

/** Stripe sees this string too: refundRow above passes the same one as its idempotency key. */
export const refundKey = (rowId: string, reason: RefundReason) => `refund_${rowId}_${reason}`;

/**
 * Queues one refund. Idempotent on the key, so the same obligation cannot be written twice and a
 * second cancel of the same fundraiser adds nothing.
 */
export async function queueRefund(sb: Admin, source: SourceTable, rowId: string, reason: RefundReason) {
  const column = SOURCES[source].column;
  const { error } = await sb
    .from("financial_operations")
    .upsert({ kind: "refund", [column]: rowId, reason, idempotency_key: refundKey(rowId, reason) }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (error) throw new Error(`queue refund ${rowId}: ${error.message}`);
  return refundKey(rowId, reason);
}

type RunRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  acts: { id: string; name: string; slug: string };
};

/**
 * The act pulls the run. Every open spot comes off the board, any checkout in progress is closed,
 * and every patron still holding money has a refund written down for them.
 *
 * It writes the obligations rather than paying them. The money goes back in src/lib/outbox.ts, from
 * the keys returned here and from the daily job, so a refund that Stripe refuses on the day is
 * still owed tomorrow. Before migration 0032 this loop was the only record that it was owed at all,
 * and a process that died partway through lost the rest.
 *
 * The fundraiser is marked cancelled first, so that nothing new can be sold into a fundraiser that
 * is coming down. A crash between that and the queueing below is what sweepCancelledRuns exists
 * for: it asks which patron is still holding money on a cancelled fundraiser rather than trusting
 * this request to have finished.
 */
export async function cancelRun(sb: Admin, runId: string) {
  const { data } = await sb.from("runs").select("id,title,kind,status,acts!inner(id,name,slug)").eq("id", runId).maybeSingle();
  const run = data as unknown as RunRow | null;
  if (!run) return { ok: false as const, error: "That run is not on this account." };
  if (!["open", "live"].includes(run.status)) return { ok: false as const, error: "Only an open or live run can be cancelled." };

  const { data: marked } = await sb.from("runs").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", run.id).in("status", ["open", "live"]).select("id");
  if (!marked?.length) return { ok: false as const, error: "That run is already cancelled." };

  const { data: lots } = await sb.from("lots").select("id").eq("run_id", run.id);
  const lotIds = (lots ?? []).map((l) => l.id);
  await sb.from("lots").update({ status: "cancelled", funding_deadline: null }).eq("run_id", run.id).in("status", ["open", "pending_funding", "unsold"]);

  type P = { id: string; payment_status: string; stripe_checkout_session_id: string | null };
  type B = { id: string; payment_status: string; stripe_payment_intent_id: string | null };
  const { data: purchases } = lotIds.length
    ? await sb.from("purchases").select("id,payment_status,stripe_checkout_session_id").in("lot_id", lotIds)
    : { data: [] };
  const { data: backings } = await sb.from("backings").select("id,payment_status,stripe_payment_intent_id").eq("run_id", run.id);

  const owed: string[] = [];
  for (const p of (purchases ?? []) as P[]) {
    if (p.payment_status === "requires_payment") {
      // Mid-checkout. Expiring the session makes Stripe send checkout.session.expired, which drops the row.
      if (p.stripe_checkout_session_id) await stripe.checkout.sessions.expire(p.stripe_checkout_session_id).catch(() => undefined);
      continue;
    }
    owed.push(await queueRefund(sb, "purchases", p.id, "run_cancelled"));
  }
  // The fans who backed the run through the widget are owed theirs the same way.
  for (const b of (backings ?? []) as B[]) {
    if (b.payment_status === "requires_payment") {
      // Mid-payment in the widget. Cancelling the intent makes Stripe send payment_intent.canceled, which drops the row.
      if (b.stripe_payment_intent_id) await stripe.paymentIntents.cancel(b.stripe_payment_intent_id).catch(() => undefined);
      continue;
    }
    owed.push(await queueRefund(sb, "backings", b.id, "run_cancelled"));
  }

  return { ok: true as const, owed };
}
