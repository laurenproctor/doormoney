import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { auctionUnsold, auctionWon, closingSoon, outbidNotice, sendEmail } from "@/lib/email";
import { bidStepCents } from "@/lib/money";
import { lotName, ownerEmail } from "@/lib/purchases";
import { SITE } from "@/lib/site";

/*
  Auctions. Straight bidding: a bid is exactly what the patron pays if they win (decision 4).
  The lot's price_cents is the reserve. A lot closes on its own closes_at, or with the run.

  At close the top bid wins and gets 48 hours to pay. If that runs out the bid is marked passed
  and the lot rolls to the next highest. With nothing left, the lot goes unsold.

  Every step here is safe to run twice: each write is conditional on the state it expects.
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

const token = () => randomBytes(24).toString("base64url");
const hoursFromNow = (h: number, from = new Date()) => new Date(from.getTime() + h * 3600_000);

export type AuctionSummary = {
  ranAt: string;
  closed: number;
  wonAndBilled: number;
  rolled: number;
  unsold: number;
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
  runs: { id: string; title: string; status: string; bidding_closes_at: string | null; acts: { name: string; slug: string; owner_id: string | null } };
};

type BidRow = { id: string; amount_cents: number; anonymous: boolean; passed_at: string | null; created_at: string; patrons: { name: string; contact_email: string } | null };

const LOT_SELECT =
  "id,label,surface_key,price_cents,status,closes_at,winner_bid_id,funding_deadline,closing_soon_sent_at,runs!inner(id,title,status,bidding_closes_at,acts!inner(name,slug,owner_id))";

/** Every bid on a lot, highest first, newest first on a tie. */
async function bidsFor(sb: Admin, lotId: string) {
  const { data } = await sb
    .from("bids")
    .select("id,amount_cents,anonymous,passed_at,created_at,patrons(name,contact_email)")
    .eq("lot_id", lotId)
    .order("amount_cents", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as BidRow[];
}

/**
 * Hands a lot to a bidder: winner, a fresh 48-hour clock, a fresh private link, and the email.
 * Conditional on the lot still being where the caller found it, so two jobs cannot both hand it over.
 */
async function offerTo(sb: Admin, lot: LotRow, bid: BidRow, expect: { status: string; winnerBidId: string | null }) {
  const funding = token();
  const deadline = hoursFromNow(FUNDING_HOURS);
  const q = sb
    .from("lots")
    .update({ status: "pending_funding", winner_bid_id: bid.id, funding_deadline: deadline.toISOString(), funding_token: funding })
    .eq("id", lot.id)
    .eq("status", expect.status);
  const { data: marked, error } = await (expect.winnerBidId === null ? q.is("winner_bid_id", null) : q.eq("winner_bid_id", expect.winnerBidId)).select("id");
  if (error) throw new Error(`offer lot ${lot.id}: ${error.message}`);
  if (!marked?.length) return false;

  const to = bid.patrons?.contact_email;
  if (to) {
    const r = await sendEmail(
      auctionWon({
        to,
        patronName: bid.patrons?.name ?? "A patron",
        actName: lot.runs.acts.name,
        runTitle: lot.runs.title,
        lotName: lotName(lot),
        amountCents: bid.amount_cents,
        hours: FUNDING_HOURS,
        deadline,
        payUrl: `${SITE.url}/claim/${funding}`,
      }),
    );
    if (!r.sent) console.error("auction won notice not sent", lot.id, r.reason);
  }
  return true;
}

/** Nobody is going to pay for this one. Tell the act and take it off the board. */
async function markUnsold(sb: Admin, lot: LotRow, expect: { status: string }) {
  const { data: marked } = await sb
    .from("lots")
    .update({ status: "unsold", funding_deadline: null, funding_token: null })
    .eq("id", lot.id)
    .eq("status", expect.status)
    .select("id");
  if (!marked?.length) return false;
  const owner = await ownerEmail(sb, lot.runs.acts.owner_id);
  if (owner) {
    const r = await sendEmail(auctionUnsold({ to: owner, actName: lot.runs.acts.name, lotName: lotName(lot), reserveCents: lot.price_cents, dashboardUrl: `${SITE.url}/dashboard` }));
    if (!r.sent) console.error("unsold notice not sent", lot.id, r.reason);
  }
  return true;
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
      const bids = (await bidsFor(sb, lot.id)).filter((b) => !b.passed_at);
      const top = bids.find((b) => b.amount_cents >= lot.price_cents) ?? null;
      if (!top) {
        if (await markUnsold(sb, lot, { status: "open" })) {
          if (summary) {
            summary.unsold += 1;
            summary.closed += 1;
          }
        }
        continue;
      }
      if (await offerTo(sb, lot, top, { status: "open", winnerBidId: null })) {
        if (summary) {
          summary.wonAndBilled += 1;
          summary.closed += 1;
        }
      }
    } catch (e) {
      summary?.errors.push(`close ${lot.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** The winner did not pay in time. Mark the bid passed and roll to the next one down. */
export async function rollExpiredFunding(sb: Admin, now = new Date(), summary?: AuctionSummary) {
  const { data } = await sb.from("lots").select(LOT_SELECT).eq("mode", "auction").eq("status", "pending_funding").lt("funding_deadline", now.toISOString());
  for (const lot of (data ?? []) as unknown as LotRow[]) {
    try {
      // A purchase in flight means they are paying right now; leave them alone.
      const { data: paying } = await sb.from("purchases").select("id").eq("lot_id", lot.id).in("payment_status", ["held", "released"]).maybeSingle();
      if (paying) continue;

      if (lot.winner_bid_id) {
        await sb.from("bids").update({ passed_at: now.toISOString() }).eq("id", lot.winner_bid_id).is("passed_at", null);
      }
      const remaining = (await bidsFor(sb, lot.id)).filter((b) => !b.passed_at && b.id !== lot.winner_bid_id && b.amount_cents >= lot.price_cents);
      const next = remaining[0];
      if (!next) {
        if (await markUnsold(sb, lot, { status: "pending_funding" })) {
          if (summary) summary.unsold += 1;
        }
        continue;
      }
      if (await offerTo(sb, lot, next, { status: "pending_funding", winnerBidId: lot.winner_bid_id })) {
        if (summary) summary.rolled += 1;
      }
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
            boardUrl: `${SITE.url}/board/${lot.runs.acts.slug}`,
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
        boardUrl: `${SITE.url}/board/${lot.runs.acts.slug}`,
      }),
    );
    if (!r.sent) console.error("outbid notice not sent", b.id, r.reason);
  }
}

/**
 * Closes and rolls whatever is due for one act, on the spot. The board calls this when it can see
 * that something is overdue, so an auction ends on time whatever the cron schedule allows: Vercel's
 * smaller plans only run a cron once a day, and a close cannot wait that long. Cheap, because the
 * board only calls it when one of its own lots is actually past its time.
 */
export async function settleDueLots(sb: Admin, now = new Date()) {
  await closeDueAuctions(sb, now);
  await rollExpiredFunding(sb, now);
}

/** The whole auction pass: warn, close, roll. Safe to run as often as you like. */
export async function runAuctionJob(sb: Admin, now = new Date()): Promise<AuctionSummary> {
  const summary: AuctionSummary = { ranAt: now.toISOString(), closed: 0, wonAndBilled: 0, rolled: 0, unsold: 0, closingSoonEmails: 0, errors: [] };
  await warnClosingSoon(sb, now, summary);
  await closeDueAuctions(sb, now, summary);
  await rollExpiredFunding(sb, now, summary);
  return summary;
}
