import Stripe from "stripe";

/** One Stripe client for the server. The SDK pins the API version (2026-08-26.dahlia at time of writing); bump deliberately. */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Tags lot checkouts in the Stripe Dashboard so they can be told apart from fan backings. */
const LOT_CHECKOUT_LABEL = "doormoney_lot_qhtzmvkr";

/** How long a patron has to finish paying once they start. The lot is held for them meanwhile. */
export const CHECKOUT_MINUTES = 30;

/**
 * Charge model (docs/ROADMAP.md, Phase 3; docs/DECISIONS.md, decision 2A):
 * - The patron pays Door Money through an embedded Checkout Session on Door Money's own page.
 *   The charge lands on the platform balance. No destination, no application fee on the charge.
 * - Door Money holds it. Every Friday through the run, one slice moves to the act's Connect account
 *   as a Transfer against that charge. Door Money's 15% is simply the part never transferred:
 *   the schedule is built from (amount - fee), so the fee is kept by arithmetic, not by a Stripe parameter.
 */
export async function createLotCheckoutSession(params: {
  purchaseId: string;
  lotId: string;
  actId: string;
  actSlug: string;
  amountCents: number;
  /** "Kick drum head, Gutter Hymns, Fall run" */
  description: string;
  patronEmail: string;
  /** Where the embedded checkout sends the patron afterwards. Must contain {CHECKOUT_SESSION_ID}. */
  returnUrl: string;
}) {
  const metadata = { purchase_id: params.purchaseId, lot_id: params.lotId, act_id: params.actId, act_slug: params.actSlug, kind: "lot" };
  return stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded_page",
    return_url: params.returnUrl,
    customer_email: params.patronEmail,
    line_items: [
      {
        quantity: 1,
        price_data: { currency: "usd", unit_amount: params.amountCents, product_data: { name: params.description } },
      },
    ],
    payment_intent_data: { description: params.description, metadata },
    metadata,
    // Stripe wants at least 30 minutes; the extra five keep a slow request from landing under the line.
    expires_at: Math.floor(Date.now() / 1000) + (CHECKOUT_MINUTES + 5) * 60,
    integration_identifier: LOT_CHECKOUT_LABEL,
  });
}

/**
 * A fan backing through the widget. Same charge model as a lot, but a PaymentIntent confirmed by the
 * Payment Element inside the widget's frame, since Checkout cannot be nested in another site's iframe.
 * The charge lands on the platform balance; the Friday job moves the act's share out.
 */
export async function createBackingIntent(params: {
  backingId: string;
  runId: string;
  actId: string;
  actSlug: string;
  tier: string;
  amountCents: number;
  /** "Name on the merch table card, Gutter Hymns, Fall run" */
  description: string;
  fanEmail: string;
}) {
  const metadata = { kind: "backing", backing_id: params.backingId, run_id: params.runId, act_id: params.actId, act_slug: params.actSlug, tier: params.tier };
  return stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: "usd",
    // Cards, with Apple Pay and Google Pay where the browser offers them. Not Link and not bank debits:
    // a fan backing is small and quick, and Link's phone prompt and the bank tab only get in the way.
    payment_method_types: ["card"],
    receipt_email: params.fanEmail,
    description: params.description,
    metadata,
  });
}

/** One weekly slice to an act. The idempotency key is the payout row id, so a retried job never pays twice. */
export async function transferSliceToAct(params: {
  amountCents: number;
  stripeAccountId: string;
  /** The charge the money came from. Lets the transfer go out before the balance is available. */
  sourceChargeId: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}) {
  return stripe.transfers.create(
    {
      amount: params.amountCents,
      currency: "usd",
      destination: params.stripeAccountId,
      source_transaction: params.sourceChargeId,
      metadata: params.metadata,
    },
    { idempotencyKey: params.idempotencyKey },
  );
}
