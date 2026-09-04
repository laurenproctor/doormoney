import type { SupabaseClient } from "@supabase/supabase-js";
import { tierPlace } from "@/lib/catalog";
import { cancellationNotice, sendEmail } from "@/lib/email";
import { lotName } from "@/lib/purchases";
import { SITE } from "@/lib/site";
import { stripe } from "@/lib/stripe";

/*
  Money going back. The rule is the one on /terms: a patron gets back every slice not yet released,
  and Door Money returns its fee on that part too. Slices already paid for weeks the run played stay
  paid. Before the first slice, that is everything.

  refund = amount * (unpaid share of the act's net) / (act's net)
*/

type Admin = SupabaseClient;

export type RefundReason = "run_cancelled" | "mark_declined";

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
  const amount = refundDue(p, paidNet);

  // Nothing left to send to the act either way.
  await sb.from("payout_schedule").update({ status: "skipped", paused_reason: reason }).eq(column, p.id).in("status", ["scheduled", "paused"]);

  if (amount <= 0) return { ok: true as const, refundedCents: 0, already: false };
  if (!p.stripe_payment_intent_id) return { ok: false as const, reason: `${key} has no payment to refund` };

  await stripe.refunds.create(
    { payment_intent: p.stripe_payment_intent_id, amount, reason: "requested_by_customer", metadata: { [column]: p.id, door_money_reason: reason } },
    { idempotencyKey: `refund_${p.id}_${reason}` },
  );
  await sb
    .from(table)
    .update({ refunded_cents: amount, refunded_at: new Date().toISOString(), payment_status: amount >= p.amount_cents ? "refunded" : "partially_refunded" })
    .eq("id", p.id)
    .eq("refunded_cents", 0);
  return { ok: true as const, refundedCents: amount, already: false };
}

export const refundPurchase = (sb: Admin, purchaseId: string, reason: RefundReason) => refundRow(sb, "purchases", purchaseId, reason);
export const refundBacking = (sb: Admin, backingId: string, reason: RefundReason) => refundRow(sb, "backings", backingId, reason);

type RunRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  acts: { id: string; name: string; slug: string };
};

/**
 * The act pulls the run. Every open spot comes off the board, every patron gets the unreleased part
 * back with a note, and any checkout in progress is closed. Returns what went back, for the dashboard.
 */
export async function cancelRun(sb: Admin, runId: string) {
  const { data } = await sb.from("runs").select("id,title,kind,status,acts!inner(id,name,slug)").eq("id", runId).maybeSingle();
  const run = data as unknown as RunRow | null;
  if (!run) return { ok: false as const, error: "That run is not on this account." };
  if (!["open", "live"].includes(run.status)) return { ok: false as const, error: "Only an open or live run can be cancelled." };

  const { data: marked } = await sb.from("runs").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", run.id).in("status", ["open", "live"]).select("id");
  if (!marked?.length) return { ok: false as const, error: "That run is already cancelled." };

  const { data: lots } = await sb.from("lots").select("id,label,surface_key,status").eq("run_id", run.id);
  const lotIds = (lots ?? []).map((l) => l.id);
  await sb.from("lots").update({ status: "cancelled", funding_deadline: null }).eq("run_id", run.id).in("status", ["open", "pending_funding", "unsold"]);

  const { data: purchases } = lotIds.length
    ? await sb.from("purchases").select("id,lot_id,amount_cents,payment_status,stripe_checkout_session_id,patrons(name,contact_email)").in("lot_id", lotIds)
    : { data: [] };
  type P = { id: string; lot_id: string; amount_cents: number; payment_status: string; stripe_checkout_session_id: string | null; patrons: { name: string; contact_email: string } | null };

  let refunded = 0;
  let patrons = 0;
  const errors: string[] = [];
  const notify = async (to: string, patronName: string, what: string, refundedCents: number, amountCents: number, recordId: string) => {
    const sent = await sendEmail(cancellationNotice({ to, patronName, actName: run.acts.name, runTitle: run.title, lotName: what, refundedCents, amountCents, recordUrl: `${SITE.url}/record/${recordId}` }));
    if (!sent.sent) console.error("cancellation notice not sent", recordId, sent.reason);
  };

  for (const p of (purchases ?? []) as unknown as P[]) {
    if (p.payment_status === "requires_payment") {
      // Mid-checkout. Expiring the session makes Stripe send checkout.session.expired, which drops the row.
      if (p.stripe_checkout_session_id) await stripe.checkout.sessions.expire(p.stripe_checkout_session_id).catch(() => undefined);
      continue;
    }
    const r = await refundPurchase(sb, p.id, "run_cancelled");
    if (!r.ok) {
      errors.push(`${p.id}: ${r.reason}`);
      continue;
    }
    refunded += r.refundedCents;
    patrons += 1;
    const lot = (lots ?? []).find((l) => l.id === p.lot_id);
    if (p.patrons?.contact_email && lot) await notify(p.patrons.contact_email, p.patrons.name, lotName(lot), r.refundedCents, p.amount_cents, p.id);
  }

  // The fans who backed the run through the widget get theirs back the same way.
  type B = { id: string; amount_cents: number; payment_status: string; tier: string; display_name: string; stripe_payment_intent_id: string | null; patrons: { contact_email: string } | null };
  const { data: backings } = await sb.from("backings").select("id,amount_cents,payment_status,tier,display_name,stripe_payment_intent_id,patrons(contact_email)").eq("run_id", run.id);
  for (const b of (backings ?? []) as unknown as B[]) {
    if (b.payment_status === "requires_payment") {
      // Mid-payment in the widget. Cancelling the intent makes Stripe send payment_intent.canceled, which drops the row.
      if (b.stripe_payment_intent_id) await stripe.paymentIntents.cancel(b.stripe_payment_intent_id).catch(() => undefined);
      continue;
    }
    const r = await refundBacking(sb, b.id, "run_cancelled");
    if (!r.ok) {
      errors.push(`${b.id}: ${r.reason}`);
      continue;
    }
    refunded += r.refundedCents;
    patrons += 1;
    if (b.patrons?.contact_email) await notify(b.patrons.contact_email, b.display_name, `name on ${tierPlace(b.tier)}`, r.refundedCents, b.amount_cents, b.id);
  }
  return { ok: true as const, refundedCents: refunded, patrons, errors };
}
