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

/* ---------------------------------------------------------------------------------------------
   Bidding with a card on file (docs/DECISIONS.md, decision 4).

   A bid saves a card and charges nothing. At the close the winner's card is charged off-session,
   on the same terms as every other charge here: the money lands on the platform balance and the
   Friday job moves the act's share out, so Door Money's 15% is the part never transferred.

   Not an authorization hold. Card authorizations lapse after about a week and a close is usually
   weeks out, so a hold would have to be re-placed on a schedule and would tie up an outbid
   patron's money in the meantime. A saved card holds nothing.
   --------------------------------------------------------------------------------------------- */

/**
 * The Stripe customer a patron's cards hang off, created on first use.
 *
 * A patron is one row per (name, email), so the customer follows the same identity: somebody who
 * bids twice on two boards has one customer and one saved card.
 */
export async function customerForPatron(params: { existingId: string | null; name: string; email: string; patronId: string }) {
  if (params.existingId) return params.existingId;
  const customer = await stripe.customers.create({
    name: params.name,
    email: params.email,
    metadata: { patron_id: params.patronId },
  });
  return customer.id;
}

/**
 * Stores a card against a patron, ready for the close. Charges nothing now.
 *
 * `usage: "off_session"` tells the card's bank at storage time that a later charge will happen with
 * nobody present, which is what lets most cards clear that charge without a second authentication.
 */
export async function createBidSetupIntent(params: { customerId: string; lotId: string; patronId: string }) {
  return stripe.setupIntents.create({
    customer: params.customerId,
    usage: "off_session",
    payment_method_types: ["card"],
    // SetupIntents take no integration_identifier, unlike a Checkout Session; the metadata is what
    // tells a bid card apart from any other saved card in the Dashboard.
    metadata: { kind: "bid", lot_id: params.lotId, patron_id: params.patronId },
  });
}

/**
 * Charges a saved card for a won bid, with nobody at the keyboard.
 *
 * `off_session: true` is a declaration to the bank, not a convenience: it is what makes a decline
 * for "authentication required" arrive as an error here rather than as a payment waiting for a
 * person who is not there. The caller treats any failure as a fallback to the claim link.
 *
 * The idempotency key is the purchase row id, so a close that runs twice charges once.
 */
export async function chargeSavedCard(params: {
  purchaseId: string;
  lotId: string;
  actId: string;
  actSlug: string;
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  description: string;
  patronEmail: string;
}) {
  return stripe.paymentIntents.create(
    {
      amount: params.amountCents,
      currency: "usd",
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      off_session: true,
      confirm: true,
      receipt_email: params.patronEmail,
      description: params.description,
      metadata: {
        kind: "lot",
        purchase_id: params.purchaseId,
        lot_id: params.lotId,
        act_id: params.actId,
        act_slug: params.actSlug,
        won_at_auction: "true",
      },
    },
    { idempotencyKey: `bid-charge-${params.purchaseId}` },
  );
}
