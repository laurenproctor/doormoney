"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { closeTimeOf, minimumBidCents, notifyOutbid } from "@/lib/auctions";
import { formatMoney } from "@/lib/money";
import { patronFor, payingProfileId } from "@/lib/patrons";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { runPath } from "@/lib/urls";

/*
  Placing a bid. Straight bidding: the number a patron enters is what they pay if they win.
  Nobody signs in to bid, so a bid carries a name and an email; the same pair is one patron.
  Called from the board, which is our own page, so this is a server action rather than a route.
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

type LotRow = {
  id: string;
  price_cents: number;
  mode: string;
  status: string;
  closes_at: string | null;
  runs: { slug: string; status: string; bidding_closes_at: string | null; acts: { slug: string } };
};

export async function placeBid(input: z.input<typeof Input>): Promise<BidResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That bid did not look right. Check the amount and the email." };
  const { lotId, amountCents, patronName, email, anonymous, website, setupIntentId } = parsed.data;
  if (website) return { ok: false, error: "That bid did not go through." };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("lots")
    .select("id,price_cents,mode,status,closes_at,runs!inner(slug,status,bidding_closes_at,acts!inner(slug))")
    .eq("id", lotId)
    .maybeSingle();
  if (error) return { ok: false, error: "That did not load. Try once more." };
  const lot = data as unknown as LotRow | null;
  if (!lot) return { ok: false, error: "That spot is not on any fundraiser." };
  if (lot.mode !== "auction") return { ok: false, error: "That spot is a fixed price, not an auction." };
  if (!["open", "live"].includes(lot.runs.status)) return { ok: false, error: "That fundraiser is closed." };
  if (lot.status !== "open") return { ok: false, error: "Bidding on that spot is over." };

  const closesAt = closeTimeOf(lot, lot.runs);
  if (closesAt && closesAt <= new Date().toISOString()) return { ok: false, error: "Bidding on that spot has closed." };

  // The bid has to clear the reserve, or beat the top bid by a step. Read the top inside the same request
  // so a bid placed a second ago still counts.
  const { data: topRow } = await sb.from("bids").select("id,amount_cents").eq("lot_id", lot.id).is("passed_at", null).order("amount_cents", { ascending: false }).limit(1).maybeSingle();
  const topCents = (topRow?.amount_cents as number | undefined) ?? null;
  const minimum = minimumBidCents(lot.price_cents, topCents);
  if (amountCents < minimum) return { ok: false, error: `The next bid starts at ${formatMoney(minimum)}.` };

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

  const { data: bid, error: bidError } = await sb
    .from("bids")
    .insert({
      lot_id: lot.id,
      patron_id: patronId,
      amount_cents: amountCents,
      anonymous,
      stripe_payment_method_id: card?.paymentMethodId ?? null,
      stripe_setup_intent_id: card?.setupIntentId ?? null,
    })
    .select("id")
    .single();
  if (bidError || !bid) return { ok: false, error: "That bid did not save. Try once more." };

  // Mail is best effort: the bid is already in, and a failed send must not lose it.
  try {
    await notifyOutbid(sb, lot.id, bid.id);
  } catch (e) {
    console.error("outbid notices failed", lot.id, e instanceof Error ? e.message : e);
  }

  revalidatePath(runPath(lot.runs.acts.slug, lot.runs.slug));
  return { ok: true, amountCents, nextMinimumCents: minimumBidCents(lot.price_cents, amountCents) };
}
