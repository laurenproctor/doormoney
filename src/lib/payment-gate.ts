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
 *
 * The switch is the category's delivery policy (`delivery_policies.status`, migration 0045). An
 * `active` policy takes real money. A `proposed` one is test mode only. A category with no usable
 * policy takes nothing in either mode, which the database enforces as well: it refuses the purchase.
 * Only the owner switches a policy on, from outside the application, so nothing a browser can do
 * opens a category. Music's policy is active, so music is what it was.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentPolicy, policyAllowsPayment, type PolicyStatus } from "@/lib/delivery-policy";

/** A live secret or restricted key. Test keys are sk_test_ and rk_test_. */
export function stripeLiveMode(key: string | undefined = process.env.STRIPE_SECRET_KEY): boolean {
  return /^(sk|rk)_live_/.test(key ?? "");
}

/**
 * The rule with no policy to read: music in either mode, everything else in test mode only. This
 * is what the gate was before it could read a policy, and it is what it falls back to when the
 * read fails, because a database hiccup must not open a category, and must not close music.
 */
export function categoryPaymentsOpen(categoryKey: string | null | undefined, live: boolean = stripeLiveMode()): boolean {
  if ((categoryKey ?? "music") === "music") return true;
  return !live;
}

/**
 * Whether a fundraiser in this category may start a payment right now.
 *
 * Asks the category's current policy. When the policies cannot be read at all, the answer is the
 * fallback above, which is never looser than a policy would be for a category nobody switched on.
 * When they can be read and the category has none, the answer is no.
 */
export async function paymentsOpenFor(sb: SupabaseClient, categoryKey: string | null | undefined, live: boolean = stripeLiveMode()): Promise<boolean> {
  const key = categoryKey ?? "music";
  try {
    const { data, error } = await sb.from("delivery_policies").select("version,status").eq("category_key", key);
    if (error || !data) return categoryPaymentsOpen(key, live);
    const policy = currentPolicy(data as { version: number; status: string }[]);
    return policyAllowsPayment((policy?.status as PolicyStatus | undefined) ?? null, live);
  } catch {
    return categoryPaymentsOpen(key, live);
  }
}

/** What a sponsor is told. Says what is true, and promises no date. */
export const CATEGORY_PAYMENTS_CLOSED = "Payments are not open for this kind of fundraiser yet.";
