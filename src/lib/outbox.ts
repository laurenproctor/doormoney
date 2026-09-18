import type { SupabaseClient } from "@supabase/supabase-js";
import { tierPlace } from "@/lib/catalog";
import { cancellationNotice, markDeclined, sendEmail } from "@/lib/email";
import { lotName } from "@/lib/purchases";
import { queueRefund, refundBacking, refundKey, refundPurchase, type RefundReason } from "@/lib/refunds";
import { SITE } from "@/lib/site";

/*
  Refunds Door Money owes, written down before Stripe is called.

  cancelRun used to refund every patron on a cancelled fundraiser in one in-memory loop and collect
  what failed into an array the caller threw away. A process that died halfway left no record that
  the remaining refunds were owed. This is the record: one row in financial_operations per refund,
  queued first and worked second, so a crash costs an attempt rather than an obligation.

  Three things reach it. The two places an obligation is born (a cancelled fundraiser, a declined
  logo) queue and then attempt immediately, so the common case is still instant. The daily job
  works whatever is still owed, frees anything a dead worker is still holding, and sweeps for
  obligations that were never written down at all, which is what makes a crash between marking a
  fundraiser cancelled and queueing its refunds survivable.

  The patron is written to from here and nowhere else, once, by whichever attempt succeeds. A
  refund that lands a week late still tells them, and cannot tell them twice.
*/

type Admin = SupabaseClient;

/**
 * How long to wait before trying again, by the number of attempts already made.
 *
 * Minutes, widening. A card network hiccup clears in the first few; anything still failing after
 * half a day is a problem to read rather than to retry, and MAX_ATTEMPTS ends it.
 */
export const BACKOFF_MINUTES = [5, 30, 120, 720, 1440] as const;
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

/** The delay after a failed attempt, and null when there are no attempts left. */
export function backoffMinutes(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] ?? BACKOFF_MINUTES[0];
}

export type OpRow = {
  id: string;
  purchase_id: string | null;
  backing_id: string | null;
  reason: RefundReason;
  attempts: number;
  notified_at: string | null;
};

export type QueueSummary = { succeeded: number; refundedCents: number; retryable: number; failed: number };

/**
 * Attempts the refunds named by their keys, or every one that is due when no keys are given.
 *
 * A row is claimed by moving it to processing, conditional on the status it was read in, so two
 * workers racing on the same row cannot both call Stripe. The Stripe call itself is keyed, so even
 * if they did, only one refund would exist.
 */
export async function workRefundQueue(sb: Admin, keys?: string[], now = new Date()): Promise<QueueSummary> {
  const summary: QueueSummary = { succeeded: 0, refundedCents: 0, retryable: 0, failed: 0 };

  const query = sb
    .from("financial_operations")
    .select("id,purchase_id,backing_id,reason,attempts,notified_at")
    .eq("kind", "refund")
    .in("status", ["pending", "retryable"]);
  const { data, error } = keys?.length
    ? await query.in("idempotency_key", keys)
    : await query.lte("next_attempt_at", now.toISOString()).order("next_attempt_at").limit(100);
  if (error) throw new Error(`load refund queue: ${error.message}`);

  for (const op of (data ?? []) as OpRow[]) {
    // Claim it. A row somebody else already took is skipped rather than refunded twice.
    const { data: claimed } = await sb
      .from("financial_operations")
      .update({ status: "processing", attempts: op.attempts + 1 })
      .eq("id", op.id)
      .in("status", ["pending", "retryable"])
      .select("id");
    if (!claimed?.length) continue;

    const attempts = op.attempts + 1;
    try {
      // The table's check constraint says exactly one of these is set.
      const [source, id] = op.purchase_id ? (["purchases", op.purchase_id] as const) : (["backings", op.backing_id ?? ""] as const);
      const r = source === "purchases" ? await refundPurchase(sb, id, op.reason) : await refundBacking(sb, id, op.reason);
      if (!r.ok) {
        await defer(sb, op.id, attempts, r.reason);
        summary[attempts >= MAX_ATTEMPTS ? "failed" : "retryable"] += 1;
        continue;
      }

      // The patron hears once, from whichever attempt got there. `already` means an earlier one did.
      let notifiedAt = op.notified_at;
      if (!notifiedAt && !r.already) {
        const sent = await notifyRefunded(sb, source, id, op.reason, r.refundedCents);
        if (sent) notifiedAt = new Date().toISOString();
      }
      await sb
        .from("financial_operations")
        .update({ status: "succeeded", amount_cents: r.refundedCents, last_error: null, settled_at: new Date().toISOString(), notified_at: notifiedAt })
        .eq("id", op.id);
      summary.succeeded += 1;
      summary.refundedCents += r.refundedCents;
    } catch (e) {
      await defer(sb, op.id, attempts, e instanceof Error ? e.message : String(e));
      summary[attempts >= MAX_ATTEMPTS ? "failed" : "retryable"] += 1;
    }
  }
  return summary;
}

/** Puts a failed attempt back in the queue, or gives up and leaves it for Door Money to read. */
async function defer(sb: Admin, opId: string, attempts: number, reason: string) {
  const wait = backoffMinutes(attempts);
  const terminal = wait === null;
  await sb
    .from("financial_operations")
    .update({
      status: terminal ? "failed" : "retryable",
      last_error: reason.slice(0, 500),
      next_attempt_at: new Date(Date.now() + (wait ?? 0) * 60_000).toISOString(),
      settled_at: terminal ? new Date().toISOString() : null,
    })
    .eq("id", opId);
  if (terminal) console.error("refund gave up after", attempts, "attempts:", opId, reason);
}

/*
  Rows a worker claimed and never finished.

  Claiming moves a row to processing so that two workers cannot refund it twice. A process that
  dies between the claim and the answer leaves it there, and the queue only looks at pending and
  retryable, so without this the obligation would be invisible: exactly the failure this table was
  built to stop, one step further in. Anything still processing well past the cron's own time limit
  is nobody's live attempt.
*/
const STALL_MINUTES = 15;

export async function reclaimStalled(sb: Admin, now = new Date()) {
  const before = new Date(now.getTime() - STALL_MINUTES * 60_000).toISOString();
  const { data } = await sb
    .from("financial_operations")
    .update({ status: "retryable", last_error: "a worker stopped partway through" })
    .eq("status", "processing")
    .lt("updated_at", before)
    .select("id");
  const count = data?.length ?? 0;
  if (count) console.error("reclaimed", count, "refunds a worker left in flight");
  return count;
}

/*
  The sweep.

  cancelRun marks the fundraiser cancelled before it queues, so that no new spot can be sold into a
  fundraiser that is coming down. That leaves a window: a crash in between is a cancelled
  fundraiser whose obligations were never written. This closes it from the other end, by asking the
  only question that matters, which patron is still holding money on a cancelled fundraiser, rather
  than by trusting the request that cancelled it to have finished.
*/
type Owed = { id: string };
type Obligation = { source: "purchases" | "backings"; id: string; reason: RefundReason };

export async function sweepOwed(sb: Admin) {
  const found: Obligation[] = [];

  const { data: runs } = await sb.from("runs").select("id").eq("status", "cancelled");
  const runIds = (runs ?? []).map((r) => r.id);
  if (runIds.length) {
    const { data: lots } = await sb.from("lots").select("id").in("run_id", runIds);
    const lotIds = (lots ?? []).map((l) => l.id);
    const { data: purchases } = lotIds.length
      ? await sb.from("purchases").select("id").in("lot_id", lotIds).eq("payment_status", "held").eq("refunded_cents", 0)
      : { data: [] };
    const { data: backings } = await sb.from("backings").select("id").in("run_id", runIds).eq("payment_status", "held").eq("refunded_cents", 0);
    for (const row of (purchases ?? []) as Owed[]) found.push({ source: "purchases", id: row.id, reason: "run_cancelled" });
    for (const row of (backings ?? []) as Owed[]) found.push({ source: "backings", id: row.id, reason: "run_cancelled" });
  }

  // decideMark writes the decline before it queues, so the same gap exists there: a logo refused
  // with the patron's money still held is a refund owed, whatever happened to the request.
  const { data: declined } = await sb.from("purchases").select("id").eq("mark_status", "declined").eq("payment_status", "held").eq("refunded_cents", 0);
  for (const row of (declined ?? []) as Owed[]) found.push({ source: "purchases", id: row.id, reason: "mark_declined" });

  if (!found.length) return { queued: 0 };

  // One read to find what is already written down, rather than one per row.
  const keys = found.map((o) => refundKey(o.id, o.reason));
  const { data: known } = await sb.from("financial_operations").select("idempotency_key").in("idempotency_key", keys);
  const already = new Set((known ?? []).map((k) => k.idempotency_key as string));

  let queued = 0;
  for (const o of found) {
    if (already.has(refundKey(o.id, o.reason))) continue;
    await queueRefund(sb, o.source, o.id, o.reason);
    queued += 1;
  }
  if (queued) console.error("sweep found", queued, "refunds that were owed and never written down");
  return { queued };
}

/** The daily pass: free what a dead worker holds, write down what was missed, then work what is due. */
export async function runRefundJob(sb: Admin, now = new Date()) {
  const reclaimed = await reclaimStalled(sb, now);
  const swept = await sweepOwed(sb);
  const worked = await workRefundQueue(sb, undefined, now);
  return { ...worked, reclaimed, swept: swept.queued };
}

/* ---------------------------------------------------------------------------------------------
   Telling the patron. One place, so a refund that succeeds on the fourth attempt still sends the
   mail the first attempt would have, and so neither path can send it twice.
   --------------------------------------------------------------------------------------------- */

type PurchaseMail = {
  id: string;
  amount_cents: number;
  patrons: { name: string; contact_email: string } | null;
  lots: { label: string | null; surface_key: string; runs: { title: string; acts: { name: string } } };
};
type BackingMail = {
  id: string;
  amount_cents: number;
  tier: string;
  display_name: string;
  patrons: { contact_email: string } | null;
  runs: { title: string; acts: { name: string } };
};

/** Returns true when the patron was actually written to, so the row records only real sends. */
async function notifyRefunded(sb: Admin, source: "purchases" | "backings", id: string, reason: RefundReason, refundedCents: number) {
  const recordUrl = `${SITE.url}/record/${id}`;
  let to: string | null = null;
  let mail;

  if (source === "purchases") {
    const { data } = await sb
      .from("purchases")
      .select("id,amount_cents,patrons(name,contact_email),lots!inner(label,surface_key,runs!inner(title,acts!inner(name)))")
      .eq("id", id)
      .maybeSingle();
    const p = data as unknown as PurchaseMail | null;
    to = p?.patrons?.contact_email ?? null;
    if (!p || !to) return false;
    const what = lotName(p.lots);
    mail =
      reason === "mark_declined"
        ? markDeclined({ to, patronName: p.patrons?.name ?? "A patron", actName: p.lots.runs.acts.name, lotName: what, refundedCents, boardsUrl: `${SITE.url}/auctions` })
        : cancellationNotice({ to, patronName: p.patrons?.name ?? "A patron", actName: p.lots.runs.acts.name, runTitle: p.lots.runs.title, lotName: what, refundedCents, amountCents: p.amount_cents, recordUrl });
  } else {
    const { data } = await sb
      .from("backings")
      .select("id,amount_cents,tier,display_name,patrons(contact_email),runs!inner(title,acts!inner(name))")
      .eq("id", id)
      .maybeSingle();
    const b = data as unknown as BackingMail | null;
    to = b?.patrons?.contact_email ?? null;
    if (!b || !to) return false;
    // A backing carries no logo, so a cancelled fundraiser is the only way one is refunded.
    mail = cancellationNotice({
      to,
      patronName: b.display_name,
      actName: b.runs.acts.name,
      runTitle: b.runs.title,
      lotName: `name on ${tierPlace(b.tier)}`,
      refundedCents,
      amountCents: b.amount_cents,
      recordUrl,
    });
  }

  const sent = await sendEmail(mail);
  if (!sent.sent) console.error("refund notice not sent", id, sent.reason);
  return sent.sent;
}
