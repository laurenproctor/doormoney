import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG } from "@/lib/catalog";
import { payoutNotice, purchaseReceipt, saleNotice, sendEmail, spotTaken } from "@/lib/email";
import { feeCents, weeklySlices } from "@/lib/money";
import { SITE } from "@/lib/site";
import { stripe } from "@/lib/stripe";
import { runUrl } from "@/lib/urls";

/*
  What happens to a purchase after Stripe speaks. Called from the webhook with the service-role
  client, so nothing here trusts the browser. Every function is safe to run twice: each write is
  conditional on the state it expects to find.
*/

type Admin = SupabaseClient;

/** Display name for a lot: its label, else the standard-card name, else the key. */
export function lotName(lot: { label: string | null; surface_key: string }) {
  return lot.label ?? CATALOG.find((c) => c.key === lot.surface_key)?.name ?? lot.surface_key;
}

/** Door Money's cut on a lot. One place, so the checkout and the schedule agree. */
export const lotFee = (amountCents: number) => feeCents(amountCents, SITE.feePercent);

type PurchaseRow = {
  id: string;
  amount_cents: number;
  fee_cents: number;
  payment_status: string;
  lot_id: string;
  patrons: { name: string; contact_email: string } | null;
  lots: {
    id: string;
    label: string | null;
    surface_key: string;
    mode: string;
    winner_bid_id: string | null;
    buy_now_cents: number | null;
    runs: { id: string; slug: string; title: string; starts_on: string; ends_on: string; act_id: string; acts: { id: string; name: string; slug: string; owner_id: string | null } };
  };
};

async function loadPurchase(sb: Admin, id: string) {
  const { data, error } = await sb
    .from("purchases")
    .select("id,amount_cents,fee_cents,payment_status,lot_id,patrons(name,contact_email),lots!inner(id,label,surface_key,mode,winner_bid_id,buy_now_cents,runs!inner(id,slug,title,starts_on,ends_on,act_id,acts!inner(id,name,slug,owner_id)))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`purchase ${id}: ${error.message}`);
  return (data as unknown as PurchaseRow | null) ?? null;
}

/** Email of the person who owns an act, for notices. Null for seeded acts nobody has claimed. */
export async function ownerEmail(sb: Admin, ownerId: string | null) {
  if (!ownerId) return null;
  const { data } = await sb.from("profiles").select("email").eq("id", ownerId).maybeSingle();
  return data?.email ?? null;
}

/**
 * The patron paid. Mark the purchase held, the lot sold, lay down the weekly schedule, and send
 * the receipt and the sale notice. Idempotent: a second call finds the purchase already held and stops.
 */
export async function fulfilLotPurchase(sb: Admin, session: Stripe.Checkout.Session) {
  const purchaseId = session.metadata?.purchase_id;
  if (!purchaseId) return { ok: false as const, reason: "no purchase id on session" };
  const p = await loadPurchase(sb, purchaseId);
  if (!p) return { ok: false as const, reason: "purchase not found" };
  if (p.payment_status !== "requires_payment") return { ok: true as const, already: true };

  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  let chargeId: string | null = null;
  if (piId) {
    const pi = await stripe.paymentIntents.retrieve(piId);
    chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
  }

  // The state change. Conditional on requires_payment so a duplicate event is a no-op.
  const { data: updated, error } = await sb
    .from("purchases")
    .update({ payment_status: "held", stripe_payment_intent_id: piId, stripe_charge_id: chargeId, stripe_checkout_session_id: session.id })
    .eq("id", p.id)
    .eq("payment_status", "requires_payment")
    .select("id");
  if (error) throw new Error(`hold purchase ${p.id}: ${error.message}`);
  if (!updated?.length) return { ok: true as const, already: true };

  await sb.from("lots").update({ status: "sold", funding_deadline: null, funding_token: null }).eq("id", p.lot_id);

  // Taken outright at the take-it-now price, with bids already on it. Everyone who bid is told the
  // bidding is over, and that nothing was charged to them.
  if (p.lots.mode === "auction" && !p.lots.winner_bid_id) await notifyBiddersSpotTaken(sb, p);

  // The schedule: the act's share, in equal Friday slices across the run.
  const run = p.lots.runs;
  const { count } = await sb.from("payout_schedule").select("id", { count: "exact", head: true }).eq("purchase_id", p.id);
  if (!count) {
    const slices = weeklySlices(p.amount_cents - p.fee_cents, new Date(run.starts_on), new Date(run.ends_on));
    const rows = slices.map((s) => ({ act_id: run.act_id, purchase_id: p.id, due_on: s.dueOn.toISOString().slice(0, 10), amount_cents: s.amountCents }));
    const { error: e } = await sb.from("payout_schedule").insert(rows);
    if (e) throw new Error(`schedule for ${p.id}: ${e.message}`);
  }

  // Mail. Failures are logged, never fatal: the money moved, the emails can be resent.
  const act = run.acts;
  const name = lotName(p.lots);
  const boardUrl = runUrl(act.slug, run.slug);
  const patronEmail = session.customer_details?.email ?? p.patrons?.contact_email ?? null;
  const patronName = p.patrons?.name ?? "A patron";
  if (patronEmail) {
    const r = await sendEmail(purchaseReceipt({ to: patronEmail, patronName, lotName: name, actName: act.name, runTitle: run.title, amountCents: p.amount_cents, boardUrl, recordUrl: `${SITE.url}/record/${p.id}` }));
    if (!r.sent) console.error("receipt not sent", p.id, r.reason);
  }
  const owner = await ownerEmail(sb, act.owner_id);
  if (owner) {
    const r = await sendEmail(saleNotice({ to: owner, actName: act.name, lotName: name, patronName, amountCents: p.amount_cents, netCents: p.amount_cents - p.fee_cents, boardUrl, dashboardUrl: `${SITE.url}/dashboard` }));
    if (!r.sent) console.error("sale notice not sent", p.id, r.reason);
  }
  return { ok: true as const, already: false };
}

/**
 * The patron never paid: the session expired or an async payment failed. Put the lot back on the
 * board and drop the purchase row, so the next patron can take it. Idempotent.
 */
export async function releaseLot(sb: Admin, session: Stripe.Checkout.Session) {
  const purchaseId = session.metadata?.purchase_id;
  if (!purchaseId) return { ok: false as const, reason: "no purchase id on session" };
  const { data: p } = await sb.from("purchases").select("id,lot_id,payment_status,lots!inner(mode,winner_bid_id)").eq("id", purchaseId).maybeSingle();
  if (!p) return { ok: true as const, already: true };
  if (p.payment_status !== "requires_payment") return { ok: true as const, already: true }; // paid after all; leave it
  await sb.from("purchases").delete().eq("id", p.id).eq("payment_status", "requires_payment");
  // A fixed-price spot goes straight back on the board, and so does an auction lot somebody was
  // taking at its buy-it-now price. A lot won at auction stays with its winner: they still have the
  // rest of their 48 hours, and the auction job rolls it on if they run out.
  const lot = (p as unknown as { lots: { mode: string; winner_bid_id: string | null } }).lots;
  if (lot.mode === "fixed" || !lot.winner_bid_id) await sb.from("lots").update({ status: "open", funding_deadline: null }).eq("id", p.lot_id).eq("status", "pending_funding");
  return { ok: true as const, already: false };
}

type LosingBid = { amount_cents: number; patrons: { name: string; contact_email: string } | null };

/** Tells everyone who bid that the spot went at the take-it-now price. One email each. */
async function notifyBiddersSpotTaken(sb: Admin, p: PurchaseRow) {
  const { data } = await sb.from("bids").select("amount_cents,patrons(name,contact_email)").eq("lot_id", p.lot_id).is("passed_at", null).order("amount_cents", { ascending: false });
  const bids = (data ?? []) as unknown as LosingBid[];
  const seen = new Set<string>();
  for (const b of bids) {
    const to = b.patrons?.contact_email;
    if (!to || seen.has(to.toLowerCase())) continue;
    seen.add(to.toLowerCase());
    const r = await sendEmail(
      spotTaken({
        to,
        patronName: b.patrons?.name ?? "A patron",
        actName: p.lots.runs.acts.name,
        lotName: lotName(p.lots),
        yourCents: b.amount_cents,
        takenAtCents: p.amount_cents,
        boardUrl: runUrl(p.lots.runs.acts.slug, p.lots.runs.slug),
      }),
    );
    if (!r.sent) console.error("spot taken notice not sent", p.lot_id, r.reason);
  }
}

/** Sends the act a note about the slices that went out today. */
export async function notifyPayout(sb: Admin, act: { name: string; owner_id: string | null }, amountCents: number, sliceCount: number) {
  const owner = await ownerEmail(sb, act.owner_id);
  if (!owner) return;
  const r = await sendEmail(payoutNotice({ to: owner, actName: act.name, amountCents, sliceCount, dashboardUrl: `${SITE.url}/dashboard/payouts` }));
  if (!r.sent) console.error("payout notice not sent", act.name, r.reason);
}
