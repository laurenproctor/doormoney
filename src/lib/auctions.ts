import type { SupabaseClient } from "@supabase/supabase-js";
import { auctionUnsold, auctionWon, closingSoon, outbidNotice, sendEmail } from "@/lib/email";
import { bidStepCents, formatMoney } from "@/lib/money";
import { holdPurchase, lotFee, lotName, ownerEmail } from "@/lib/purchases";
import { SITE } from "@/lib/site";
import { chargeSavedCard, stripe, stripeConfigured } from "@/lib/stripe";
import { runUrl } from "@/lib/urls";

/*
  Auctions. Straight bidding: a bid is exactly what the patron pays if they win (decision 4).
  The lot's price_cents is the reserve. A lot closes on its own closes_at, or with the run.

  At close the top bid wins and gets 48 hours to pay. If that runs out the bid is marked passed
  and the lot rolls to the next highest. With nothing left, the lot goes unsold.

  Every decision lives in the database (migration 0035): place_bid, close_auction, roll_offer and
  fulfil_lot_purchase each take the lot's row lock, read, decide and write in one transaction, so
  two bids, two closes or a close and a bid arriving together queue rather than race. What this
  file does is the part a transaction must not: charge a saved card, expire a Stripe session, send
  email. It keys every one of those on what the database said it did, so a step that runs twice
  finds "already" and does nothing.

  Nothing here is called from a page. The worker at /api/cron/auctions and the daily job call
  runAuctionJob; the bid action calls place_bid through placeBid; the webhook calls holdPurchase.
*/

type Admin = SupabaseClient;

/** How long a winner has to pay. */
export const FUNDING_HOURS = 48;
/** How far ahead of a close the warning goes out. */
export const CLOSING_SOON_HOURS = 24;

/**
 * Whether a lot's buy-it-now offer still stands. It does while the bidding is below it: once a bid
 * reaches the number, the offer is moot and the auction runs to its close.
 */
export function buyNowOpen(lot: { status: string; buy_now_cents: number | null }, topBidCents: number | null) {
  if (lot.status !== "open" || !lot.buy_now_cents) return false;
  return topBidCents === null || topBidCents < lot.buy_now_cents;
}

/** The smallest bid a lot will take now: the reserve, or a step above the top bid. */
export function minimumBidCents(priceCents: number, topBidCents: number | null) {
  return topBidCents === null ? priceCents : topBidCents + bidStepCents(priceCents);
}

/** When a lot closes: its own time if it has one, else the run's. Null means it is not on a clock. */
export function closeTimeOf(lot: { closes_at: string | null }, run: { bidding_closes_at: string | null }) {
  return lot.closes_at ?? run.bidding_closes_at ?? null;
}

/**
 * What the board says when place_bid refuses. The database raises the reason as the message and,
 * for a bid under the minimum, the minimum in cents as the detail.
 */
export function bidRefusalMessage(reason: string, detail?: string | null): string {
  switch (reason) {
    case "lot_not_found":
      return "That spot is not on any fundraiser.";
    case "not_an_auction":
      return "That spot is a fixed price, not an auction.";
    case "fundraiser_closed":
      return "That fundraiser is closed.";
    case "spot_on_hold":
      return "Someone is taking that spot right now. Try again in a few minutes.";
    case "bidding_over":
      return "Bidding on that spot is over.";
    case "bidding_closed":
      return "Bidding on that spot has closed.";
    case "bid_below_minimum": {
      const minimum = Number(detail);
      return detail && Number.isFinite(minimum) ? `The next bid starts at ${formatMoney(minimum)}.` : "That bid is under the minimum.";
    }
    default:
      return "That bid did not save. Try once more.";
  }
}

/** What checkout answers when begin_lot_purchase refuses, and with which status. */
export function checkoutRefusal(reason: string): { error: string; status: number } {
  switch (reason) {
    case "lot_not_found":
      return { error: "That spot is not on any fundraiser.", status: 404 };
    case "spot_taken":
      return { error: "That spot is already taken.", status: 409 };
    case "spot_being_taken":
      return { error: "Someone is taking that spot right now. Try again in a few minutes.", status: 409 };
    case "bidding_passed_take_it_now":
      return { error: "The bidding has passed that price, so it is up for auction now.", status: 409 };
    case "not_for_sale_outright":
      return { error: "That spot is up for auction, not for sale outright.", status: 400 };
    case "not_for_sale":
      return { error: "That spot is not for sale.", status: 400 };
    case "offer_not_current":
      return { error: "That offer has moved on. The current winner has a link to pay.", status: 410 };
    case "bid_not_on_lot":
    case "amount_not_the_bid":
    case "amount_not_the_price":
      return { error: "The price on that spot changed. Reload the page and try again.", status: 409 };
    default:
      return { error: "Payment could not start. Try once more.", status: 500 };
  }
}

const hoursFromNow = (h: number, from = new Date()) => new Date(from.getTime() + h * 3600_000);

export type AuctionSummary = {
  ranAt: string;
  closed: number;
  wonAndBilled: number;
  rolled: number;
  unsold: number;
  reopened: number;
  closingSoonEmails: number;
  errors: string[];
};

type LotRow = {
  id: string;
  label: string | null;
  surface_key: string;
  price_cents: number;
  status: string;
  closes_at: string | null;
  winner_bid_id: string | null;
  funding_deadline: string | null;
  closing_soon_sent_at: string | null;
  runs: { id: string; slug: string; title: string; status: string; act_id: string; bidding_closes_at: string | null; acts: { id: string; name: string; slug: string; owner_id: string | null } };
};

type BidRow = {
  id: string;
  amount_cents: number;
  anonymous: boolean;
  passed_at: string | null;
  created_at: string;
  stripe_payment_method_id: string | null;
  patrons: { id: string; name: string; contact_email: string; stripe_customer_id: string | null } | null;
};

/** What close_auction and roll_offer hand back when a lot has a new winner. */
type Offer = { winner_bid_id: string; funding_token: string; funding_deadline: string; offer_version: number };

type CloseRow = {
  outcome: "won" | "unsold" | "not_due" | "already" | "missing";
  winner_bid_id: string | null;
  funding_token: string | null;
  funding_deadline: string | null;
  offer_version: number | null;
};

type RollRow = {
  outcome: "rolled" | "unsold" | "reopened" | "waiting" | "not_due" | "already" | "missing";
  passed_bid_id: string | null;
  winner_bid_id: string | null;
  funding_token: string | null;
  funding_deadline: string | null;
  offer_version: number | null;
  expired_sessions: string[] | null;
};

const LOT_SELECT =
  "id,label,surface_key,price_cents,status,closes_at,winner_bid_id,funding_deadline,closing_soon_sent_at,runs!inner(id,slug,title,status,act_id,bidding_closes_at,acts!inner(id,name,slug,owner_id))";

/** Every bid on a lot, highest first, newest first on a tie. */
async function bidsFor(sb: Admin, lotId: string) {
  const { data } = await sb
    .from("bids")
    .select("id,amount_cents,anonymous,passed_at,created_at,stripe_payment_method_id,patrons(id,name,contact_email,stripe_customer_id)")
    .eq("lot_id", lotId)
    .order("amount_cents", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as BidRow[];
}

function offerOf(row: { winner_bid_id: string | null; funding_token: string | null; funding_deadline: string | null; offer_version: number | null }): Offer {
  if (!row.winner_bid_id || !row.funding_token || !row.funding_deadline || row.offer_version === null) throw new Error("the database offered a lot without saying to whom");
  return { winner_bid_id: row.winner_bid_id, funding_token: row.funding_token, funding_deadline: row.funding_deadline, offer_version: row.offer_version };
}

/** The winner's email: the lot is theirs, here is the private link, here is the clock. */
async function offerByEmail(lot: LotRow, bid: BidRow, offer: Offer) {
  const to = bid.patrons?.contact_email;
  if (!to) return;
  const r = await sendEmail(
    auctionWon({
      to,
      patronName: bid.patrons?.name ?? "A patron",
      actName: lot.runs.acts.name,
      runTitle: lot.runs.title,
      lotName: lotName(lot),
      amountCents: bid.amount_cents,
      hours: FUNDING_HOURS,
      deadline: new Date(offer.funding_deadline),
      payUrl: `${SITE.url}/claim/${offer.funding_token}`,
    }),
  );
  if (!r.sent) console.error("auction won notice not sent", lot.id, r.reason);
}

/**
 * Charges the winner's saved card, with nobody at the keyboard.
 *
 * Returns true when the money is in and the lot is settled. Returns false for every other outcome,
 * including a bid that saved no card, and the caller then falls back to the emailed claim link and
 * the 48-hour clock, which is exactly what every auction did before cards were taken at bid time.
 *
 * A failure here is not evidence of bad faith. A card needing 3-D Secure cannot be authenticated
 * with the patron absent, a balance can be short, a card can expire between the bid and the close.
 * So the reason is recorded and the patron still gets their 48 hours.
 */
async function chargeWinner(sb: Admin, lot: LotRow, bid: BidRow, offer: Offer): Promise<boolean> {
  const customerId = bid.patrons?.stripe_customer_id;
  if (!bid.stripe_payment_method_id || !customerId || !stripeConfigured()) return false;

  // The purchase row first, bound to this offer. The guard on purchases (migration 0035) refuses
  // it unless the lot is waiting on exactly this bid at exactly this version, and the partial
  // unique index allows one live purchase per lot, so this is also what stops a second close from
  // charging the same bid twice.
  const { data: purchase, error } = await sb
    .from("purchases")
    .insert({ lot_id: lot.id, patron_id: bid.patrons?.id, amount_cents: bid.amount_cents, fee_cents: lotFee(bid.amount_cents), bid_id: bid.id, offer_version: offer.offer_version })
    .select("id")
    .single();
  if (error || !purchase) {
    if (error) console.error("bid charge: purchase refused", lot.id, bid.id, error.message);
    return false;
  }

  try {
    const pi = await chargeSavedCard({
      purchaseId: purchase.id as string,
      lotId: lot.id,
      runId: lot.runs.id,
      actId: lot.runs.acts.id,
      actSlug: lot.runs.acts.slug,
      customerId,
      paymentMethodId: bid.stripe_payment_method_id,
      amountCents: bid.amount_cents,
      description: `${lotName(lot)}, ${lot.runs.acts.name}, ${lot.runs.title}`,
      patronEmail: bid.patrons?.contact_email ?? "",
    });
    // Anything short of "succeeded" needs the patron present, which is the fallback's whole job.
    if (pi.status !== "succeeded") throw new Error(`payment intent ${pi.status}`);

    await sb.from("bids").update({ charged_purchase_id: purchase.id }).eq("id", bid.id);
    const r = await holdPurchase(sb, { purchaseId: purchase.id as string, paymentIntentId: pi.id, patronEmail: bid.patrons?.contact_email ?? null });
    if (!r.ok) throw new Error(r.reason);
    return true;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("bid card charge failed", lot.id, bid.id, reason);
    // Take the row back out so the lot is free for the claim link, and keep the reason: it is the
    // difference between a patron who could not pay and one who never meant to.
    await sb.from("purchases").delete().eq("id", purchase.id).eq("payment_status", "requires_payment");
    await sb.from("lots").update({ funding_charge_error: reason.slice(0, 300) }).eq("id", lot.id);
    return false;
  }
}

/**
 * Hands a won lot to its bidder: the card on the bid if it clears, the emailed claim link if not.
 * One place, so closing an auction and rolling a lapsed one behave identically. The database has
 * already made the offer; this is the part that reaches the patron.
 */
async function settleWinner(sb: Admin, lot: LotRow, offer: Offer) {
  const bid = (await bidsFor(sb, lot.id)).find((b) => b.id === offer.winner_bid_id);
  if (!bid) throw new Error(`winning bid ${offer.winner_bid_id} is not on lot ${lot.id}`);
  if (await chargeWinner(sb, lot, bid, offer)) return;
  await offerByEmail(lot, bid, offer);
}

/** Nobody is going to pay for this one. The database took it off the board; tell the musician. */
async function notifyUnsold(sb: Admin, lot: LotRow) {
  const owner = await ownerEmail(sb, lot.runs.acts.owner_id);
  if (!owner) return;
  const r = await sendEmail(auctionUnsold({ to: owner, actName: lot.runs.acts.name, lotName: lotName(lot), reserveCents: lot.price_cents, dashboardUrl: `${SITE.url}/dashboard` }));
  if (!r.sent) console.error("unsold notice not sent", lot.id, r.reason);
}

/**
 * Stripe sessions for checkouts the database has just declared over. Best effort: a session past
 * its own expiry cannot complete anyway, and one that already did has a webhook on its way.
 */
async function expireSessions(ids: string[] | null | undefined) {
  if (!ids?.length || !stripeConfigured()) return;
  for (const id of ids) {
    try {
      await stripe.checkout.sessions.expire(id);
    } catch (e) {
      console.error("could not expire checkout session", id, e instanceof Error ? e.message : e);
    }
  }
}

/** Closes every auction whose time has passed. The top bid at or above the reserve wins. */
export async function closeDueAuctions(sb: Admin, now = new Date(), summary?: AuctionSummary) {
  const nowIso = now.toISOString();
  const { data } = await sb.from("lots").select(LOT_SELECT).eq("mode", "auction").eq("status", "open").in("runs.status", ["open", "live"]);
  const lots = ((data ?? []) as unknown as LotRow[]).filter((l) => {
    const at = closeTimeOf(l, l.runs);
    return at !== null && at <= nowIso;
  });

  for (const lot of lots) {
    try {
      const { data: rows, error } = await sb.rpc("close_auction", { p_lot_id: lot.id, p_now: nowIso, p_funding_hours: FUNDING_HOURS });
      if (error) throw new Error(error.message);
      const r = ((rows ?? []) as CloseRow[])[0];
      if (!r) throw new Error("close_auction returned nothing");
      if (r.outcome === "unsold") {
        await notifyUnsold(sb, lot);
        if (summary) {
          summary.unsold += 1;
          summary.closed += 1;
        }
      } else if (r.outcome === "won") {
        await settleWinner(sb, lot, offerOf(r));
        if (summary) {
          summary.wonAndBilled += 1;
          summary.closed += 1;
        }
      }
      // not_due, already, missing: another pass got here first, or the clock moved. Nothing to do.
    } catch (e) {
      summary?.errors.push(`close ${lot.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/**
 * The winner did not pay in time. The database passes the bid and offers the lot to the next one
 * down, or puts a lapsed take-it-now or fixed-price hold back on the board; this tells whoever
 * needs telling and expires whatever Stripe session the lapsed attempt left behind.
 */
export async function rollExpiredFunding(sb: Admin, now = new Date(), summary?: AuctionSummary) {
  const nowIso = now.toISOString();
  const { data } = await sb.from("lots").select(LOT_SELECT).eq("status", "pending_funding").lt("funding_deadline", nowIso);
  for (const lot of (data ?? []) as unknown as LotRow[]) {
    try {
      const { data: rows, error } = await sb.rpc("roll_offer", { p_lot_id: lot.id, p_now: nowIso, p_funding_hours: FUNDING_HOURS });
      if (error) throw new Error(error.message);
      const r = ((rows ?? []) as RollRow[])[0];
      if (!r) throw new Error("roll_offer returned nothing");
      await expireSessions(r.expired_sessions);
      if (r.outcome === "rolled") {
        await settleWinner(sb, lot, offerOf(r));
        if (summary) summary.rolled += 1;
      } else if (r.outcome === "unsold") {
        await notifyUnsold(sb, lot);
        if (summary) summary.unsold += 1;
      } else if (r.outcome === "reopened") {
        if (summary) summary.reopened += 1;
      }
      // waiting: a checkout is in flight. not_due, already, missing: nothing to do.
    } catch (e) {
      summary?.errors.push(`roll ${lot.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** One warning per lot, a day before it closes, to everyone still in it. */
export async function warnClosingSoon(sb: Admin, now = new Date(), summary?: AuctionSummary) {
  const soon = hoursFromNow(CLOSING_SOON_HOURS, now).toISOString();
  const { data } = await sb.from("lots").select(LOT_SELECT).eq("mode", "auction").eq("status", "open").is("closing_soon_sent_at", null).in("runs.status", ["open", "live"]);
  for (const lot of (data ?? []) as unknown as LotRow[]) {
    const at = closeTimeOf(lot, lot.runs);
    if (!at || at > soon || at <= now.toISOString()) continue;
    try {
      const { data: marked } = await sb.from("lots").update({ closing_soon_sent_at: now.toISOString() }).eq("id", lot.id).is("closing_soon_sent_at", null).select("id");
      if (!marked?.length) continue;
      const bids = (await bidsFor(sb, lot.id)).filter((b) => !b.passed_at);
      const topCents = bids[0]?.amount_cents ?? null;
      const seen = new Set<string>();
      for (const b of bids) {
        const to = b.patrons?.contact_email;
        if (!to || seen.has(to.toLowerCase())) continue;
        seen.add(to.toLowerCase());
        const r = await sendEmail(
          closingSoon({
            to,
            patronName: b.patrons?.name ?? "A patron",
            actName: lot.runs.acts.name,
            lotName: lotName(lot),
            topCents: topCents ?? lot.price_cents,
            leading: bids[0]?.id === b.id,
            minimumCents: minimumBidCents(lot.price_cents, topCents),
            closesAt: new Date(at),
            boardUrl: runUrl(lot.runs.acts.slug, lot.runs.slug),
          }),
        );
        if (r.sent) {
          if (summary) summary.closingSoonEmails += 1;
        } else {
          console.error("closing soon not sent", lot.id, r.reason);
        }
      }
    } catch (e) {
      summary?.errors.push(`closing soon ${lot.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** Tells the patron who just lost the lead. One email per bid that was passed. */
export async function notifyOutbid(sb: Admin, lotId: string, newTopBidId: string) {
  const { data: lotData } = await sb.from("lots").select(LOT_SELECT).eq("id", lotId).maybeSingle();
  const lot = lotData as unknown as LotRow | null;
  if (!lot) return;
  const bids = (await bidsFor(sb, lotId)).filter((b) => !b.passed_at);
  const top = bids.find((b) => b.id === newTopBidId);
  if (!top) return;
  const at = closeTimeOf(lot, lot.runs);
  const seen = new Set<string>();
  for (const b of bids) {
    if (b.id === newTopBidId) continue;
    const to = b.patrons?.contact_email;
    if (!to || seen.has(to.toLowerCase())) continue;
    seen.add(to.toLowerCase());
    const { data: marked } = await sb.from("bids").update({ outbid_sent_at: new Date().toISOString() }).eq("id", b.id).is("outbid_sent_at", null).select("id");
    if (!marked?.length) continue;
    const r = await sendEmail(
      outbidNotice({
        to,
        patronName: b.patrons?.name ?? "A patron",
        actName: lot.runs.acts.name,
        lotName: lotName(lot),
        yourCents: b.amount_cents,
        topCents: top.amount_cents,
        minimumCents: minimumBidCents(lot.price_cents, top.amount_cents),
        closesAt: at ? new Date(at) : null,
        boardUrl: runUrl(lot.runs.acts.slug, lot.runs.slug),
      }),
    );
    if (!r.sent) console.error("outbid notice not sent", b.id, r.reason);
  }
}

/** The whole auction pass: warn, close, roll. Safe to run as often as you like, from as many places as you like. */
export async function runAuctionJob(sb: Admin, now = new Date()): Promise<AuctionSummary> {
  const summary: AuctionSummary = { ranAt: now.toISOString(), closed: 0, wonAndBilled: 0, rolled: 0, unsold: 0, reopened: 0, closingSoonEmails: 0, errors: [] };
  await warnClosingSoon(sb, now, summary);
  await closeDueAuctions(sb, now, summary);
  await rollExpiredFunding(sb, now, summary);
  return summary;
}
