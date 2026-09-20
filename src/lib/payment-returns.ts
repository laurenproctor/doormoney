import { tierPlace } from "@/lib/catalog";
import { metadataFundraiser, parseFundraiserId } from "@/lib/fundraiser-identity";
import { formatMoney } from "@/lib/money";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/server";

/*
  What a page may say about a payment somebody has just come back from.

  Two notices: the "you paid" banner on a fundraiser's page after an embedded checkout, and the
  "backed" state in the widget after a redirect-based payment method. Both are handed an id in the
  address bar, which anybody can edit, so both ask Stripe what the payment was for before saying
  anything.

  Both used to compare the organizer's address, which every fundraiser by that organizer shares.
  A session for the fall tour read as paid on the winter residency's page. Both compare the
  fundraiser's id now, and neither has a fallback that trusts the organizer alone. Nothing here
  writes anything: a notice is a sentence on a page, and the webhook is what moves state.
*/

export type PaidNotice = { kind: "paid" | "processing"; amount: number; email: string | null };
export type BackedNotice = { label: string; place: string };

/**
 * Which fundraiser a lot is on, from the database. `lots.run_id` is a public column, so this reads
 * what any visitor can. Used only for a checkout session started before sessions carried run_id.
 */
async function fundraiserOfLot(lotId: string | undefined): Promise<string | null> {
  const id = parseFundraiserId(lotId);
  if (!id) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("lots").select("run_id").eq("id", id).maybeSingle();
  return parseFundraiserId((data as { run_id?: string } | null)?.run_id);
}

/**
 * The notice a sponsor sees after paying, and only on the page of the fundraiser they paid.
 *
 * A session from before this shipped names no fundraiser, so its lot is looked up instead. There
 * is no third way through: nothing is shown on the strength of the organizer alone.
 */
export async function lotPaidNotice(sessionId: string | undefined, fundraiserId: string | null | undefined): Promise<PaidNotice | null> {
  const expected = parseFundraiserId(fundraiserId);
  if (!expected || !sessionId || !sessionId.startsWith("cs_") || !stripeConfigured()) return null;
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.metadata?.kind !== "lot") return null;
    const named = metadataFundraiser(s.metadata, expected);
    if (named === "mismatch") return null;
    if (named === "unnamed" && (await fundraiserOfLot(s.metadata?.lot_id)) !== expected) return null;
    const email = s.customer_details?.email ?? null;
    if (s.status === "complete" && s.payment_status !== "unpaid") return { kind: "paid", amount: s.amount_total ?? 0, email };
    if (s.status === "complete") return { kind: "processing", amount: s.amount_total ?? 0, email };
    return null;
  } catch {
    return null;
  }
}

/**
 * The widget's "backed" state after a redirect-based payment method sends a fan back. Only for a
 * backing of this exact fundraiser. A backing's payment intent has always carried run_id, so an
 * intent that names no fundraiser is not one of ours and shows nothing.
 */
export async function backingReturnNotice(
  params: { paymentIntent: string | undefined; redirectStatus: string | undefined },
  fundraiserId: string | null | undefined,
): Promise<BackedNotice | null> {
  const expected = parseFundraiserId(fundraiserId);
  const piId = params.paymentIntent;
  if (!expected || !piId || !piId.startsWith("pi_") || !stripeConfigured()) return null;
  if (params.redirectStatus !== "succeeded" && params.redirectStatus !== "processing") return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.metadata?.kind !== "backing") return null;
    if (metadataFundraiser(pi.metadata, expected) !== "match") return null;
    if (pi.status !== "succeeded" && pi.status !== "processing") return null;
    return { label: formatMoney(pi.amount), place: tierPlace(pi.metadata.tier ?? "") };
  } catch {
    return null;
  }
}
