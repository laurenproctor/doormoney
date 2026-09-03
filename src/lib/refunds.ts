import type { SupabaseClient } from "@supabase/supabase-js";
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

type PurchaseForRefund = {
  id: string;
  amount_cents: number;
  fee_cents: number;
  refunded_cents: number;
  payment_status: string;
  stripe_payment_intent_id: string | null;
  lot_id: string;
};

/** How much goes back, given what has already been sent to the act. */
export function refundDue(p: { amount_cents: number; fee_cents: number }, paidNetCents: number) {
  const net = p.amount_cents - p.fee_cents;
  if (net <= 0) return p.amount_cents;
  const unpaid = Math.max(0, net - paidNetCents);
  return Math.round((p.amount_cents * unpaid) / net);
}

/**
 * Refunds the unreleased part of one purchase and skips its remaining slices.
 * Idempotent through the Stripe idempotency key and the refunded_cents check.
 */
export async function refundPurchase(sb: Admin, purchaseId: string, reason: RefundReason) {
  const { data } = await sb.from("purchases").select("id,amount_cents,fee_cents,refunded_cents,payment_status,stripe_payment_intent_id,lot_id").eq("id", purchaseId).maybeSingle();
  const p = data as PurchaseForRefund | null;
  if (!p) return { ok: false as const, reason: "purchase not found" };
  if (!["held", "released"].includes(p.payment_status)) return { ok: true as const, refundedCents: 0, already: true };
  if (p.refunded_cents > 0) return { ok: true as const, refundedCents: 0, already: true };

  const { data: slices } = await sb.from("payout_schedule").select("id,amount_cents,status").eq("purchase_id", p.id);
  const paidNet = (slices ?? []).filter((s) => s.status === "paid").reduce((n, s) => n + s.amount_cents, 0);
  const amount = refundDue(p, paidNet);

  // Nothing left to send to the act either way.
  await sb.from("payout_schedule").update({ status: "skipped", paused_reason: reason }).eq("purchase_id", p.id).in("status", ["scheduled", "paused"]);

  if (amount <= 0) return { ok: true as const, refundedCents: 0, already: false };
  if (!p.stripe_payment_intent_id) return { ok: false as const, reason: "purchase has no payment to refund" };

  await stripe.refunds.create(
    { payment_intent: p.stripe_payment_intent_id, amount, reason: "requested_by_customer", metadata: { purchase_id: p.id, door_money_reason: reason } },
    { idempotencyKey: `refund_${p.id}_${reason}` },
  );
  await sb
    .from("purchases")
    .update({ refunded_cents: amount, refunded_at: new Date().toISOString(), payment_status: amount >= p.amount_cents ? "refunded" : "partially_refunded" })
    .eq("id", p.id)
    .eq("refunded_cents", 0);
  return { ok: true as const, refundedCents: amount, already: false };
}

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
    if (p.patrons?.contact_email && lot) {
      const mail = cancellationNotice({
        to: p.patrons.contact_email,
        patronName: p.patrons.name,
        actName: run.acts.name,
        runTitle: run.title,
        lotName: lotName(lot),
        refundedCents: r.refundedCents,
        amountCents: p.amount_cents,
        recordUrl: `${SITE.url}/record/${p.id}`,
      });
      const sent = await sendEmail(mail);
      if (!sent.sent) console.error("cancellation notice not sent", p.id, sent.reason);
    }
  }
  return { ok: true as const, refundedCents: refunded, patrons, errors };
}
