import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
  The books. Remediation Phase 4, piece 2: the writer for the ledger migration 0055 created.

  Every path that moves money already writes the row that says where the money is now (purchases,
  backings, payout_schedule, financial_operations), and Phases 2 and 3 made Postgres enforce what
  those rows may say. This file writes the second record beside them: what happened, as balanced
  double-entry events, so that "how much has Door Money earned" and "how much does it owe
  organizers" are sums over history rather than reads of a column that is updated in place. The
  tables stay authoritative. The ledger mirrors them and asserts, and where the two disagree the
  disagreement is left standing for a person to read rather than corrected in silence.

  The sign convention is migration 0055's: debits positive, credits negative, and the entries of
  one event sum to zero. The constraint trigger refuses an unbalanced event, and the unique index
  on (payment, event, account) is the idempotency key: a webhook delivered twice, a Friday job run
  twice, or the job and the webhook both writing the same transfer, all find a duplicate key and
  write nothing the second time.

  Three rules of arithmetic live here and nowhere else.

  1. Door Money earns its 15% as the money releases (0055's header, the owner's decision of
     2026-09-22). After any release the fee earned on a payment is round(fee × released net ÷ net),
     and each release posts the difference between that figure and what the books already show as
     earned. That is refundDue's own arithmetic read the other way round. Both figures are read off
     the ledger, so the fee earned is always a function of what the books say was released: a
     transfer written late or out of order accrues exactly its share when it lands, and the total
     is never earned twice and never lost.

  2. A refund gives back what the books still hold for that payment: the unreleased net to the
     organizer's liability, and the unearned part of the fee. Door Money's own refund is refundDue,
     which rounds once on the whole amount, so it can differ from those two figures by a cent. The
     cent goes to revenue, earned or given up, and the payment's books close.

  3. Money refunded by hand beyond what Door Money still held (a Dashboard refund after slices had
     gone out) is a receivable from the organizer, recovered from later slices or absorbed, which is
     decision 18. The account is organizer_receivable, added by migration 0064. A hand refund of
     less than what was held is split between liability and fee in their proportion.

  Nothing here decides whether a cent moves, and nothing here talks to Stripe: the one Stripe read
  the books need, the processing fee on a charge, is done by the caller through
  retrieveIntentWithCharge in src/lib/stripe.ts and handed in.
*/

type Admin = SupabaseClient;

export type AccountKey = "platform_cash" | "organizer_liability" | "unearned_fee" | "platform_fee" | "stripe_fee" | "organizer_receivable" | "held_unresolved";

export type Entry = { account_key: AccountKey; amount_cents: number };

/** The payment an event belongs to. Exactly one, the same shape payout_schedule has used since 0001. */
export type Payment = { purchaseId: string; backingId?: undefined } | { backingId: string; purchaseId?: undefined };

export type LedgerEvent = {
  /** Also the idempotency key. See migration 0055. */
  eventKey: string;
  entries: Entry[];
  /** The Stripe object this came from, where there is one. Reconciliation matches on it. */
  stripeObjectId?: string | null;
  /** When the money moved. The row's own default is "now", which is when it was written. */
  occurredAt?: Date | null;
};

/**
 * What became of a write. `already` is the idempotent answer, not a failure: the same event was on
 * the books before this call. `nothing` means every entry was for zero cents, which is not an event.
 */
export type Posted = "written" | "already" | "nothing";

/* ---------------------------------------------------------------------------------------------
   The entries of each event. Pure, and tested as arithmetic.
   --------------------------------------------------------------------------------------------- */

/** A patron paid. The money is on the platform balance, owed to the organizer less a fee not yet earned. */
export function chargeEntries(p: { amountCents: number; feeCents: number }): Entry[] {
  return [
    { account_key: "platform_cash", amount_cents: p.amountCents },
    { account_key: "organizer_liability", amount_cents: -(p.amountCents - p.feeCents) },
    { account_key: "unearned_fee", amount_cents: -p.feeCents },
  ];
}

/** Stripe took its processing fee out of the platform balance. Door Money's expense, out of its 15%. */
export function stripeFeeEntries(feeCents: number): Entry[] {
  return [
    { account_key: "stripe_fee", amount_cents: feeCents },
    { account_key: "platform_cash", amount_cents: -feeCents },
  ];
}

/** One slice left the platform balance for the organizer's Connect account. */
export function transferEntries(sliceCents: number): Entry[] {
  return [
    { account_key: "organizer_liability", amount_cents: sliceCents },
    { account_key: "platform_cash", amount_cents: -sliceCents },
  ];
}

/**
 * Rule 1: the fee earned on a payment once this much of its net has been released. Rounded once on
 * the running total, never per slice, so the last slice always lands the fee on exactly fee_cents.
 */
export function earnedFeeAfter(p: { amountCents: number; feeCents: number }, releasedNetCents: number): number {
  const net = p.amountCents - p.feeCents;
  if (net <= 0) return p.feeCents;
  const released = Math.min(Math.max(0, releasedNetCents), net);
  return Math.round((p.feeCents * released) / net);
}

/** The fee that became earned with this release. Negative would un-earn, which the arithmetic never asks for. */
export function releaseEntries(earnedNowCents: number): Entry[] {
  return [
    { account_key: "unearned_fee", amount_cents: earnedNowCents },
    { account_key: "platform_fee", amount_cents: -earnedNowCents },
  ];
}

/** What the books still hold for one payment, which is what a refund gives back. */
export type Held = { unreleasedNetCents: number; unearnedFeeCents: number };

/**
 * Rules 2 and 3. `door_money` is a refund this system decided (refundDue): it closes the payment's
 * books, and the rounding cent goes to revenue. `hand` is a refund made in the Stripe Dashboard,
 * which can be any amount: less than what was held is split in proportion, and more than what was
 * held is money the organizer already has, so the excess is a receivable.
 */
export function refundEntries(refundCents: number, held: Held, by: "door_money" | "hand"): Entry[] {
  const liability = Math.max(0, held.unreleasedNetCents);
  const fee = Math.max(0, held.unearnedFeeCents);
  const entries: Entry[] = [{ account_key: "platform_cash", amount_cents: -refundCents }];

  if (by === "hand" && refundCents < liability + fee - 1) {
    const total = liability + fee;
    const liabilityPart = total === 0 ? 0 : Math.round((refundCents * liability) / total);
    entries.push({ account_key: "organizer_liability", amount_cents: liabilityPart });
    entries.push({ account_key: "unearned_fee", amount_cents: refundCents - liabilityPart });
    return entries.filter((e) => e.amount_cents !== 0);
  }

  entries.push({ account_key: "organizer_liability", amount_cents: liability });
  entries.push({ account_key: "unearned_fee", amount_cents: fee });
  const residue = refundCents - liability - fee;
  if (by === "hand" && residue > 1) entries.push({ account_key: "organizer_receivable", amount_cents: residue });
  else entries.push({ account_key: "platform_fee", amount_cents: residue });
  return entries.filter((e) => e.amount_cents !== 0);
}

/** Every event's entries sum to zero. Checked before the database is asked, so the message names the event. */
export function eventBalance(entries: Entry[]) {
  return entries.reduce((n, e) => n + e.amount_cents, 0);
}

/* ---------------------------------------------------------------------------------------------
   Reading a charge off Stripe. The payment intent is retrieved with latest_charge and its balance
   transaction expanded (retrieveIntentWithCharge); this says what was found there.
   --------------------------------------------------------------------------------------------- */

export type ChargeDetails = {
  chargeId: string | null;
  /** When Stripe created the charge. Null when only the charge id was available. */
  occurredAt: Date | null;
  /** Stripe's processing fee, once its balance transaction has been read. Null until then. */
  stripeFee: { cents: number; balanceTransactionId: string } | null;
};

export function chargeDetails(pi: Stripe.PaymentIntent | null | undefined): ChargeDetails {
  const none: ChargeDetails = { chargeId: null, occurredAt: null, stripeFee: null };
  if (!pi?.latest_charge) return none;
  if (typeof pi.latest_charge === "string") return { ...none, chargeId: pi.latest_charge };
  const charge = pi.latest_charge;
  const bt = charge.balance_transaction;
  const stripeFee = bt && typeof bt !== "string" && typeof bt.fee === "number" ? { cents: bt.fee, balanceTransactionId: bt.id } : null;
  return { chargeId: charge.id, occurredAt: typeof charge.created === "number" ? new Date(charge.created * 1000) : null, stripeFee };
}

/* ---------------------------------------------------------------------------------------------
   Writing.
   --------------------------------------------------------------------------------------------- */

const paymentColumn = (payment: Payment) => (payment.purchaseId ? (["purchase_id", payment.purchaseId] as const) : (["backing_id", payment.backingId ?? ""] as const));

/**
 * Writes one or more events for one payment in a single statement, so they land together or not
 * at all. A duplicate key on any row means the events were on the books already and nothing is
 * written now; anything else the database refuses is thrown, because a ledger that cannot be
 * written is a reason for the caller to stop and be retried.
 */
export async function postLedgerEvents(sb: Admin, payment: Payment, events: LedgerEvent[]): Promise<Posted> {
  const [column, id] = paymentColumn(payment);
  const rows: Record<string, unknown>[] = [];
  for (const event of events) {
    const entries = event.entries.filter((e) => e.amount_cents !== 0);
    if (!entries.length) continue;
    const off = eventBalance(entries);
    if (off !== 0) throw new Error(`ledger event ${event.eventKey} does not balance: off by ${off} cents`);
    for (const e of entries) {
      rows.push({
        [column]: id,
        account_key: e.account_key,
        amount_cents: e.amount_cents,
        event_key: event.eventKey,
        stripe_object_id: event.stripeObjectId ?? null,
        ...(event.occurredAt ? { occurred_at: event.occurredAt.toISOString() } : {}),
      });
    }
  }
  if (!rows.length) return "nothing";
  const { error } = await sb.from("ledger_entries").insert(rows);
  if (!error) return "written";
  if (error.code === "23505") return "already";
  throw new Error(`ledger ${events.map((e) => e.eventKey).join("+")} for ${column} ${id}: ${error.message}`);
}

/** What the ledger says about one payment. Sums over its entries, seed or not. */
export type Position = {
  /** Net transferred to the organizer so far, per the transfer events. */
  releasedNetCents: number;
  /** Fee earned so far, per the release events. */
  earnedFeeCents: number;
  /** The liability account's balance for this payment: what is still owed to the organizer. */
  unreleasedNetCents: number;
  /** The unearned-fee account's balance for this payment. */
  unearnedFeeCents: number;
  /** Whether the charge is on the books at all. */
  charged: boolean;
};

export async function ledgerPosition(sb: Admin, payment: Payment): Promise<Position> {
  const [column, id] = paymentColumn(payment);
  const { data, error } = await sb.from("ledger_entries").select("account_key,amount_cents,event_key").eq(column, id);
  if (error) throw new Error(`ledger position for ${column} ${id}: ${error.message}`);
  const rows = (data ?? []) as { account_key: string; amount_cents: number; event_key: string }[];
  const sum = (pick: (r: (typeof rows)[number]) => boolean) => rows.filter(pick).reduce((n, r) => n + Number(r.amount_cents), 0);
  // `0 - x` rather than `-x`: negating an empty sum gives -0, which deepEqual tells apart from 0.
  return {
    releasedNetCents: sum((r) => r.account_key === "organizer_liability" && r.event_key.startsWith("transfer_")),
    earnedFeeCents: 0 - sum((r) => r.account_key === "platform_fee" && r.event_key.startsWith("release_")),
    unreleasedNetCents: 0 - sum((r) => r.account_key === "organizer_liability"),
    unearnedFeeCents: 0 - sum((r) => r.account_key === "unearned_fee"),
    charged: rows.some((r) => r.event_key === "charge" || r.event_key === "seed_opening"),
  };
}

/**
 * A patron's money landed. Two events, written separately: the charge, from the row's own numbers,
 * and Stripe's fee, only once its balance transaction has been read. Separate so that a charge
 * recorded before the fee was known does not stop the fee being recorded on a later pass.
 */
export async function recordCharge(sb: Admin, payment: Payment, p: { amountCents: number; feeCents: number } & ChargeDetails): Promise<Posted> {
  const charge = await postLedgerEvents(sb, payment, [{ eventKey: "charge", entries: chargeEntries(p), stripeObjectId: p.chargeId, occurredAt: p.occurredAt }]);
  if (p.stripeFee && p.stripeFee.cents > 0) {
    await postLedgerEvents(sb, payment, [
      { eventKey: "stripe_fee", entries: stripeFeeEntries(p.stripeFee.cents), stripeObjectId: p.stripeFee.balanceTransactionId, occurredAt: p.occurredAt },
    ]);
  }
  return charge;
}

/**
 * One slice went to the organizer. The transfer and the fee it earns are one statement, keyed by
 * the payout row, so the Friday job and the transfer.created webhook can both call this for the
 * same slice and exactly one of them writes it.
 */
export async function recordTransfer(
  sb: Admin,
  payment: Payment,
  p: { payoutId: string; sliceCents: number; transferId: string | null; occurredAt: Date | null; amountCents: number; feeCents: number },
): Promise<Posted> {
  const position = await ledgerPosition(sb, payment);
  const earnedNow = earnedFeeAfter(p, position.releasedNetCents + p.sliceCents) - position.earnedFeeCents;
  return postLedgerEvents(sb, payment, [
    { eventKey: `transfer_${p.payoutId}`, entries: transferEntries(p.sliceCents), stripeObjectId: p.transferId, occurredAt: p.occurredAt },
    { eventKey: `release_${p.payoutId}`, entries: releaseEntries(earnedNow), occurredAt: p.occurredAt },
  ]);
}

/**
 * Money went back to the patron.
 *
 * The event is keyed by the running total refunded, which is what Stripe reports on the charge, so
 * Door Money's own refund (written here from refundRow, before it marks the row) and the
 * charge.refunded webhook for that same refund (which can arrive first) name the same event, and
 * the second one finds it on the books.
 *
 * `unreleasedNetCents` is handed in by Door Money's own path, which knows it from payout_schedule,
 * the authoritative table. A hand refund has no such source and gives back what the ledger holds.
 */
export async function recordRefund(
  sb: Admin,
  payment: Payment,
  p: { refundCents: number; totalRefundedCents: number; stripeObjectId: string | null; occurredAt: Date | null } & (
    | { by: "door_money"; unreleasedNetCents: number }
    | { by: "hand" }
  ),
): Promise<Posted> {
  const position = await ledgerPosition(sb, payment);
  const held: Held = {
    unreleasedNetCents: p.by === "door_money" ? p.unreleasedNetCents : position.unreleasedNetCents,
    unearnedFeeCents: position.unearnedFeeCents,
  };
  return postLedgerEvents(sb, payment, [
    { eventKey: `refund_${p.totalRefundedCents}`, entries: refundEntries(p.refundCents, held, p.by), stripeObjectId: p.stripeObjectId, occurredAt: p.occurredAt },
  ]);
}
