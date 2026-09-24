import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tierPlace } from "@/lib/catalog";
import { backingNotice, backingReceipt, sendEmail } from "@/lib/email";
import { paymentBelongsToRow } from "@/lib/fundraiser-identity";
import { chargeDetails, recordCharge } from "@/lib/ledger";
import { feeCents, weeklySlices } from "@/lib/money";
import { ownerEmail } from "@/lib/purchases";
import { SITE } from "@/lib/site";
import { retrieveIntentWithCharge } from "@/lib/stripe";
import { runUrl } from "@/lib/urls";

/*
  Fan backings: the $25 and $100 tiers on the widget (docs/DECISIONS.md, decision 3). Not lots.
  A backing is paid through a PaymentIntent confirmed by the Payment Element inside the widget's
  frame; the charge lands on the platform balance like a lot purchase and feeds the same Friday
  schedule. Called from the webhook with the service-role client. Safe to run twice.
*/

type Admin = SupabaseClient;

/** Door Money's cut on a backing. Same rate as a lot. */
export const backingFee = (amountCents: number) => feeCents(amountCents, SITE.feePercent);

type BackingRow = {
  id: string;
  amount_cents: number;
  fee_cents: number;
  payment_status: string;
  tier: string;
  display_name: string;
  patrons: { name: string; contact_email: string } | null;
  runs: { id: string; slug: string; title: string; starts_on: string; ends_on: string; act_id: string; acts: { id: string; name: string; slug: string; owner_id: string | null } };
};

async function loadBacking(sb: Admin, id: string) {
  const { data, error } = await sb
    .from("backings")
    .select("id,amount_cents,fee_cents,payment_status,tier,display_name,patrons(name,contact_email),runs!inner(id,slug,title,starts_on,ends_on,act_id,acts!inner(id,name,slug,owner_id))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`backing ${id}: ${error.message}`);
  return (data as unknown as BackingRow | null) ?? null;
}

const chargeOf = (pi: Stripe.PaymentIntent) => (typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null);

/**
 * The fan paid. Mark the backing held, lay down the weekly schedule, send the receipt and tell
 * the act. Idempotent: a second call finds the backing already held and stops.
 */
export async function fulfilBacking(sb: Admin, pi: Stripe.PaymentIntent) {
  const id = pi.metadata?.backing_id;
  if (!id) return { ok: false as const, reason: "no backing id on payment intent" };
  const b = await loadBacking(sb, id);
  if (!b) return { ok: false as const, reason: "backing not found" };

  // The backing row decides which fundraiser is paid, and the payment intent has always said which
  // one it was started for. If they disagree nothing is written, held or scheduled: the event
  // fails, stays visible in stripe_events, and a person looks. Checked before the "already" answer
  // so a payment for fundraiser A is never reported as settled against fundraiser B's backing.
  if (!paymentBelongsToRow(pi.metadata, b.runs.id)) {
    return { ok: false as const, reason: `fundraiser mismatch: the payment names ${pi.metadata?.run_id}, the backing is on ${b.runs.id}` };
  }
  if (b.payment_status !== "requires_payment") return { ok: true as const, already: true };

  // The delivered intent names its charge and nothing more. Read it back with the balance
  // transaction, which is where Stripe states its fee, and write the books before the row is
  // marked held: a hold that fails after this is retried into "already" above, and the entries are
  // already there. The write is keyed, so a retry finds it rather than doubling it.
  const charge = chargeDetails(await retrieveIntentWithCharge(pi.id));
  const chargeId = charge.chargeId ?? chargeOf(pi);
  if (chargeId) await recordCharge(sb, { backingId: b.id }, { amountCents: b.amount_cents, feeCents: b.fee_cents, ...charge, chargeId });
  else console.error("backing held with no charge behind it, so nothing was written to the ledger", b.id, pi.id);

  const { data: updated, error } = await sb
    .from("backings")
    .update({ payment_status: "held", stripe_payment_intent_id: pi.id, stripe_charge_id: chargeId })
    .eq("id", b.id)
    .eq("payment_status", "requires_payment")
    .select("id");
  if (error) throw new Error(`hold backing ${b.id}: ${error.message}`);
  if (!updated?.length) return { ok: true as const, already: true };

  const run = b.runs;
  const { count } = await sb.from("payout_schedule").select("id", { count: "exact", head: true }).eq("backing_id", b.id);
  if (!count) {
    const slices = weeklySlices(b.amount_cents - b.fee_cents, new Date(run.starts_on), new Date(run.ends_on));
    const rows = slices.map((s) => ({ act_id: run.act_id, backing_id: b.id, due_on: s.dueOn.toISOString().slice(0, 10), amount_cents: s.amountCents }));
    const { error: e } = await sb.from("payout_schedule").insert(rows);
    if (e) throw new Error(`schedule for backing ${b.id}: ${e.message}`);
  }

  const act = run.acts;
  const place = tierPlace(b.tier);
  const boardUrl = runUrl(act.slug, run.slug);
  const fanEmail = pi.receipt_email ?? b.patrons?.contact_email ?? null;
  if (fanEmail) {
    const r = await sendEmail(backingReceipt({ to: fanEmail, displayName: b.display_name, actName: act.name, runTitle: run.title, place, amountCents: b.amount_cents, boardUrl, recordUrl: `${SITE.url}/record/${b.id}` }));
    if (!r.sent) console.error("backing receipt not sent", b.id, r.reason);
  }
  const owner = await ownerEmail(sb, act.owner_id);
  if (owner) {
    const r = await sendEmail(backingNotice({ to: owner, actName: act.name, displayName: b.display_name, place, amountCents: b.amount_cents, netCents: b.amount_cents - b.fee_cents, dashboardUrl: `${SITE.url}/dashboard` }));
    if (!r.sent) console.error("backing notice not sent", b.id, r.reason);
  }
  return { ok: true as const, already: false };
}

/** The fan never paid and Stripe gave up on the intent. Drop the row so the count stays honest. Idempotent. */
export async function dropBacking(sb: Admin, pi: Stripe.PaymentIntent) {
  const id = pi.metadata?.backing_id;
  if (!id) return;
  // Only ever the unpaid row this intent was made for, on the fundraiser it was made for.
  const runId = pi.metadata?.run_id;
  const drop = sb.from("backings").delete().eq("id", id).eq("payment_status", "requires_payment");
  await (runId ? drop.eq("run_id", runId) : drop);
}
