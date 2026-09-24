import { NextResponse } from "next/server";
import { z } from "zod";
import { backingFee } from "@/lib/backings";
import { patronFor, payingProfileId } from "@/lib/patrons";
import { buyNowOpen, checkoutRefusal } from "@/lib/auctions";
import { checkoutClock, clientAddress } from "@/lib/checkout-hold";
import { WIDGET_TIERS, widgetTier } from "@/lib/catalog";
import { CATEGORY_PAYMENTS_CLOSED, paymentsOpenFor } from "@/lib/payment-gate";
import { offerTermsFingerprint, storedOfferTerms } from "@/lib/offer-terms";
import { lotFee, lotName } from "@/lib/purchases";
import { SITE } from "@/lib/site";
import { createBackingIntent, createLotCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { runPath } from "@/lib/urls";

/**
 * Starts a payment. Two kinds:
 * - `lot`: a fixed-price spot on a board. Creates the purchase, holds the lot for the patron for as
 *   long as the Checkout Session lives (src/lib/checkout-hold.ts), and returns the client secret
 *   for an embedded Checkout Session. Anybody can ask, so who may hold what is limited: a honeypot
 *   before anything is read, and the database's own count of attempts and open holds by address
 *   and by email (begin_lot_purchase_limited, migration 0064) before anything is held.
 * - `backing`: a fan tier through the widget. Creates the backing row and a PaymentIntent for the
 *   Payment Element inside the widget's frame; fulfilment happens in the webhook.
 *
 * Both name one exact fundraiser. A lot is on one by construction. A backing says which one the
 * widget rendered (`runId`), and is only ever made on that one: never on "whichever fundraiser
 * this organizer has running", which can be a different answer at payment time than it was at
 * render time. See src/lib/fundraiser-identity.ts.
 * The widget lives on Door Money's origin inside a frame, so this is same-origin; it is a route handler
 * rather than a server action because the widget is a client island with no page of its own to post to.
 */
// Seeded ids are not RFC 4122 UUIDs, so a plain shape check rather than zod's strict .uuid().
const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Input = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("backing"),
    slug: z.string().trim().min(1).max(80),
    /**
     * The exact fundraiser the widget rendered. Every widget this site serves sends it. Optional
     * only so a widget page loaded before this shipped can finish; see startBacking for what an
     * absent one is allowed to mean, which is very little.
     */
    runId: Id.optional(),
    tier: z.enum(WIDGET_TIERS.map((t) => t.key) as [string, ...string[]]),
    displayName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200),
    source: z.enum(["widget", "board"]).default("widget"),
    /** The page the widget was embedded in, for the record. The frame reads it from document.referrer. */
    origin: z.string().trim().max(200).optional(),
  }),
  z.object({
    kind: z.literal("lot"),
    lotId: Id,
    patronName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    /** The winner's private token from the auction email. Required to pay for an auction lot. */
    token: z.string().trim().min(16).max(64).optional(),
    /** Taking an auction lot at its buy-it-now price instead of bidding. */
    buyNow: z.boolean().optional(),
    /**
     * The fingerprint of the offer the page drew (src/lib/offer-terms.ts). Opaque: it is compared
     * with one this route computes from the lot and is never read as terms. The offer contract
     * itself is deliberately not accepted from a browser at all, and zod drops anything else sent.
     */
    termsFingerprint: z.string().trim().max(40).optional(),
    /** Left empty by people, filled in by robots. The same field the bid form sends to /api/bids/setup. */
    website: z.string().max(200).optional(),
  }),
]);

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

type LotRow = {
  id: string;
  label: string | null;
  surface_key: string;
  price_cents: number;
  mode: "fixed" | "auction";
  status: string;
  winner_bid_id: string | null;
  funding_token: string | null;
  funding_deadline: string | null;
  buy_now_cents: number | null;
  /** The offer contract, read here and nowhere else: the browser's copy is never trusted. */
  offer_terms: unknown;
  exclusive: boolean | null;
  /** Bumped on every offer made to a bidder (migration 0035). Recorded against the purchase. */
  offer_version: number | null;
  runs: { id: string; slug: string; title: string; status: string; category_key: string | null; act_id: string; acts: { id: string; slug: string; name: string } };
};

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid input", 400);
  if (!stripeConfigured()) return fail("Payments are unavailable right now. Try again shortly.", 503);

  const input = parsed.data;
  // Checked before anything is read or written. A filled honeypot is a script, and it is told
  // nothing it can learn from.
  if (input.kind === "lot" && input.website) return fail("That did not go through.", 400);
  const sb = supabaseAdmin();

  // A patron who is signed in and paying under their own verified address has the patron row tied
  // to their account, so the placement turns up on their Backed page without a second claim. Null
  // in a third-party frame, where no session cookie travels, and the payment is unaffected either
  // way. The address on the form never decides this.
  const { data: session } = await (await supabaseServer()).auth.getUser();
  const profileId = payingProfileId(session.user, input.email);

  if (input.kind === "backing") return startBacking(sb, input, profileId);

  const { data: lotData, error: lotError } = await sb
    .from("lots")
    .select("id,label,surface_key,price_cents,mode,status,winner_bid_id,funding_token,funding_deadline,buy_now_cents,offer_terms,exclusive,offer_version,runs!inner(id,slug,title,status,category_key,act_id,acts!inner(id,slug,name))")
    .eq("id", input.lotId)
    .maybeSingle();
  if (lotError) return fail("That did not load. Try once more.", 500);
  const lot = lotData as unknown as LotRow | null;
  if (!lot) return fail("That spot is not on any fundraiser.", 404);
  if (!["open", "live"].includes(lot.runs.status)) return fail("That fundraiser is closed.", 400);
  // Asked before anything is written or held: only a category whose delivery policy the owner has
  // switched on takes live money. A proposed policy is test mode only.
  if (!(await paymentsOpenFor(sb, lot.runs.category_key))) return fail(CATEGORY_PAYMENTS_CLOSED, 403);
  if (lot.status === "sold") return fail("That spot is already taken.", 409);
  if (lot.status !== "open" && lot.status !== "pending_funding") return fail("That spot is not for sale.", 400);

  // The offer contract, from the lot. A lot's terms are only frozen once somebody has bid on it or
  // paid for it (migration 0035, widened in 0056), so until then an organizer may still edit them,
  // and a sponsor with the page open could otherwise pay for an offer that changed underneath them.
  // The page sends back a fingerprint of what it drew and this compares it with its own, computed
  // from the row it just read. Nothing about the terms themselves comes from the browser.
  //
  // A request that sends no fingerprint is not refused: the claim page has always been able to pay
  // without one, and this is a guard against a stale page rather than a security boundary. What
  // stops a sponsor being given different terms from the ones they paid for is the snapshot, which
  // is written from the lot at the moment of purchase and can never be edited (migration 0045).
  const offerTerms = storedOfferTerms({ offer_terms: lot.offer_terms });
  if (input.termsFingerprint && input.termsFingerprint !== offerTermsFingerprint(offerTerms, lot.price_cents)) {
    return fail("This sponsorship's terms changed while the page was open. Reload and read them again before paying.", 409);
  }

  // Three ways to pay for a lot: a fixed price, an auction lot taken at its buy-it-now number, and
  // an auction lot the patron won, through the private token in their email.
  let amount = lot.price_cents;
  if (lot.mode === "auction" && input.buyNow) {
    const { data: topBid } = await sb.from("bids").select("amount_cents").eq("lot_id", lot.id).is("passed_at", null).order("amount_cents", { ascending: false }).limit(1).maybeSingle();
    if (!buyNowOpen(lot, (topBid?.amount_cents as number | undefined) ?? null)) return fail("The bidding has passed that price, so it is up for auction now.", 409);
    amount = lot.buy_now_cents!;
  } else if (lot.mode === "auction") {
    if (!input.token || input.token !== lot.funding_token) return fail("That spot is an auction. The winning bidder gets a link to pay.", 403);
    if (lot.status !== "pending_funding" || !lot.winner_bid_id) return fail("That spot is not waiting on payment.", 400);
    if (lot.funding_deadline && new Date(lot.funding_deadline) < new Date()) return fail("The 48 hours are up, so the spot went to the next bid.", 410);
    const { data: winningBid } = await sb.from("bids").select("amount_cents").eq("id", lot.winner_bid_id).maybeSingle();
    if (!winningBid) return fail("That spot is not waiting on payment.", 400);
    amount = winningBid.amount_cents;
  }

  // The patron: the same business paying twice should be one patron row.
  const email = input.email.toLowerCase();
  const patronId = await patronFor(sb, input.patronName, email, profileId);
  if (!patronId) return fail("That did not save. Try once more.", 500);

  // The purchase and the hold on the lot, in one transaction under the lot's lock
  // (begin_lot_purchase, migration 0035, reached through begin_lot_purchase_limited, 0064). The
  // wrapper counts this attempt against the address and the option, and the holds already open
  // from this address and for this email, and refuses with a word when a limit is reached.
  // begin_lot_purchase then clears any checkout on the lot that has expired, refuses one that is
  // still live, and binds this purchase to the offer it pays for: the winning bid for a won
  // auction, the take-it-now number or the price for anything taken outright. The hold ends when
  // the Stripe session does; the purchase stops counting as an attempt to pay a little after, so
  // a payment made in the session's last seconds is never cleared from under its webhook.
  const wonBidId = lot.mode === "auction" && !input.buyNow ? lot.winner_bid_id : null;
  const clock = checkoutClock();
  const { data: decision, error: purchaseError } = await sb
    .rpc("begin_lot_purchase_limited", {
      p_client_ip: clientAddress(req.headers),
      p_email: email,
      p_lot_id: lot.id,
      p_patron_id: patronId,
      p_amount_cents: amount,
      p_fee_cents: lotFee(amount),
      p_bid_id: wonBidId,
      p_expires_at: clock.holdUntil.toISOString(),
    })
    .maybeSingle();
  const outcome = (decision ?? null) as { purchase_id: string | null; refusal: string | null } | null;
  if (purchaseError || !outcome?.purchase_id) {
    const refusal = checkoutRefusal(outcome?.refusal ?? "");
    if (purchaseError || refusal.status === 500) console.error("begin_lot_purchase_limited failed", lot.id, purchaseError?.code ?? outcome?.refusal, purchaseError?.message ?? "");
    return fail(refusal.error, refusal.status);
  }
  const purchase = { id: outcome.purchase_id };

  const act = lot.runs.acts;
  const origin = process.env.NODE_ENV === "production" ? SITE.url : new URL(req.url).origin;
  try {
    const session = await createLotCheckoutSession({
      purchaseId: purchase.id,
      lotId: lot.id,
      runId: lot.runs.id,
      actId: act.id,
      actSlug: act.slug,
      offerVersion: lot.offer_version ?? undefined,
      offerTermsVersion: offerTerms.version ?? null,
      amountCents: amount,
      description: `${lotName(lot)}, ${act.name}, ${lot.runs.title}`,
      patronEmail: email,
      returnUrl: `${origin}${runPath(act.slug, lot.runs.slug)}?paid={CHECKOUT_SESSION_ID}`,
      expiresAt: clock.sessionExpiresAt,
    });
    await sb.from("purchases").update({ stripe_checkout_session_id: session.id }).eq("id", purchase.id);
    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (e) {
    // Stripe said no. Give the lot back so the patron can try again. A lot won at auction keeps
    // its winner and its clock; only a hold this request put on the lot comes off.
    console.error("checkout session failed", e instanceof Error ? e.message : e);
    await sb.from("purchases").delete().eq("id", purchase.id).eq("payment_status", "requires_payment");
    if (!wonBidId) await sb.from("lots").update({ status: "open", funding_deadline: null }).eq("id", lot.id).eq("status", "pending_funding").is("winner_bid_id", null);
    return fail("Payment could not start. Try once more.", 502);
  }
}

type Admin = ReturnType<typeof supabaseAdmin>;

type BackingRun = { id: string; title: string; category_key: string | null };

/**
 * The one fundraiser a backing is for.
 *
 * Named exactly, it is that fundraiser or nothing: it has to belong to the organizer the request
 * named, and it has to be open. If it has closed the fan is told so. It is never swapped for
 * another fundraiser by the same organizer, because a fan who read "Fall run" and paid must not
 * find their money on "Winter residency".
 *
 * Not named, which only a widget page loaded before exact widgets shipped can do, it is the
 * organizer's open fundraiser when there is exactly one, so there is nothing to confuse it with.
 * With two or more open there is no honest answer, and the fan is asked to reload, which gets
 * them a widget that names its fundraiser.
 */
async function backingFundraiser(sb: Admin, actId: string, runId: string | null): Promise<BackingRun | { error: string; status: number }> {
  if (runId) {
    const { data } = await sb.from("runs").select("id,title,status,category_key").eq("id", runId).eq("act_id", actId).maybeSingle();
    const run = data as (BackingRun & { status: string }) | null;
    if (!run) return { error: "That fundraiser is not on Door Money.", status: 404 };
    if (!["open", "live"].includes(run.status)) return { error: "That fundraiser is closed.", status: 400 };
    return { id: run.id, title: run.title, category_key: run.category_key };
  }
  const { data } = await sb.from("runs").select("id,title,category_key").eq("act_id", actId).in("status", ["open", "live"]).order("starts_on", { ascending: false }).limit(2);
  const open = (data ?? []) as BackingRun[];
  if (open.length === 0) return { error: "That fundraiser is closed.", status: 400 };
  if (open.length > 1) return { error: "This page is out of date. Reload it and try once more.", status: 409 };
  return open[0];
}

/** A fan tier. The row goes in first so the webhook has something to fulfil; a never-paid row is harmless and dropped if Stripe cancels the intent. */
async function startBacking(sb: Admin, input: Extract<z.infer<typeof Input>, { kind: "backing" }>, profileId: string | null) {
  const tier = widgetTier(input.tier);
  if (!tier) return fail("Invalid input", 400);

  const { data: act } = await sb.from("acts").select("id,slug,name").eq("slug", input.slug).maybeSingle();
  if (!act) return fail("That musician is not on Door Money.", 404);

  const run = await backingFundraiser(sb, act.id, input.runId ?? null);
  if ("error" in run) return fail(run.error, run.status);

  // The widget's tiers are music's, in music's words: a name on the tour thank-you, a name on the
  // merch table card. The page refuses to draw them for another category; this refuses to sell them.
  if ((run.category_key ?? "music") !== "music") return fail("That fundraiser does not take backings through the widget.", 400);
  if (!(await paymentsOpenFor(sb, run.category_key))) return fail(CATEGORY_PAYMENTS_CLOSED, 403);

  const email = input.email.toLowerCase();
  const patronId = await patronFor(sb, input.displayName, email, profileId);
  if (!patronId) return fail("That did not save. Try once more.", 500);

  const { data: backing, error } = await sb
    .from("backings")
    .insert({ run_id: run.id, patron_id: patronId, tier: tier.key, amount_cents: tier.amountCents, fee_cents: backingFee(tier.amountCents), display_name: input.displayName, source: input.source, origin: input.origin ?? null })
    .select("id")
    .single();
  if (error || !backing) return fail("That did not save. Try once more.", 500);

  try {
    const pi = await createBackingIntent({
      backingId: backing.id,
      runId: run.id,
      actId: act.id,
      actSlug: act.slug,
      tier: tier.key,
      amountCents: tier.amountCents,
      description: `${tier.title}, ${act.name}, ${run.title}`,
      fanEmail: email,
    });
    await sb.from("backings").update({ stripe_payment_intent_id: pi.id }).eq("id", backing.id);
    return NextResponse.json({ clientSecret: pi.client_secret, backingId: backing.id });
  } catch (e) {
    console.error("backing intent failed", e instanceof Error ? e.message : e);
    await sb.from("backings").delete().eq("id", backing.id).eq("payment_status", "requires_payment");
    return fail("Payment could not start. Try once more.", 502);
  }
}
