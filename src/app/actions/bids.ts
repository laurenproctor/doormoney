"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bidRefusalMessage, minimumBidCents, notifyOutbid } from "@/lib/auctions";
import { patronFor, payingProfileId } from "@/lib/patrons";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { runPath } from "@/lib/urls";

/*
  Placing a bid. Straight bidding: the number a patron enters is what they pay if they win.
  Nobody signs in to bid, so a bid carries a name and an email; the same pair is one patron.
  Called from the board, which is our own page, so this is a server action rather than a route.

  The decision is the database's: place_bid (migration 0035) takes the lot's row lock, checks the
  clock and the minimum against what is actually there at that instant, and inserts, all in one
  transaction. This file gathers the inputs, verifies the card with Stripe, and turns a refusal
  into words. It reads nothing about the lot that the database will not read again under the lock.
*/

const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Input = z.object({
  lotId: Id,
  amountCents: z.number().int().positive().max(100_000_000),
  patronName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  anonymous: z.boolean().default(false),
  /**
   * The SetupIntent the browser just confirmed. Only the id travels: the card, the customer and
   * whether it actually succeeded are read back from Stripe below, so nothing here is taken on the
   * browser's word. Optional, so a Door Money running without Stripe keys still takes bids.
   */
  setupIntentId: z.string().trim().max(120).optional(),
  /** Left empty by people, filled in by robots. */
  website: z.string().max(0).optional(),
});

export type BidResult = { ok: true; amountCents: number; nextMinimumCents: number } | { ok: false; error: string };

type LotRow = { id: string; price_cents: number; runs: { slug: string; acts: { slug: string } } };

export async function placeBid(input: z.input<typeof Input>): Promise<BidResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That bid did not look right. Check the amount and the email." };
  const { lotId, amountCents, patronName, email, anonymous, website, setupIntentId } = parsed.data;
  if (website) return { ok: false, error: "That bid did not go through." };

  const sb = supabaseAdmin();
  // Only for the address to revalidate afterwards. Whether the lot takes a bid is decided under
  // its lock below, not from this read.
  const { data, error } = await sb.from("lots").select("id,price_cents,runs!inner(slug,acts!inner(slug))").eq("id", lotId).maybeSingle();
  if (error) return { ok: false, error: "That did not load. Try once more." };
  const lot = data as unknown as LotRow | null;
  if (!lot) return { ok: false, error: bidRefusalMessage("lot_not_found") };

  // A bidder who happens to be signed in, under their own verified address, gets the patron row
  // tied to their account. Bidding still needs no account, and the address typed here decides
  // nothing on its own.
  const { data: session } = await (await supabaseServer()).auth.getUser();
  const patronId = await patronFor(sb, patronName, email, payingProfileId(session.user, email));
  if (!patronId) return { ok: false, error: "That did not save. Try once more." };

  // The card, if one was stored a moment ago. Read from Stripe rather than from the form: a
  // payment method id posted by a browser proves nothing, and a SetupIntent that belongs to
  // somebody else's customer must never end up on this patron's bid.
  let card: { paymentMethodId: string; setupIntentId: string } | null = null;
  if (setupIntentId && stripeConfigured()) {
    const { data: patron } = await sb.from("patrons").select("stripe_customer_id").eq("id", patronId).maybeSingle();
    const customerId = (patron as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
    try {
      const intent = await stripe.setupIntents.retrieve(setupIntentId);
      const intentCustomer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id ?? null;
      const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id ?? null;
      if (intent.status !== "succeeded" || !paymentMethodId) return { ok: false, error: "The card was not saved. Try once more." };
      if (!customerId || intentCustomer !== customerId) return { ok: false, error: "That card is not on this bid. Try once more." };
      card = { paymentMethodId, setupIntentId };
    } catch (e) {
      console.error("bid setup intent read failed", setupIntentId, e instanceof Error ? e.message : e);
      return { ok: false, error: "The card was not saved. Try once more." };
    }
  }

  const { data: placed, error: bidError } = await sb.rpc("place_bid", {
    p_lot_id: lot.id,
    p_patron_id: patronId,
    p_amount_cents: amountCents,
    p_anonymous: anonymous,
    p_payment_method_id: card?.paymentMethodId ?? null,
    p_setup_intent_id: card?.setupIntentId ?? null,
  });
  if (bidError) {
    // The database raises the reason as the message. Anything it did not mean to say is logged.
    if (bidError.code !== "23514" && bidError.code !== "P0002") console.error("place_bid failed", lot.id, bidError.code, bidError.message);
    return { ok: false, error: bidRefusalMessage(bidError.message, bidError.details) };
  }
  const bid = ((placed ?? []) as { bid_id: string; next_minimum_cents: number }[])[0];
  if (!bid) return { ok: false, error: "That bid did not save. Try once more." };

  // Mail is best effort: the bid is already in, and a failed send must not lose it.
  try {
    await notifyOutbid(sb, lot.id, bid.bid_id);
  } catch (e) {
    console.error("outbid notices failed", lot.id, e instanceof Error ? e.message : e);
  }

  revalidatePath(runPath(lot.runs.acts.slug, lot.runs.slug));
  return { ok: true, amountCents, nextMinimumCents: bid.next_minimum_cents ?? minimumBidCents(lot.price_cents, amountCents) };
}
