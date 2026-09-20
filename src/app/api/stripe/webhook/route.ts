import { NextResponse } from "next/server";
import { runClaimedEvent, storeAndClaim } from "@/lib/stripeEvents";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Stripe webhook. The signature is checked, the event is written down and claimed, and then it is
 * run. A second delivery of an event already settled is answered without acting on it.
 *
 * What the route decides is only what to tell Stripe. A 200 means Stripe never sends this event
 * again, so it is said only when the event is recorded and finished, or when it was finished
 * earlier. Everything else asks for the event back with a 500: a handler that failed, and, since
 * migration 0039, a row that could not be written at all. That last case used to answer 200 and
 * lose the event, because any failed insert was read as a duplicate.
 *
 * The work itself, and the record of it, live in src/lib/stripeEvents.ts, which the daily worker
 * shares so a failed event is retried from the payload stored here.
 *
 * Fulfilment lives here, not on the return page: a patron can pay and close the tab before the
 * page ever reloads.
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
  const stored = await storeAndClaim(sb, event);

  if (stored.outcome === "duplicate") return NextResponse.json({ received: true, duplicate: true });
  if (stored.outcome === "error") {
    console.error("could not record webhook event", event.type, event.id, stored.reason);
    return NextResponse.json({ error: "could not record the event" }, { status: 500 });
  }

  const r = await runClaimedEvent(sb, event, stored.attempts);
  if (!r.ok) return NextResponse.json({ error: "handler failed" }, { status: 500 });
  return NextResponse.json({ received: true, outcome: r.outcome });
}
