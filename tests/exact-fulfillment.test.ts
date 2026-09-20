/*
  What a webhook does to two fundraisers under one organizer.

  The real src/lib/backings.ts and src/lib/purchases.ts run here, not mocks of them, against a small
  stand-in database that records every write. tests/stripe-events.test.ts mocks both files to test
  the router; this file is the other half, where the state actually changes.

  Gutter Hymns has "Fall run" (A) and "Winter residency" (B) open together. Same organizer id, same
  address, same Stripe account, so none of those can stop a payment for A settling a row on B. The
  row decides where money goes (its own run_id), and the payment's metadata has to agree.

  Nothing talks to Postgres or Stripe. Emails are real and send nothing without RESEND_API_KEY.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mock, test } from "node:test";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const ACT = { id: "ac000000-0000-4000-8000-000000000001", name: "Gutter Hymns", slug: "gutter-hymns", owner_id: null };
const run = (id: string, slug: string, title: string) => ({ id, slug, title, starts_on: "2026-10-02", ends_on: "2026-10-30", act_id: ACT.id, acts: ACT });
const RUN_A = run(A, "fall-run", "Fall run");
const RUN_B = run(B, "winter-residency", "Winter residency");

const BACKING_A = "ba000000-0000-4000-8000-00000000000a";
const BACKING_B = "ba000000-0000-4000-8000-00000000000b";
const PURCHASE_A = "9a000000-0000-4000-8000-00000000000a";
const PURCHASE_B = "9b000000-0000-4000-8000-00000000000b";
const LOT_A = "10000000-0000-4000-8000-00000000000a";
const LOT_B = "10000000-0000-4000-8000-00000000000b";

type Row = Record<string, unknown> & { id: string; payment_status: string };
let backings: Row[] = [];
let purchases: Row[] = [];
let schedule: Record<string, unknown>[] = [];
let writes: { table: string; verb: string; payload?: unknown; filters: Record<string, unknown> }[] = [];
let rpcs: { fn: string; args: Record<string, unknown> }[] = [];

const reset = () => {
  backings = [
    { id: BACKING_A, run_id: A, amount_cents: 2500, fee_cents: 375, payment_status: "requires_payment", tier: "thank_you", display_name: "Dana", patrons: { name: "Dana", contact_email: "dana@example.com" }, runs: RUN_A },
    { id: BACKING_B, run_id: B, amount_cents: 10000, fee_cents: 1500, payment_status: "requires_payment", tier: "merch_card", display_name: "Sam", patrons: { name: "Sam", contact_email: "sam@example.com" }, runs: RUN_B },
  ];
  const lot = (id: string, r: typeof RUN_A) => ({ id, label: null, surface_key: "kick_head", mode: "fixed", winner_bid_id: null, buy_now_cents: null, run_id: r.id, runs: r });
  purchases = [
    { id: PURCHASE_A, amount_cents: 120000, fee_cents: 18000, payment_status: "requires_payment", lot_id: LOT_A, bid_id: null, patrons: { name: "Kettle St. Coffee", contact_email: "owner@kettle.example" }, lots: lot(LOT_A, RUN_A) },
    { id: PURCHASE_B, amount_cents: 45000, fee_cents: 6750, payment_status: "requires_payment", lot_id: LOT_B, bid_id: null, patrons: { name: "Ridgewood Wine Co.", contact_email: "hello@ridgewood.example" }, lots: lot(LOT_B, RUN_B) },
  ];
  schedule = []; writes = []; rpcs = [];
};

function from(table: string) {
  const s: { verb: string; payload?: unknown; filters: Record<string, unknown> } = { verb: "select", filters: {} };
  const source = () => (table === "backings" ? backings : table === "purchases" ? purchases : []);
  const matching = () => source().filter((r) => Object.entries(s.filters).every(([k, v]) => r[k] === v));
  const settle = () => {
    if (table === "payout_schedule") {
      if (s.verb === "insert") { schedule.push(...(s.payload as Record<string, unknown>[])); writes.push({ table, verb: "insert", payload: s.payload, filters: {} }); return { data: null, error: null, count: null }; }
      return { data: null, error: null, count: schedule.filter((r) => Object.entries(s.filters).every(([k, v]) => r[k] === v)).length };
    }
    if (s.verb === "select") return { data: matching(), error: null };
    const hit = matching();
    writes.push({ table, verb: s.verb, payload: s.payload, filters: s.filters });
    if (s.verb === "update") for (const r of hit) Object.assign(r, s.payload);
    if (s.verb === "delete") for (const r of hit) source().splice(source().indexOf(r), 1);
    return { data: hit.map((r) => ({ id: r.id })), error: null };
  };
  const b = {
    select() { return b; },
    insert(payload: unknown) { s.verb = "insert"; s.payload = payload; return b; },
    update(payload: unknown) { s.verb = "update"; s.payload = payload; return b; },
    delete() { s.verb = "delete"; return b; },
    eq(k: string, v: unknown) { s.filters[k] = v; return b; },
    in() { return b; },
    is() { return b; },
    order() { return b; },
    maybeSingle: async () => { const r = settle(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: null }; },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(settle()).then(resolve, reject); },
  };
  return b;
}

/** fulfil_lot_purchase (migration 0035), as far as this file needs it: holds once, then says "already". */
const sb = {
  from,
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcs.push({ fn, args });
    const p = purchases.find((r) => r.id === args.p_purchase_id);
    if (!p) return { data: "missing", error: null };
    if (p.payment_status !== "requires_payment") return { data: "already", error: null };
    p.payment_status = "held";
    return { data: "sold", error: null };
  },
} as unknown as SupabaseClient;

const { stripe } = await import("@/lib/stripe");
mock.method(stripe.paymentIntents, "retrieve", async (id: string) => ({ id, latest_charge: `ch_${id}` }));
mock.method(console, "error", () => {}); // unsent email, on purpose: there is no RESEND_API_KEY here

const { fulfilBacking, dropBacking } = await import("@/lib/backings");
const { fulfilLotPurchase, holdPurchase, releaseLot } = await import("@/lib/purchases");
const { applyStripeEvent } = await import("@/lib/stripeEvents");

const intent = (backingId: string, runId: string | undefined, id = "pi_1") =>
  ({ id, amount: 2500, latest_charge: `ch_${id}`, receipt_email: null, metadata: { kind: "backing", backing_id: backingId, ...(runId ? { run_id: runId } : {}), act_id: ACT.id, act_slug: ACT.slug, tier: "thank_you" } }) as unknown as Stripe.PaymentIntent;
const session = (purchaseId: string, lotId: string, runId: string | undefined, id = "cs_1") =>
  ({ id, payment_intent: `pi_${id}`, payment_status: "paid", customer_details: { email: null }, metadata: { kind: "lot", purchase_id: purchaseId, lot_id: lotId, ...(runId ? { run_id: runId } : {}), act_id: ACT.id, act_slug: ACT.slug } }) as unknown as Stripe.Checkout.Session;
const status = (rows: Row[], id: string) => rows.find((r) => r.id === id)?.payment_status;

// ---------------------------------------------------------------
// Backings
// ---------------------------------------------------------------

test("a backing paid for A is held on A, scheduled for A's dates, and B is untouched", async () => {
  reset();
  const r = await fulfilBacking(sb, intent(BACKING_A, A));
  assert.deepEqual(r, { ok: true, already: false });
  assert.equal(status(backings, BACKING_A), "held");
  assert.equal(status(backings, BACKING_B), "requires_payment");
  assert.ok(schedule.length > 0 && schedule.every((s) => s.backing_id === BACKING_A));
  assert.equal(schedule.reduce((n, s) => n + (s.amount_cents as number), 0), 2500 - 375, "the organizer's share is the amount less the fifteen percent, as before");
});

test("payment A cannot fulfil fundraiser B: a payment naming A never settles B's backing", async () => {
  reset();
  const r = await fulfilBacking(sb, intent(BACKING_B, A));
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /fundraiser mismatch/);
  assert.equal(status(backings, BACKING_B), "requires_payment", "B was not marked paid");
  assert.deepEqual(writes, [], "nothing was written at all");
  assert.deepEqual(schedule, [], "and no payout was scheduled");
});

test("the webhook fails that event out loud, so it is retried and then seen, never quietly dropped", async () => {
  reset();
  const event = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "payment_intent.succeeded.json"), "utf8")) as Stripe.Event;
  (event.data.object as Stripe.PaymentIntent).metadata = { kind: "backing", backing_id: BACKING_B, run_id: A };
  await assert.rejects(applyStripeEvent(sb, event), /fulfil backing: fundraiser mismatch/);
  assert.deepEqual(writes, []);
});

test("a duplicate or retried delivery is safe: held once, scheduled once", async () => {
  reset();
  await fulfilBacking(sb, intent(BACKING_A, A));
  const slices = schedule.length;
  const held = writes.length;
  assert.deepEqual(await fulfilBacking(sb, intent(BACKING_A, A)), { ok: true, already: true });
  assert.deepEqual(await fulfilBacking(sb, intent(BACKING_A, A, "pi_retry")), { ok: true, already: true });
  assert.equal(schedule.length, slices, "no second schedule");
  assert.equal(writes.length, held, "and no second write");
});

test("a mismatched payment is refused even against a backing that is already paid", async () => {
  reset();
  await fulfilBacking(sb, intent(BACKING_B, B));
  // Without this, a payment for A pointed at B's settled row would answer "already", and read as done.
  const r = await fulfilBacking(sb, intent(BACKING_B, A, "pi_other"));
  assert.equal(r.ok, false);
});

test("an abandoned intent for A drops A's unpaid row only", async () => {
  reset();
  await dropBacking(sb, intent(BACKING_A, A));
  assert.equal(backings.some((b) => b.id === BACKING_A), false);
  assert.equal(backings.some((b) => b.id === BACKING_B), true);

  reset();
  await dropBacking(sb, intent(BACKING_B, A));
  assert.equal(backings.some((b) => b.id === BACKING_B), true, "an intent naming A never deletes a row on B");
});

// ---------------------------------------------------------------
// Sponsorships
// ---------------------------------------------------------------

test("a sponsorship paid for A is held on A, and B's lot is untouched", async () => {
  reset();
  const r = await fulfilLotPurchase(sb, session(PURCHASE_A, LOT_A, A));
  assert.equal(r.ok, true);
  assert.equal(status(purchases, PURCHASE_A), "held");
  assert.equal(status(purchases, PURCHASE_B), "requires_payment");
  assert.deepEqual(rpcs.map((c) => [c.fn, c.args.p_purchase_id]), [["fulfil_lot_purchase", PURCHASE_A]]);
  assert.ok(schedule.every((s) => s.purchase_id === PURCHASE_A));
  assert.equal(schedule.reduce((n, s) => n + (s.amount_cents as number), 0), 120000 - 18000);
});

test("payment A cannot fulfil fundraiser B: refused before the database is asked to hold anything", async () => {
  reset();
  const r = await fulfilLotPurchase(sb, session(PURCHASE_B, LOT_B, A));
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /fundraiser mismatch/);
  assert.deepEqual(rpcs, [], "fulfil_lot_purchase was never called");
  assert.equal(status(purchases, PURCHASE_B), "requires_payment");
  assert.deepEqual(schedule, []);
});

test("a session naming the right fundraiser and the wrong lot is refused too", async () => {
  reset();
  const r = await fulfilLotPurchase(sb, session(PURCHASE_A, LOT_B, A));
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /lot mismatch/);
  assert.deepEqual(rpcs, []);
});

test("the webhook fails a mismatched session out loud as well", async () => {
  reset();
  const event = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "checkout.session.completed.json"), "utf8")) as Stripe.Event;
  const s = event.data.object as Stripe.Checkout.Session;
  s.metadata = { kind: "lot", purchase_id: PURCHASE_B, lot_id: LOT_B, run_id: A };
  (s as { payment_status: string }).payment_status = "paid";
  await assert.rejects(applyStripeEvent(sb, event), /fulfil: fundraiser mismatch/);
  assert.deepEqual(rpcs, []);
});

test("a duplicate or retried session is safe: one hold, one schedule", async () => {
  reset();
  await fulfilLotPurchase(sb, session(PURCHASE_A, LOT_A, A));
  const slices = schedule.length;
  const again = await fulfilLotPurchase(sb, session(PURCHASE_A, LOT_A, A));
  assert.deepEqual(again, { ok: true, already: true });
  assert.equal(rpcs.length, 1, "the state change was asked for once");
  assert.equal(schedule.length, slices);
});

test("a checkout started before sessions carried run_id still settles, by its own row", async () => {
  reset();
  const r = await fulfilLotPurchase(sb, session(PURCHASE_A, LOT_A, undefined));
  assert.equal(r.ok, true);
  assert.equal(status(purchases, PURCHASE_A), "held");
  assert.equal(status(purchases, PURCHASE_B), "requires_payment");
});

test("a won bid charged off-session passes no metadata and settles as it always did", async () => {
  reset();
  const r = await holdPurchase(sb, { purchaseId: PURCHASE_A, paymentIntentId: "pi_bid" });
  assert.equal(r.ok, true);
  assert.equal(status(purchases, PURCHASE_A), "held");
});

test("an expired session for A never takes the hold off a lot on B", async () => {
  reset();
  const refused = await releaseLot(sb, session(PURCHASE_B, LOT_B, A));
  assert.equal(refused.ok, false);
  assert.equal(purchases.some((p) => p.id === PURCHASE_B), true, "B's purchase is still there");
  assert.deepEqual(writes, []);

  const released = await releaseLot(sb, session(PURCHASE_A, LOT_A, A));
  assert.deepEqual(released, { ok: true, already: false });
  assert.equal(purchases.some((p) => p.id === PURCHASE_A), false);
  assert.equal(purchases.some((p) => p.id === PURCHASE_B), true);
});

// ---------------------------------------------------------------
// Receipts and records
// ---------------------------------------------------------------

test("a record is resolved from the payment's own row, never from an organizer or a current fundraiser", () => {
  const page = readFileSync(path.join(import.meta.dirname, "..", "src/app/record/[id]/page.tsx"), "utf8");
  // The fundraiser on a record comes through the row's foreign keys: purchase to lot to run, or
  // backing to run. Both reads are by the record's own id.
  assert.match(page, /\.from\("purchases"\)[\s\S]{0,260}\.eq\("id", id\)/);
  assert.match(page, /from\("backings"\)[\s\S]{0,200}\.eq\("id", id\)/);
  assert.match(page, /\.eq\("run_id", p\.runs\.id\)/, "the shows on a record are that fundraiser's");
  assert.doesNotMatch(page, /act_slug|\.eq\("slug"|order\("starts_on"/, "nothing here picks a fundraiser by organizer or by recency");
});

test("the receipt links go to the fundraiser that was paid", async () => {
  // Both receipts build their fundraiser address from the row's own run, not from the payment's
  // organizer slug, so a receipt for A can only ever point at A.
  const backingsSource = readFileSync(path.join(import.meta.dirname, "..", "src/lib/backings.ts"), "utf8");
  const purchasesSource = readFileSync(path.join(import.meta.dirname, "..", "src/lib/purchases.ts"), "utf8");
  assert.match(backingsSource, /const boardUrl = runUrl\(act\.slug, run\.slug\)/);
  assert.match(purchasesSource, /const boardUrl = runUrl\(act\.slug, run\.slug\)/);
  assert.match(backingsSource, /recordUrl: `\$\{SITE\.url\}\/record\/\$\{b\.id\}`/);
  assert.match(purchasesSource, /recordUrl: `\$\{SITE\.url\}\/record\/\$\{p\.id\}`/);
});
