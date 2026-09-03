import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Stripe webhook. Every handler must be idempotent: we record the event id first
 * and bail if we've seen it. Phase 3 fills in the branches.
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

  switch (event.type) {
    case "payment_intent.succeeded":
      // TODO Phase 3: mark purchase/backing as 'held', build payout_schedule rows via weeklySlices()
      break;
    case "payment_intent.payment_failed":
      // TODO Phase 3: mark as failed, for auctions start the roll-to-next-bid clock
      break;
    case "account.updated": {
      // Express onboarding finished, or Stripe changed its mind. Mirror the flag on the act.
      const account = event.data.object;
      const enabled = Boolean(account.payouts_enabled);
      const { error: e } = await sb.from("acts").update({ stripe_payouts_enabled: enabled }).eq("stripe_account_id", account.id);
      if (e) console.error("account.updated: could not update act", account.id, e.message);
      break;
    }
    case "transfer.created":
      // TODO Phase 3: mark payout_schedule row as paid
      break;
  }
  return NextResponse.json({ received: true });
}
