import Stripe from "stripe";

// One Stripe client for the server. The API version pins behaviour; bump deliberately.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

/**
 * Charge model (see docs/ROADMAP.md, Phase 3):
 * - Charge the patron on the platform account.
 * - Hold the balance.
 * - Transfer weekly slices to the act's Connect account, with Door Money's 15%
 *   taken as the difference (the platform keeps what it doesn't transfer).
 *
 * Nothing here moves real money yet. These are the shapes Phase 3 fills in.
 */
export async function createHoldPaymentIntent(params: {
  amountCents: number;
  patronEmail: string;
  metadata: Record<string, string>;
}) {
  return stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: "usd",
    receipt_email: params.patronEmail,
    metadata: params.metadata,
    automatic_payment_methods: { enabled: true },
  });
}

export async function transferSliceToAct(params: {
  amountCents: number;
  stripeAccountId: string;
  sourcePaymentIntentId?: string;
  idempotencyKey: string;
}) {
  return stripe.transfers.create(
    {
      amount: params.amountCents,
      currency: "usd",
      destination: params.stripeAccountId,
      ...(params.sourcePaymentIntentId ? { source_transaction: params.sourcePaymentIntentId } : {}),
    },
    { idempotencyKey: params.idempotencyKey },
  );
}
