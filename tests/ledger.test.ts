/*
  The books (src/lib/ledger.ts): what each money event posts, that every event balances, that the
  fee is earned in step with release and never twice, and that a write is written once whatever
  order the two paths that can write it arrive in.

  The arithmetic is tested as arithmetic. The writers run against a stand-in that keeps the rows
  and refuses a duplicate (payment, event, account) the way migration 0055's unique index does.
  Nothing talks to Postgres or Stripe.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chargeDetails,
  chargeEntries,
  earnedFeeAfter,
  eventBalance,
  ledgerPosition,
  postLedgerEvents,
  recordCharge,
  recordRefund,
  recordTransfer,
  refundEntries,
  releaseEntries,
  stripeFeeEntries,
  transferEntries,
  type Entry,
} from "@/lib/ledger";
import { feeCents } from "@/lib/money";
import { refundDue } from "@/lib/refunds";

const sponsorship = { amountCents: 10000, feeCents: 1500 };

const balanced = (entries: Entry[], label: string) => assert.equal(eventBalance(entries), 0, `${label} does not balance`);

// ---------------------------------------------------------------
// The entries
// ---------------------------------------------------------------

test("a charge puts the money on the balance, owed to the organizer less a fee not yet earned", () => {
  const entries = chargeEntries(sponsorship);
  balanced(entries, "charge");
  assert.deepEqual(entries.map((e) => [e.account_key, e.amount_cents]), [
    ["platform_cash", 10000],
    ["organizer_liability", -8500],
    ["unearned_fee", -1500],
  ]);
});

test("Stripe's fee, a transfer and a release each balance and touch the accounts 0055 names", () => {
  balanced(stripeFeeEntries(320), "stripe fee");
  assert.deepEqual(stripeFeeEntries(320).map((e) => e.account_key), ["stripe_fee", "platform_cash"]);
  balanced(transferEntries(1700), "transfer");
  assert.deepEqual(transferEntries(1700).map((e) => e.account_key), ["organizer_liability", "platform_cash"]);
  balanced(releaseEntries(300), "release");
  assert.deepEqual(releaseEntries(300).map((e) => e.account_key), ["unearned_fee", "platform_fee"]);
});

// ---------------------------------------------------------------
// Rule 1: the fee is earned as the money releases
// ---------------------------------------------------------------

test("the fee is earned in proportion to the net released, and lands exactly on the fee at the end", () => {
  assert.equal(earnedFeeAfter(sponsorship, 0), 0);
  assert.equal(earnedFeeAfter(sponsorship, 1700), 300);
  assert.equal(earnedFeeAfter(sponsorship, 8500), 1500);
  assert.equal(earnedFeeAfter(sponsorship, 9000), 1500, "released beyond the net earns no more than the fee");
  assert.equal(earnedFeeAfter(sponsorship, -5), 0);
});

test("rounding the running total, never the slice, means the slices' accruals sum to the fee for any split", () => {
  // Every net from $1 to $500, split over every count of Fridays a fundraiser could plausibly have.
  for (let amount = 100; amount <= 50000; amount += 137) {
    const fee = feeCents(amount);
    const p = { amountCents: amount, feeCents: fee };
    const net = amount - fee;
    for (const slices of [1, 2, 3, 5, 7, 13]) {
      const base = Math.floor(net / slices);
      let released = 0;
      let earned = 0;
      for (let i = 0; i < slices; i += 1) {
        released += i === slices - 1 ? net - base * (slices - 1) : base;
        const now = earnedFeeAfter(p, released) - earned;
        assert.ok(now >= 0, `a release un-earned fee at ${amount} over ${slices}`);
        earned += now;
      }
      assert.equal(earned, fee, `the accruals for ${amount} over ${slices} slices sum to ${earned}, not the fee ${fee}`);
    }
  }
});

test("it is refundDue read the other way: what the patron gets back plus what Door Money earned is the charge", () => {
  for (const amount of [10000, 4500, 35000, 61000, 999]) {
    const fee = feeCents(amount);
    const p = { amountCents: amount, feeCents: fee };
    const net = amount - fee;
    for (const paid of [0, Math.floor(net / 5), Math.floor(net / 2), net]) {
      const back = refundDue({ amount_cents: amount, fee_cents: fee }, paid);
      const earned = earnedFeeAfter(p, paid);
      // Within the one rounding cent the refund arithmetic allows itself, which rule 2 posts to revenue.
      assert.ok(Math.abs(back + paid + earned - amount) <= 1, `${amount}: back ${back} + paid ${paid} + earned ${earned}`);
    }
  }
});

// ---------------------------------------------------------------
// Rules 2 and 3: refunds
// ---------------------------------------------------------------

test("Door Money's own refund closes the payment's books, and the rounding cent goes to revenue", () => {
  // Nothing released: the whole amount goes back, and both liabilities clear exactly.
  const full = refundEntries(10000, { unreleasedNetCents: 8500, unearnedFeeCents: 1500 }, "door_money");
  balanced(full, "full refund");
  assert.deepEqual(full.map((e) => [e.account_key, e.amount_cents]), [
    ["platform_cash", -10000],
    ["organizer_liability", 8500],
    ["unearned_fee", 1500],
  ]);

  // Two of five Fridays paid on a $100 sponsorship: refundDue says $60, the books hold $51 + $9.
  const partial = refundEntries(6000, { unreleasedNetCents: 5100, unearnedFeeCents: 900 }, "door_money");
  balanced(partial, "partial refund");
  assert.equal(partial.some((e) => e.account_key === "platform_fee"), false, "no residue when the arithmetic agrees");

  // A cent apart: the books hold one cent less than refundDue gives back, and revenue gives it up.
  const cent = refundEntries(6001, { unreleasedNetCents: 5100, unearnedFeeCents: 900 }, "door_money");
  balanced(cent, "refund a cent over");
  assert.deepEqual(cent.find((e) => e.account_key === "platform_fee"), { account_key: "platform_fee", amount_cents: 1 });
  const under = refundEntries(5999, { unreleasedNetCents: 5100, unearnedFeeCents: 900 }, "door_money");
  balanced(under, "refund a cent under");
  assert.deepEqual(under.find((e) => e.account_key === "platform_fee"), { account_key: "platform_fee", amount_cents: -1 });
});

test("a hand refund of less than what was held is split in proportion, never into a receivable", () => {
  const entries = refundEntries(3000, { unreleasedNetCents: 5100, unearnedFeeCents: 900 }, "hand");
  balanced(entries, "partial hand refund");
  assert.deepEqual(entries.map((e) => [e.account_key, e.amount_cents]), [
    ["platform_cash", -3000],
    ["organizer_liability", 2550],
    ["unearned_fee", 450],
  ]);
});

test("a hand refund beyond what was held is money the organizer already has: a receivable, not lost revenue", () => {
  // Every slice paid, the fee fully earned, and a person refunds the whole $100 in the Dashboard.
  const entries = refundEntries(10000, { unreleasedNetCents: 0, unearnedFeeCents: 0 }, "hand");
  balanced(entries, "hand refund after release");
  assert.deepEqual(entries.map((e) => [e.account_key, e.amount_cents]), [
    ["platform_cash", -10000],
    ["organizer_receivable", 10000],
  ]);

  // Within a cent of what was held is rounding, the same as Door Money's own.
  const cent = refundEntries(6001, { unreleasedNetCents: 5100, unearnedFeeCents: 900 }, "hand");
  balanced(cent, "hand refund a cent over");
  assert.equal(cent.some((e) => e.account_key === "organizer_receivable"), false);
  assert.deepEqual(cent.find((e) => e.account_key === "platform_fee"), { account_key: "platform_fee", amount_cents: 1 });
});

// ---------------------------------------------------------------
// Reading a charge off Stripe
// ---------------------------------------------------------------

test("a charge id alone is a charge with no fee yet; an expanded charge carries when and what Stripe took", () => {
  assert.deepEqual(chargeDetails(null), { chargeId: null, occurredAt: null, stripeFee: null });
  assert.deepEqual(chargeDetails({ latest_charge: "ch_1" } as never), { chargeId: "ch_1", occurredAt: null, stripeFee: null });
  const expanded = { latest_charge: { id: "ch_2", created: 1_700_000_000, balance_transaction: { id: "txn_9", fee: 320 } } } as never;
  assert.deepEqual(chargeDetails(expanded), { chargeId: "ch_2", occurredAt: new Date(1_700_000_000_000), stripeFee: { cents: 320, balanceTransactionId: "txn_9" } });
  const unexpanded = { latest_charge: { id: "ch_3", created: 1_700_000_000, balance_transaction: "txn_10" } } as never;
  assert.equal(chargeDetails(unexpanded).stripeFee, null, "a balance transaction Stripe has not expanded is not a fee");
});

// ---------------------------------------------------------------
// Writing
// ---------------------------------------------------------------

type Row = { purchase_id?: string; backing_id?: string; account_key: string; amount_cents: number; event_key: string; stripe_object_id: string | null; occurred_at?: string };

/** ledger_entries as far as the writers need it: keeps rows, refuses a duplicate key, answers a read. */
function books() {
  const rows: Row[] = [];
  let inserts = 0;
  const sb = {
    from(table: string) {
      assert.equal(table, "ledger_entries", `the ledger writer touched ${table}`);
      const filters: Record<string, unknown> = {};
      const q = {
        insert: (batch: Row[]) => ({
          then<T>(resolve: (v: { error: { code: string; message: string } | null }) => T) {
            inserts += 1;
            const key = (r: Row) => `${r.purchase_id ?? ""}|${r.backing_id ?? ""}|${r.event_key}|${r.account_key}`;
            const seen = new Set(rows.map(key));
            if (batch.some((r) => seen.has(key(r)))) return Promise.resolve({ error: { code: "23505", message: "duplicate key value violates unique constraint" } }).then(resolve);
            const off = new Map<string, number>();
            for (const r of batch) off.set(r.event_key, (off.get(r.event_key) ?? 0) + r.amount_cents);
            for (const [k, v] of off) if (v !== 0) return Promise.resolve({ error: { code: "23514", message: `ledger event ${k} does not balance` } }).then(resolve);
            rows.push(...batch);
            return Promise.resolve({ error: null }).then(resolve);
          },
        }),
        select: () => q,
        eq(k: string, v: unknown) {
          filters[k] = v;
          return q;
        },
        then<T>(resolve: (v: { data: Row[]; error: null }) => T) {
          return Promise.resolve({ data: rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v)), error: null }).then(resolve);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { sb, rows, inserts: () => inserts };
}

const P = { purchaseId: "p1" };
const byKey = (rows: Row[], key: string) => rows.filter((r) => r.event_key === key).map((r) => [r.account_key, r.amount_cents]);

test("a charge is written once, with the fee beside it, and a second delivery finds it on the books", async () => {
  const { sb, rows } = books();
  const charge = { chargeId: "ch_1", occurredAt: new Date("2026-10-02T12:00:00Z"), stripeFee: { cents: 320, balanceTransactionId: "txn_1" } };
  assert.equal(await recordCharge(sb, P, { ...sponsorship, ...charge }), "written");
  assert.deepEqual(byKey(rows, "charge"), [["platform_cash", 10000], ["organizer_liability", -8500], ["unearned_fee", -1500]]);
  assert.deepEqual(byKey(rows, "stripe_fee"), [["stripe_fee", 320], ["platform_cash", -320]]);
  assert.ok(rows.every((r) => r.purchase_id === "p1" && r.occurred_at === "2026-10-02T12:00:00.000Z"));
  assert.equal(rows.find((r) => r.event_key === "charge")?.stripe_object_id, "ch_1");
  assert.equal(rows.find((r) => r.event_key === "stripe_fee")?.stripe_object_id, "txn_1");

  assert.equal(await recordCharge(sb, P, { ...sponsorship, ...charge }), "already");
  assert.equal(rows.length, 5, "nothing was doubled");
});

test("a charge recorded before Stripe had stated its fee gets the fee on a later pass, without a second charge", async () => {
  const { sb, rows } = books();
  assert.equal(await recordCharge(sb, P, { ...sponsorship, chargeId: "ch_1", occurredAt: null, stripeFee: null }), "written");
  assert.equal(rows.length, 3);
  assert.equal(await recordCharge(sb, P, { ...sponsorship, chargeId: "ch_1", occurredAt: null, stripeFee: { cents: 320, balanceTransactionId: "txn_1" } }), "already");
  assert.deepEqual(byKey(rows, "stripe_fee"), [["stripe_fee", 320], ["platform_cash", -320]]);
  assert.equal(rows.length, 5);
});

test("five Fridays: each transfer earns its share of the fee, the books close, and a slice cannot be written twice", async () => {
  const { sb, rows } = books();
  await recordCharge(sb, P, { ...sponsorship, chargeId: "ch_1", occurredAt: null, stripeFee: null });
  const slices = [1700, 1700, 1700, 1700, 1700];
  for (const [i, sliceCents] of slices.entries()) {
    const r = await recordTransfer(sb, P, { payoutId: `po${i}`, sliceCents, transferId: `tr_${i}`, occurredAt: null, ...sponsorship });
    assert.equal(r, "written");
    assert.deepEqual(byKey(rows, `release_po${i}`), [["unearned_fee", 300], ["platform_fee", -300]]);
  }
  const position = await ledgerPosition(sb, P);
  assert.deepEqual(position, { releasedNetCents: 8500, earnedFeeCents: 1500, unreleasedNetCents: 0, unearnedFeeCents: 0, charged: true });

  // The job and the webhook both name the slice by its row: the second writer finds it.
  assert.equal(await recordTransfer(sb, P, { payoutId: "po2", sliceCents: 1700, transferId: "tr_2", occurredAt: null, ...sponsorship }), "already");
  assert.equal(rows.filter((r) => r.event_key === "transfer_po2").length, 2);
});

test("a transfer written late or out of order accrues exactly its share, and the total follows what the books say was released", async () => {
  const { sb, rows } = books();
  await recordCharge(sb, P, { ...sponsorship, chargeId: "ch_1", occurredAt: null, stripeFee: null });
  // The first slice's transfer was never written on the day (the job died, and the webhook for it
  // is still in the queue). The next two land on time.
  await recordTransfer(sb, P, { payoutId: "po1", sliceCents: 1700, transferId: "tr_1", occurredAt: null, ...sponsorship });
  await recordTransfer(sb, P, { payoutId: "po2", sliceCents: 1700, transferId: "tr_2", occurredAt: null, ...sponsorship });
  assert.equal((await ledgerPosition(sb, P)).earnedFeeCents, earnedFeeAfter(sponsorship, 3400), "earned on what the books say was released");
  // Then the missing one arrives, from the webhook worker: it accrues its own share and no more.
  const late = await recordTransfer(sb, P, { payoutId: "po0", sliceCents: 1700, transferId: "tr_0", occurredAt: null, ...sponsorship });
  assert.equal(late, "written");
  assert.deepEqual(byKey(rows, "transfer_po0"), [["organizer_liability", 1700], ["platform_cash", -1700]]);
  assert.deepEqual(byKey(rows, "release_po0"), [["unearned_fee", 300], ["platform_fee", -300]]);
  assert.equal((await ledgerPosition(sb, P)).earnedFeeCents, earnedFeeAfter(sponsorship, 5100));
  // Whatever the order, the last slice lands the fee exactly on fee_cents.
  await recordTransfer(sb, P, { payoutId: "po3", sliceCents: 1700, transferId: "tr_3", occurredAt: null, ...sponsorship });
  await recordTransfer(sb, P, { payoutId: "po4", sliceCents: 1700, transferId: "tr_4", occurredAt: null, ...sponsorship });
  assert.equal((await ledgerPosition(sb, P)).earnedFeeCents, 1500);
});

test("Door Money's refund after two Fridays gives back what the books hold, and the same refund reported by Stripe is not written again", async () => {
  const { sb, rows } = books();
  await recordCharge(sb, P, { ...sponsorship, chargeId: "ch_1", occurredAt: null, stripeFee: null });
  await recordTransfer(sb, P, { payoutId: "po1", sliceCents: 1700, transferId: "tr_1", occurredAt: null, ...sponsorship });
  await recordTransfer(sb, P, { payoutId: "po2", sliceCents: 1700, transferId: "tr_2", occurredAt: null, ...sponsorship });

  const back = refundDue({ amount_cents: 10000, fee_cents: 1500 }, 3400);
  assert.equal(back, 6000);
  const ours = await recordRefund(sb, P, { by: "door_money", refundCents: back, totalRefundedCents: back, unreleasedNetCents: 5100, stripeObjectId: "re_1", occurredAt: null });
  assert.equal(ours, "written");
  assert.deepEqual(byKey(rows, "refund_6000"), [["platform_cash", -6000], ["organizer_liability", 5100], ["unearned_fee", 900]]);
  const position = await ledgerPosition(sb, P);
  assert.equal(position.unreleasedNetCents, 0, "nothing is owed to the organizer any more");
  assert.equal(position.unearnedFeeCents, 0, "and no fee is left unearned");
  assert.equal(position.earnedFeeCents, 600, "Door Money kept 15% of the $40 that was retained");

  // charge.refunded for the same refund, arriving after: the running total names the same event.
  const theirs = await recordRefund(sb, P, { by: "hand", refundCents: 6000, totalRefundedCents: 6000, stripeObjectId: "ch_1", occurredAt: null });
  assert.equal(theirs, "already");
  assert.equal(rows.filter((r) => r.event_key === "refund_6000").length, 3);
});

test("a Dashboard refund of everything after every slice went out is a receivable from the organizer", async () => {
  const { sb, rows } = books();
  await recordCharge(sb, P, { ...sponsorship, chargeId: "ch_1", occurredAt: null, stripeFee: null });
  for (let i = 0; i < 5; i += 1) await recordTransfer(sb, P, { payoutId: `po${i}`, sliceCents: 1700, transferId: `tr_${i}`, occurredAt: null, ...sponsorship });
  await recordRefund(sb, P, { by: "hand", refundCents: 10000, totalRefundedCents: 10000, stripeObjectId: "ch_1", occurredAt: null });
  assert.deepEqual(byKey(rows, "refund_10000"), [["platform_cash", -10000], ["organizer_receivable", 10000]]);
});

test("an event that does not balance is refused before the database is asked, by name", async () => {
  const { sb, inserts } = books();
  await assert.rejects(
    postLedgerEvents(sb, P, [{ eventKey: "lopsided", entries: [{ account_key: "platform_cash", amount_cents: 100 }, { account_key: "unearned_fee", amount_cents: -99 }] }]),
    /ledger event lopsided does not balance: off by 1 cents/,
  );
  assert.equal(inserts(), 0);
  assert.equal(await postLedgerEvents(sb, P, [{ eventKey: "empty", entries: [{ account_key: "platform_cash", amount_cents: 0 }] }]), "nothing");
  assert.equal(inserts(), 0, "an event for no money is not written");
});

test("a backing's entries belong to the backing, and the books for one payment never read another's", async () => {
  const { sb, rows } = books();
  await recordCharge(sb, { backingId: "b1" }, { amountCents: 2500, feeCents: 375, chargeId: "ch_b", occurredAt: null, stripeFee: null });
  await recordCharge(sb, P, { ...sponsorship, chargeId: "ch_1", occurredAt: null, stripeFee: null });
  assert.ok(rows.filter((r) => r.backing_id === "b1").every((r) => r.purchase_id === undefined));
  assert.deepEqual(await ledgerPosition(sb, { backingId: "b1" }), { releasedNetCents: 0, earnedFeeCents: 0, unreleasedNetCents: 2125, unearnedFeeCents: 375, charged: true });
  assert.deepEqual(await ledgerPosition(sb, { backingId: "b2" }), { releasedNetCents: 0, earnedFeeCents: 0, unreleasedNetCents: 0, unearnedFeeCents: 0, charged: false });
});
