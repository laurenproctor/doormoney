import { NextResponse } from "next/server";
import { dropBacking, fulfilBacking } from "@/lib/backings";
import { fulfilLotPurchase, releaseLot } from "@/lib/purchases";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Stripe webhook. The event id goes into stripe_events first; a second delivery of the same
 * event is answered without acting. Every handler is also conditional on the state it expects,
 * so even a replay with a fresh id cannot pay a lot twice or sell it twice.
 *
 * Fulfilment lives here, not on the return page: a patron can pay and close the tab before the
 * board ever reloads.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "webhook not configured" }, { status: 400 });

  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("stripe_events").insert({ id: event.id, type: event.type });
  if (error) return NextResponse.json({ received: true, duplicate: true }); // already handled

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        // With delayed payment methods `completed` arrives while the session is still unpaid; the
        // async_payment_succeeded event follows once the money is real. Fulfil on whichever is paid.
        if (session.payment_status === "unpaid") break;
        if (session.metadata?.kind !== "lot") break; // fan backings come through payment_intent.succeeded
        const r = await fulfilLotPurchase(sb, session);
        if (!r.ok) console.error("fulfil", event.id, r.reason);
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object;
        if (session.metadata?.kind !== "lot") break;
        await releaseLot(sb, session);
        break;
      }
      case "payment_intent.succeeded": {
        // A fan backing through the widget. Lot purchases also raise this event; they are fulfilled from the session above.
        const pi = event.data.object;
        if (pi.metadata?.kind !== "backing") break;
        const r = await fulfilBacking(sb, pi);
        if (!r.ok) console.error("fulfil backing", event.id, r.reason);
        break;
      }
      case "payment_intent.canceled": {
        const pi = event.data.object;
        if (pi.metadata?.kind !== "backing") break;
        await dropBacking(sb, pi);
        break;
      }
      case "charge.refunded": {
        // A refund happened, here or in the Dashboard. Mirror the amount; a full refund also stops the slices.
        // The charge belongs to a lot purchase or a fan backing; look in both places.
        const charge = event.data.object;
        for (const table of ["purchases", "backings"] as const) {
          const { data: p } = await sb.from(table).select("id,amount_cents,refunded_cents").eq("stripe_charge_id", charge.id).maybeSingle();
          if (!p) continue;
          if (charge.amount_refunded <= p.refunded_cents) break;
          const full = charge.amount_refunded >= p.amount_cents;
          await sb
            .from(table)
            .update({ refunded_cents: charge.amount_refunded, refunded_at: new Date().toISOString(), payment_status: full ? "refunded" : "partially_refunded" })
            .eq("id", p.id);
          if (full) await sb.from("payout_schedule").update({ status: "skipped", paused_reason: "refunded" }).eq(table === "purchases" ? "purchase_id" : "backing_id", p.id).in("status", ["scheduled", "paused"]);
          break;
        }
        break;
      }
      case "transfer.created": {
        // The payout job records the transfer itself; this catches a job that died between the two writes.
        const transfer = event.data.object;
        const payoutId = transfer.metadata?.payout_id;
        if (payoutId) {
          await sb
            .from("payout_schedule")
            .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date(transfer.created * 1000).toISOString() })
            .eq("id", payoutId)
            .eq("status", "scheduled");
        }
        break;
      }
      case "account.updated": {
        // Express onboarding finished, or Stripe changed its mind. Mirror the flag on the act.
        const account = event.data.object;
        const enabled = Boolean(account.payouts_enabled);
        const { error: e } = await sb.from("acts").update({ stripe_payouts_enabled: enabled }).eq("stripe_account_id", account.id);
        if (e) console.error("account.updated: could not update act", account.id, e.message);
        break;
      }
    }
  } catch (e) {
    // Let Stripe retry. Drop the event row so the retry is not mistaken for a duplicate.
    console.error("webhook handler failed", event.type, event.id, e instanceof Error ? e.message : e);
    await sb.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
