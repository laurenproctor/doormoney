import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dropBacking, fulfilBacking } from "@/lib/backings";
import { tierPlace } from "@/lib/catalog";
import { payoutsOn, refundIssued, sendEmail } from "@/lib/email";
import { recordRefund, recordTransfer } from "@/lib/ledger";
import { backoffMinutes, MAX_ATTEMPTS } from "@/lib/outbox";
import { fulfilLotPurchase, lotName, ownerEmail, releaseLot } from "@/lib/purchases";
import { SITE } from "@/lib/site";

/*
  What Door Money does with a webhook, and what it remembers about having done it.

  The work used to live in the route, which recorded an event id and nothing else. A handler that
  refused was written to the console and answered 200; a handler that threw had its row deleted so
  Stripe would retry; and any failed insert at all, a timeout included, was read as a duplicate and
  answered 200, which loses the event for good. Migration 0039 gives the row a status, an attempt
  count, the error and the payload. This file is what writes them.

  Two ways in, one body. A delivery from Stripe claims the row and runs it immediately, because a
  patron is waiting on the other end of a checkout. The daily worker picks up whatever failed or
  was left in flight and runs the same body from the stored payload. Neither can run an event the
  other is holding: the claim is a conditional update, the way src/lib/outbox.ts claims a refund.

  Nothing here charges, refunds or transfers. It decides what happened and writes it down.
*/

type Admin = SupabaseClient;

/** What became of one event. A throw from `applyStripeEvent` is the third outcome. */
export type Outcome = "processed" | "ignored";

/** How long a claimed event can sit in flight before a worker may take it back. */
export const STALL_MINUTES = 15;

/** How many rows one worker pass will take. */
const BATCH = 50;

export type EventRow = { id: string; type: string; payload: Stripe.Event | null; attempts: number };
export type EventSummary = { processed: number; ignored: number; retryable: number; failed: number; reclaimed: number };

/* ---------------------------------------------------------------------------------------------
   The work itself.
   --------------------------------------------------------------------------------------------- */

/**
 * Acts on one event and says whether it did.
 *
 * `ignored` is deliberate, not a shrug: an event type this system does not act on, or one whose
 * metadata says it belongs to another integration on the same account. It is recorded so that
 * "there was nothing to do" and "nobody ever looked" stop being the same row.
 *
 * A throw means the attempt failed and is worth another. Anything that could not be written to the
 * database throws for that reason. A failed email does not: the money has already moved by then,
 * and an unsendable address must not make a money event retry for a day and a half.
 */
export async function applyStripeEvent(sb: Admin, event: Stripe.Event): Promise<Outcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // With delayed payment methods `completed` arrives while the session is still unpaid; the
      // async_payment_succeeded event follows once the money is real. Fulfil on whichever is paid.
      if (session.payment_status === "unpaid") return "ignored";
      if (session.metadata?.kind !== "lot") return "ignored"; // fan backings come through payment_intent.succeeded
      const r = await fulfilLotPurchase(sb, session);
      if (!r.ok) throw new Error(`fulfil: ${r.reason}`);
      return "processed";
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object;
      if (session.metadata?.kind !== "lot") return "ignored";
      await releaseLot(sb, session);
      return "processed";
    }
    case "payment_intent.succeeded": {
      // A fan backing through the widget. Lot purchases also raise this event; they are fulfilled from the session above.
      const pi = event.data.object;
      if (pi.metadata?.kind !== "backing") return "ignored";
      const r = await fulfilBacking(sb, pi);
      if (!r.ok) throw new Error(`fulfil backing: ${r.reason}`);
      return "processed";
    }
    case "payment_intent.canceled": {
      const pi = event.data.object;
      if (pi.metadata?.kind !== "backing") return "ignored";
      await dropBacking(sb, pi);
      return "processed";
    }
    case "charge.refunded":
      return applyChargeRefunded(sb, event.data.object);
    case "transfer.created": {
      // The payout job records the transfer itself; this catches a job that died between the two writes.
      const transfer = event.data.object;
      const payoutId = transfer.metadata?.payout_id;
      if (!payoutId) return "ignored";
      const { data: marked, error } = await sb
        .from("payout_schedule")
        .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date(transfer.created * 1000).toISOString() })
        .eq("id", payoutId)
        .eq("status", "scheduled")
        .select("id,purchase_id,backing_id,amount_cents");
      if (error) throw new Error(`transfer.created ${transfer.id}: ${error.message}`);
      // The row was still scheduled, so the job died before writing it, and before writing the
      // books. Write those here too. A row the job did mark is left alone: the job wrote the
      // ledger itself, or reported that it could not.
      const slice = (marked as { purchase_id: string | null; backing_id: string | null; amount_cents: number }[] | null)?.[0];
      if (slice) await recordHealedTransfer(sb, slice, payoutId, transfer);
      return "processed";
    }
    case "account.updated": {
      // Express onboarding finished, or Stripe changed its mind. Mirror the flag on the act.
      const account = event.data.object;
      const enabled = Boolean(account.payouts_enabled);
      // Read first, so the act is only congratulated on the change from off to on.
      const { data: before } = await sb.from("acts").select("id,name,owner_id,stripe_payouts_enabled").eq("stripe_account_id", account.id).maybeSingle();
      if (!before) return "ignored"; // a connected account this Door Money does not know
      const { error } = await sb.from("acts").update({ stripe_payouts_enabled: enabled }).eq("stripe_account_id", account.id);
      if (error) throw new Error(`account.updated ${account.id}: ${error.message}`);
      if (enabled && !before.stripe_payouts_enabled) {
        const owner = await ownerEmail(sb, before.owner_id);
        if (owner) {
          const r = await sendEmail(payoutsOn({ to: owner, actName: before.name, dashboardUrl: `${SITE.url}/dashboard/payouts` }));
          if (!r.sent) console.error("payouts-on notice not sent", before.id, r.reason);
        }
      }
      return "processed";
    }
    default:
      // Subscribed to and not acted on. The endpoint carries eighteen types and this system acts
      // on nine; the other nine land here and say so rather than passing for done work.
      return "ignored";
  }
}

/**
 * A refund happened, here or in the Stripe Dashboard. Mirror the amount; a full refund also stops
 * the remaining slices. The charge belongs to a lot purchase or a fan backing, so look in both.
 */
async function applyChargeRefunded(sb: Admin, charge: Stripe.Charge): Promise<Outcome> {
  for (const table of ["purchases", "backings"] as const) {
    const { data: p, error: readError } = await sb.from(table).select("id,amount_cents,refunded_cents").eq("stripe_charge_id", charge.id).maybeSingle();
    if (readError) throw new Error(`charge.refunded ${charge.id}: ${readError.message}`);
    if (!p) continue;

    // Stripe sends a running total, so an older delivery arriving late has nothing to add.
    if (charge.amount_refunded <= p.refunded_cents) return "processed";

    const full = charge.amount_refunded >= p.amount_cents;

    // The books, before the row is mirrored, so a write that fails here is retried into this same
    // branch rather than past it. Keyed by the running total, which is what Door Money's own refund
    // names too: when that refund's webhook lands here first, this writes the event and refundRow
    // finds it; when refundRow got there first, the mirror above has already returned.
    const newlyRefunded = charge.amount_refunded - p.refunded_cents;
    const latestRefund = charge.refunds?.data?.[0];
    await recordRefund(sb, table === "purchases" ? { purchaseId: p.id } : { backingId: p.id }, {
      by: "hand",
      refundCents: newlyRefunded,
      totalRefundedCents: charge.amount_refunded,
      stripeObjectId: latestRefund?.id ?? charge.id,
      occurredAt: typeof latestRefund?.created === "number" ? new Date(latestRefund.created * 1000) : null,
    });

    const { error } = await sb
      .from(table)
      .update({ refunded_cents: charge.amount_refunded, refunded_at: new Date().toISOString(), payment_status: full ? "refunded" : "partially_refunded" })
      .eq("id", p.id);
    if (error) throw new Error(`charge.refunded ${table} ${p.id}: ${error.message}`);

    if (full) {
      const { error: e } = await sb
        .from("payout_schedule")
        .update({ status: "skipped", paused_reason: "refunded" })
        .eq(table === "purchases" ? "purchase_id" : "backing_id", p.id)
        .in("status", ["scheduled", "paused"]);
      if (e) throw new Error(`charge.refunded slices ${p.id}: ${e.message}`);
    }

    // Door Money's own cancel and decline paths record the refund before Stripe reports it, so
    // they never reach this line. What does reach it is a refund made by hand, which would
    // otherwise put money back without a word to the patron.
    const detail = await refundDetail(sb, table, p.id);
    if (detail?.to) {
      const r = await sendEmail(
        refundIssued({
          to: detail.to,
          patronName: detail.patronName,
          actName: detail.actName,
          what: detail.what,
          refundedCents: charge.amount_refunded - p.refunded_cents,
          full,
          recordUrl: `${SITE.url}/record/${p.id}`,
        }),
      );
      if (!r.sent) console.error("refund notice not sent", table, p.id, r.reason);
    }
    return "processed";
  }
  // A charge on this account that no payment here points at.
  return "ignored";
}

/**
 * Who to write to about a refund, and what the money was for. A lot purchase and a fan backing
 * describe themselves differently, so each is read on its own terms.
 */
async function refundDetail(sb: Admin, table: "purchases" | "backings", id: string) {
  if (table === "purchases") {
    const { data } = await sb
      .from("purchases")
      .select("patrons(name,contact_email),lots!inner(label,surface_key,runs!inner(acts!inner(name)))")
      .eq("id", id)
      .maybeSingle();
    type R = { patrons: { name: string; contact_email: string } | null; lots: { label: string | null; surface_key: string; runs: { acts: { name: string } } } };
    const row = data as unknown as R | null;
    if (!row) return null;
    return { to: row.patrons?.contact_email ?? null, patronName: row.patrons?.name ?? "A patron", actName: row.lots.runs.acts.name, what: `the ${lotName(row.lots).toLowerCase()}` };
  }
  const { data } = await sb.from("backings").select("display_name,tier,patrons(contact_email),runs!inner(acts!inner(name))").eq("id", id).maybeSingle();
  type B = { display_name: string; tier: string; patrons: { contact_email: string } | null; runs: { acts: { name: string } } };
  const row = data as unknown as B | null;
  if (!row) return null;
  return { to: row.patrons?.contact_email ?? null, patronName: row.display_name, actName: row.runs.acts.name, what: `a name on ${tierPlace(row.tier)}` };
}

/**
 * The books for a transfer the Friday job sent and never wrote down. The slice's payment is read
 * for its amount and fee, which the fee accrual needs; the write itself is keyed by the payout row
 * and finds the job's own entry if the job did get that far.
 */
async function recordHealedTransfer(sb: Admin, slice: { purchase_id: string | null; backing_id: string | null; amount_cents: number }, payoutId: string, transfer: Stripe.Transfer) {
  const payment = slice.purchase_id ? ({ purchaseId: slice.purchase_id } as const) : slice.backing_id ? ({ backingId: slice.backing_id } as const) : null;
  if (!payment) return;
  const table = payment.purchaseId ? "purchases" : "backings";
  const { data, error } = await sb.from(table).select("amount_cents,fee_cents").eq("id", payment.purchaseId ?? payment.backingId).maybeSingle();
  if (error) throw new Error(`transfer.created ${transfer.id}: ${error.message}`);
  const row = data as { amount_cents: number; fee_cents: number } | null;
  if (!row) return;
  await recordTransfer(sb, payment, {
    payoutId,
    sliceCents: slice.amount_cents,
    transferId: transfer.id,
    occurredAt: new Date(transfer.created * 1000),
    amountCents: row.amount_cents,
    feeCents: row.fee_cents,
  });
}

/* ---------------------------------------------------------------------------------------------
   The record.
   --------------------------------------------------------------------------------------------- */

/** Statuses a delivery or a worker may take over. Anything else is somebody else's, or finished. */
const CLAIMABLE = ["received", "retryable", "failed"] as const;

/** Settled one way or the other. A second delivery of one of these is a duplicate. */
const SETTLED = ["processed", "ignored"] as const;

type Stored = { outcome: "claimed"; attempts: number } | { outcome: "duplicate" } | { outcome: "error"; reason: string };

/**
 * Writes the event down and claims it, in that order.
 *
 * The insert is the dedupe: the event id is the primary key. What matters, and what was wrong
 * before, is telling a duplicate key from every other reason an insert can fail. A timeout is not
 * a duplicate, and answering Stripe 200 for one throws the event away, because Stripe will not
 * send it again.
 */
export async function storeAndClaim(sb: Admin, event: Stripe.Event, now = new Date()): Promise<Stored> {
  const { error } = await sb.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    payload: event,
    api_version: event.api_version ?? null,
    status: "processing",
    attempts: 1,
  });
  if (!error) return { outcome: "claimed", attempts: 1 };
  if (error.code !== "23505") return { outcome: "error", reason: error.message };

  // A row exists. Whether this delivery may run it depends on where the last attempt got to.
  const { data: existing, error: readError } = await sb.from("stripe_events").select("status,attempts,updated_at").eq("id", event.id).maybeSingle();
  if (readError) return { outcome: "error", reason: readError.message };
  if (!existing) return { outcome: "error", reason: "the event row vanished between the insert and the read" };

  const status = existing.status as string;
  if ((SETTLED as readonly string[]).includes(status)) return { outcome: "duplicate" };
  if (status === "processing" && !isStalled(existing.updated_at as string, now)) return { outcome: "duplicate" }; // in flight elsewhere
  if (!(CLAIMABLE as readonly string[]).includes(status) && status !== "processing") return { outcome: "duplicate" };

  const attempts = (existing.attempts as number) + 1;
  const { data: claimed, error: claimError } = await sb
    .from("stripe_events")
    .update({ status: "processing", attempts, payload: event, api_version: event.api_version ?? null, settled_at: null })
    .eq("id", event.id)
    .eq("status", status)
    .select("id");
  if (claimError) return { outcome: "error", reason: claimError.message };
  if (!claimed?.length) return { outcome: "duplicate" }; // somebody else took it first
  return { outcome: "claimed", attempts };
}

function isStalled(updatedAt: string, now: Date) {
  return new Date(updatedAt).getTime() <= now.getTime() - STALL_MINUTES * 60_000;
}

/** The event is done, one way or the other. */
export async function settleEvent(sb: Admin, id: string, outcome: Outcome, now = new Date()) {
  await sb.from("stripe_events").update({ status: outcome, last_error: null, settled_at: now.toISOString() }).eq("id", id);
}

/** The attempt failed. Put it back in the queue, or stop and leave it for a person to read. */
export async function deferEvent(sb: Admin, id: string, attempts: number, reason: string, now = new Date()) {
  const wait = backoffMinutes(attempts);
  const terminal = wait === null;
  await sb
    .from("stripe_events")
    .update({
      status: terminal ? "failed" : "retryable",
      last_error: reason.slice(0, 500),
      next_attempt_at: new Date(now.getTime() + (wait ?? 0) * 60_000).toISOString(),
      settled_at: terminal ? now.toISOString() : null,
    })
    .eq("id", id);
  if (terminal) console.error("webhook event gave up after", attempts, "attempts:", id, reason);
}

/**
 * Runs an event that has already been claimed, and records what became of it.
 * Returns the outcome, or the reason it failed, so the caller can answer Stripe.
 */
export async function runClaimedEvent(sb: Admin, event: Stripe.Event, attempts: number, now = new Date()): Promise<{ ok: true; outcome: Outcome } | { ok: false; reason: string }> {
  try {
    const outcome = await applyStripeEvent(sb, event);
    await settleEvent(sb, event.id, outcome, now);
    return { ok: true, outcome };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("webhook handler failed", event.type, event.id, reason);
    await deferEvent(sb, event.id, attempts, reason, now);
    return { ok: false, reason };
  }
}

/* ---------------------------------------------------------------------------------------------
   The worker.
   --------------------------------------------------------------------------------------------- */

/**
 * Events a worker claimed and never finished.
 *
 * Claiming moves a row to processing so two workers cannot run it twice. A process that dies
 * between the claim and the answer leaves it there, and the queue only looks at received and
 * retryable, so without this the event would be invisible: the failure this table exists to stop,
 * one step further in.
 */
export async function reclaimStalledEvents(sb: Admin, now = new Date()) {
  const before = new Date(now.getTime() - STALL_MINUTES * 60_000).toISOString();
  const { data } = await sb
    .from("stripe_events")
    .update({ status: "retryable", last_error: "a worker stopped partway through" })
    .eq("status", "processing")
    .lt("updated_at", before)
    .select("id");
  const count = data?.length ?? 0;
  if (count) console.error("reclaimed", count, "webhook events a worker left in flight");
  return count;
}

/**
 * Works whatever is due: events that were never run and events whose last attempt failed.
 *
 * A row is claimed by moving it to processing, conditional on the status it was read in, so two
 * workers racing on the same event cannot both act on it. Every handler underneath is idempotent
 * besides, which is what makes a retry safe at all.
 */
export async function workEventQueue(sb: Admin, now = new Date()): Promise<EventSummary> {
  const summary: EventSummary = { processed: 0, ignored: 0, retryable: 0, failed: 0, reclaimed: 0 };

  const { data, error } = await sb
    .from("stripe_events")
    .select("id,type,payload,attempts")
    .in("status", ["received", "retryable"])
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at")
    .limit(BATCH);
  if (error) throw new Error(`load webhook queue: ${error.message}`);

  for (const row of (data ?? []) as EventRow[]) {
    const attempts = row.attempts + 1;
    const { data: claimed } = await sb
      .from("stripe_events")
      .update({ status: "processing", attempts })
      .eq("id", row.id)
      .in("status", ["received", "retryable"])
      .select("id");
    if (!claimed?.length) continue; // somebody else took it

    // An event stored before migration 0039 has no payload, so there is nothing to replay. Say so
    // once and stop, rather than trying it every day for the rest of time.
    if (!row.payload) {
      await sb
        .from("stripe_events")
        .update({ status: "failed", last_error: "no payload stored; this event predates migration 0039", settled_at: now.toISOString() })
        .eq("id", row.id);
      summary.failed += 1;
      continue;
    }

    const r = await runClaimedEvent(sb, row.payload, attempts, now);
    if (r.ok) summary[r.outcome === "processed" ? "processed" : "ignored"] += 1;
    else summary[attempts >= MAX_ATTEMPTS ? "failed" : "retryable"] += 1;
  }
  return summary;
}

/** The daily pass: free what a dead worker holds, then run what is due. */
export async function runEventJob(sb: Admin, now = new Date()): Promise<EventSummary> {
  const reclaimed = await reclaimStalledEvents(sb, now);
  const worked = await workEventQueue(sb, now);
  return { ...worked, reclaimed };
}
