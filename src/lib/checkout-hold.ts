/**
 * How long a checkout holds an option, and where a checkout request comes from.
 *
 * The hold and the Stripe Checkout Session end together. Stripe will not make a session that lives
 * under thirty minutes, so the session is asked to end thirty minutes after the request, plus one
 * minute so that a slow request cannot land under Stripe's floor. When it ends, Stripe sends
 * checkout.session.expired and the webhook releases the hold (releaseLot in src/lib/purchases.ts).
 *
 * The database's own clearing of a lapsed hold (expire_stale_checkouts, migration 0035) waits a
 * little longer. A payment made in the session's last seconds is real before its webhook arrives,
 * and a competing buyer's request in that gap would otherwise clear the purchase from under it.
 * The grace is for that webhook, not for the buyer: the session is gone at its own expiry.
 *
 * Pure, so the route's tests can read the numbers off it.
 */

/** Stripe's floor for a Checkout Session's life, in minutes. Also what the checkout form tells the buyer. */
export const CHECKOUT_MINUTES = 30;
/** Added to the floor so that the session Stripe is asked for is never under it. */
const FLOOR_MARGIN_MINUTES = 1;
/** How long the database keeps the hold past the session, for a completed payment's webhook. */
export const CHECKOUT_GRACE_MINUTES = 2;

export function checkoutClock(now = new Date()): { sessionExpiresAt: Date; holdUntil: Date } {
  const sessionExpiresAt = new Date(now.getTime() + (CHECKOUT_MINUTES + FLOOR_MARGIN_MINUTES) * 60_000);
  const holdUntil = new Date(sessionExpiresAt.getTime() + CHECKOUT_GRACE_MINUTES * 60_000);
  return { sessionExpiresAt, holdUntil };
}

/**
 * The address a request came from, for the checkout limits (migration 0064).
 *
 * Vercel sets x-real-ip and x-forwarded-for from the connection it accepted, so on the deployment
 * these are the platform's word and not the client's. Anywhere else (a local `next dev`) neither
 * is set and every request counts as one place, which is what a limit should do when it cannot
 * tell callers apart: err toward refusing, never toward letting a flood through.
 */
export function clientAddress(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : "unknown";
}
