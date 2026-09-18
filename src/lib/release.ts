/*
  What has to be true before one weekly slice leaves Door Money's balance.

  A sponsorship buys a placement, and a placement is a logo on something. Until the musician has
  approved that logo, nothing has gone on the gear and nothing is owed. /terms says a declined logo
  refunds the patron in full, and that sentence is only true if no slice went out while the answer
  was still open: refundDue can only give back what has not already been sent. So the money waits
  for the yes.

  A backing has no logo. A fan buys recognition rather than a placement (docs/DECISIONS.md,
  decision 3), so there is nobody to approve anything and the calendar alone releases it, which is
  decision 2, option A.

  Waiting is not skipping. A held slice keeps its scheduled status and its due date, so the Friday
  after the yes pays every Friday that went by without one. The musician is paid late, never less.

  Pure on purpose: the Friday job reads rows, and this says what they mean. The database holds the
  same rule behind it (migration 0031), because a query is not a boundary.
*/

/** What the Friday job knows about the payment behind one slice. */
export type SliceSource = {
  /** A lot purchase is a sponsorship; a fan tier through the widget is a backing. */
  kind: "sponsorship" | "backing";
  payment_status: string;
  stripe_charge_id: string | null;
  /** Only a sponsorship carries one. `purchases.mark_status`. */
  mark_status?: string | null;
};

/** The musician's side of the transfer. */
export type PayableAct = { stripe_account_id: string | null; stripe_payouts_enabled: boolean };

/**
 * Why a due slice is staying where it is. These strings are the keys of the payout summary's
 * `skipped` counts, so they are read by Door Money rather than by a patron.
 */
export const HOLDS = {
  noCharge: "purchase has no charge to draw on",
  logoWaiting: "logo has not been approved yet",
  payoutSetup: "act has not finished payout setup",
} as const;

export type Hold = (typeof HOLDS)[keyof typeof HOLDS];

/** Either the reason this slice stays put, or everything the transfer needs. */
export type SlicePlan = { ok: false; hold: Hold } | { ok: true; chargeId: string; stripeAccountId: string };

/**
 * Whether this slice may become one Stripe Transfer today.
 *
 * The order of the three questions is deliberate. The charge comes first, because without one
 * there is nothing to draw on at all. The logo comes next, because it decides whether the money is
 * owed. Payout setup comes last, because it only decides whether the money can arrive, and Door
 * Money holds it either way.
 */
export function slicePlan(source: SliceSource | null | undefined, act: PayableAct): SlicePlan {
  if (!source || source.payment_status !== "held" || !source.stripe_charge_id) return { ok: false, hold: HOLDS.noCharge };
  if (source.kind === "sponsorship" && source.mark_status !== "approved") return { ok: false, hold: HOLDS.logoWaiting };
  if (!act.stripe_account_id || !act.stripe_payouts_enabled) return { ok: false, hold: HOLDS.payoutSetup };
  return { ok: true, chargeId: source.stripe_charge_id, stripeAccountId: act.stripe_account_id };
}
