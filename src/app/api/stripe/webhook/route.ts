import { NextResponse } from "next/server";
import { dropBacking, fulfilBacking } from "@/lib/backings";
import { tierPlace } from "@/lib/catalog";
import { payoutsOn, refundIssued, sendEmail } from "@/lib/email";
import { fulfilLotPurchase, lotName, ownerEmail, releaseLot } from "@/lib/purchases";
import { SITE } from "@/lib/site";
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

          // Door Money's own cancel and decline paths record the refund before Stripe reports it,
          // so they never reach this line. What does reach it is a refund made by hand, which
          // would otherwise put money back without a word to the patron.
          const detail = await refundDetail(sb, table, p.id);
          if (detail?.to) {
            const r = await sendEmail(
              refundIssued({
                to: detail.to,
                patronName: detail.patronName,
                actName: detail.actName,
                what: detail.what,
                refundedCents: charge.amount_refunded - p.refunded_cents,
                full,
                recordUrl: `${SITE.url}/record/${p.id}`,
              }),
            );
            if (!r.sent) console.error("refund notice not sent", table, p.id, r.reason);
          }
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
        // Read first, so the act is only congratulated on the change from off to on.
        const { data: before } = await sb.from("acts").select("id,name,owner_id,stripe_payouts_enabled").eq("stripe_account_id", account.id).maybeSingle();
        const { error: e } = await sb.from("acts").update({ stripe_payouts_enabled: enabled }).eq("stripe_account_id", account.id);
        if (e) console.error("account.updated: could not update act", account.id, e.message);
        if (before && enabled && !before.stripe_payouts_enabled) {
          const owner = await ownerEmail(sb, before.owner_id);
          if (owner) {
            const r = await sendEmail(payoutsOn({ to: owner, actName: before.name, dashboardUrl: `${SITE.url}/dashboard/payouts` }));
            if (!r.sent) console.error("payouts-on notice not sent", before.id, r.reason);
          }
        }
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

/**
 * Who to write to about a refund, and what the money was for. A lot purchase and a fan backing
 * describe themselves differently, so each is read on its own terms.
 */
async function refundDetail(sb: ReturnType<typeof supabaseAdmin>, table: "purchases" | "backings", id: string) {
  if (table === "purchases") {
    const { data } = await sb
      .from("purchases")
      .select("patrons(name,contact_email),lots!inner(label,surface_key,runs!inner(acts!inner(name)))")
      .eq("id", id)
      .maybeSingle();
    type R = { patrons: { name: string; contact_email: string } | null; lots: { label: string | null; surface_key: string; runs: { acts: { name: string } } } };
    const row = data as unknown as R | null;
    if (!row) return null;
    return { to: row.patrons?.contact_email ?? null, patronName: row.patrons?.name ?? "A patron", actName: row.lots.runs.acts.name, what: `the ${lotName(row.lots).toLowerCase()}` };
  }
  const { data } = await sb.from("backings").select("display_name,tier,patrons(contact_email),runs!inner(acts!inner(name))").eq("id", id).maybeSingle();
  type B = { display_name: string; tier: string; patrons: { contact_email: string } | null; runs: { acts: { name: string } } };
  const row = data as unknown as B | null;
  if (!row) return null;
  return { to: row.patrons?.contact_email ?? null, patronName: row.display_name, actName: row.runs.acts.name, what: `a name on ${tierPlace(row.tier)}` };
}
