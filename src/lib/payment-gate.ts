/**
 * Which categories may take real money.
 *
 * Music has its whole path built: checkout, the hold, weekly release, the record. Sports, film and
 * theater can publish and can be paid in Stripe's test mode, which is how their checkout is
 * verified (docs/EXPANSION_PLAN.md, Phase 3). They cannot take a live payment until the delivery
 * and release policy for them exists (Phase 4, decision 17): a charge with no settled answer to
 * "what was promised, and what happens if it is not delivered" is not a finished product.
 *
 * That rule was only ever written down. This is it in code, asked wherever a payment can start.
 * It loosens nothing: music is unchanged, and every other category is refused exactly where it
 * would otherwise have been charged for real.
 */

/** A live secret or restricted key. Test keys are sk_test_ and rk_test_. */
export function stripeLiveMode(key: string | undefined = process.env.STRIPE_SECRET_KEY): boolean {
  return /^(sk|rk)_live_/.test(key ?? "");
}

/** Whether a fundraiser in this category may start a payment right now. */
export function categoryPaymentsOpen(categoryKey: string | null | undefined, live: boolean = stripeLiveMode()): boolean {
  if ((categoryKey ?? "music") === "music") return true;
  return !live;
}

/** What a sponsor is told. Says what is true, and promises no date. */
export const CATEGORY_PAYMENTS_CLOSED = "Payments are not open for this kind of fundraiser yet.";
