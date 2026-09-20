/*
  Webhook events: what gets written down, and what gets answered.

  The bug this piece exists to fix is in `storeAndClaim`. The old route read any failed insert as
  "already handled" and answered Stripe 200. A unique violation is that; a database timeout is not,
  and Stripe, having been told the event was delivered, never sends it again. The money it
  described would then be known only to Stripe. The first test here is that one.

  The database is a small in-memory stand-in that honours the filters these functions use. The
  routing tests pass a database that throws if anything touches it, which is how they prove an
  "ignored" decision is made before any read, not after one.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import type Stripe from "stripe";
import { MAX_ATTEMPTS } from "@/lib/outbox";
import { applyStripeEvent, deferEvent, settleEvent, storeAndClaim, STALL_MINUTES } from "@/lib/stripeEvents";

type Row = Record<string, unknown>;
type InsertFailure = { code?: string; message: string };

/** Enough of the query builder for src/lib/stripeEvents.ts against one table. */
function fakeEvents(rows: Row[], insertError?: InsertFailure) {
  const from = () => {
    const tests: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const matching = () => rows.filter((r) => tests.every((t) => t(r)));
    const apply = () => {
      const hit = matching();
      if (patch) for (const r of hit) Object.assign(r, patch);
      return hit;
    };
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => (tests.push((r) => r[col] === v), q),
      in: (col: string, vs: unknown[]) => (tests.push((r) => vs.includes(r[col])), q),
      lt: (col: string, v: string) => (tests.push((r) => String(r[col]) < v), q),
      lte: (col: string, v: string) => (tests.push((r) => String(r[col]) <= v), q),
      order: () => q,
      limit: () => q,
      update: (p: Row) => ((patch = p), q),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      insert: async (r: Row) => {
        if (insertError) return { error: insertError };
        rows.push({ ...r });
        return { error: null };
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: apply(), error: null }).then(resolve),
    };
    return q;
  };
  return { from } as never;
}

/** A database that must not be touched. Any access is the failure the test is looking for. */
const untouchable = new Proxy({} as Record<string, unknown>, {
  get() {
    throw new Error("the database was read while deciding to ignore an event");
  },
}) as never;

const event = (type: string, object: Record<string, unknown> = {}, id = "evt_1") =>
  ({ id, type, api_version: "2014-03-13", data: { object } }) as unknown as Stripe.Event;

const NOW = new Date("2026-09-20T12:00:00Z");
const minutesBefore = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

/* ---------------------------------------------------------------------------------------------
   The bug.
   --------------------------------------------------------------------------------------------- */

test("an insert that fails for any reason but a duplicate key is an error, never a duplicate", async () => {
  // A statement timeout. Stripe must be asked for this event again, so the answer cannot be 200.
  const rows: Row[] = [];
  const r = await storeAndClaim(fakeEvents(rows, { code: "57014", message: "canceling statement due to statement timeout" }), event("charge.refunded"), NOW);
  assert.equal(r.outcome, "error");
  assert.match(r.outcome === "error" ? r.reason : "", /timeout/);
  assert.equal(rows.length, 0);
});

test("a connection failure with no code at all is still an error, not a duplicate", async () => {
  const r = await storeAndClaim(fakeEvents([], { message: "fetch failed" }), event("charge.refunded"), NOW);
  assert.equal(r.outcome, "error");
});

test("a duplicate key on an event already settled is the only real duplicate", async () => {
  for (const status of ["processed", "ignored"]) {
    const rows: Row[] = [{ id: "evt_1", status, attempts: 1, updated_at: minutesBefore(1) }];
    const r = await storeAndClaim(fakeEvents(rows, { code: "23505", message: "duplicate key" }), event("charge.refunded"), NOW);
    assert.equal(r.outcome, "duplicate", `${status} should answer duplicate`);
    assert.equal(rows[0].status, status, `${status} should not be disturbed`);
  }
});

/* ---------------------------------------------------------------------------------------------
   Claiming.
   --------------------------------------------------------------------------------------------- */

test("a redelivery of an event whose last attempt failed claims it and counts the attempt", async () => {
  const rows: Row[] = [{ id: "evt_1", status: "retryable", attempts: 2, updated_at: minutesBefore(60), settled_at: null }];
  const r = await storeAndClaim(fakeEvents(rows, { code: "23505", message: "duplicate key" }), event("charge.refunded"), NOW);
  assert.deepEqual(r, { outcome: "claimed", attempts: 3 });
  assert.equal(rows[0].status, "processing");
  assert.equal(rows[0].attempts, 3);
});

test("an event out of attempts is still claimed when Stripe delivers it again", async () => {
  // A fresh delivery is new information. Refusing to try would leave the row stopped for good.
  const rows: Row[] = [{ id: "evt_1", status: "failed", attempts: MAX_ATTEMPTS, updated_at: minutesBefore(600), settled_at: minutesBefore(600) }];
  const r = await storeAndClaim(fakeEvents(rows, { code: "23505", message: "duplicate key" }), event("charge.refunded"), NOW);
  assert.equal(r.outcome, "claimed");
  assert.equal(rows[0].status, "processing");
  assert.equal(rows[0].settled_at, null, "claiming a settled row unsettles it");
});

test("an event another delivery is running right now is left alone", async () => {
  const rows: Row[] = [{ id: "evt_1", status: "processing", attempts: 1, updated_at: minutesBefore(1) }];
  const r = await storeAndClaim(fakeEvents(rows, { code: "23505", message: "duplicate key" }), event("charge.refunded"), NOW);
  assert.equal(r.outcome, "duplicate");
  assert.equal(rows[0].attempts, 1, "the attempt count is not touched by a delivery that did nothing");
});

test("an event a dead worker left in flight is taken back once it has stalled", async () => {
  const rows: Row[] = [{ id: "evt_1", status: "processing", attempts: 1, updated_at: minutesBefore(STALL_MINUTES + 1) }];
  const r = await storeAndClaim(fakeEvents(rows, { code: "23505", message: "duplicate key" }), event("charge.refunded"), NOW);
  assert.equal(r.outcome, "claimed");
});

test("a first delivery stores the payload and the shape it arrived in", async () => {
  const rows: Row[] = [];
  const r = await storeAndClaim(fakeEvents(rows), event("charge.refunded"), NOW);
  assert.deepEqual(r, { outcome: "claimed", attempts: 1 });
  assert.equal(rows[0].status, "processing");
  assert.equal(rows[0].api_version, "2014-03-13");
  assert.equal((rows[0].payload as Stripe.Event).id, "evt_1");
});

/* ---------------------------------------------------------------------------------------------
   Settling.
   --------------------------------------------------------------------------------------------- */

test("an attempt that fails comes back, until it has had its six", async () => {
  const rows: Row[] = [{ id: "evt_1", status: "processing", attempts: 1 }];
  const db = fakeEvents(rows);
  await deferEvent(db, "evt_1", 1, "purchase not found", NOW);
  assert.equal(rows[0].status, "retryable");
  assert.equal(rows[0].settled_at, null, "a row that will be tried again is not settled");
  assert.equal(rows[0].last_error, "purchase not found");

  await deferEvent(db, "evt_1", MAX_ATTEMPTS, "purchase not found", NOW);
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].settled_at, NOW.toISOString(), "a row that has stopped says when it stopped");
});

test("a long error is cut to something a column and a person can hold", async () => {
  const rows: Row[] = [{ id: "evt_1", status: "processing", attempts: 1 }];
  await deferEvent(fakeEvents(rows), "evt_1", 1, "x".repeat(900), NOW);
  assert.equal((rows[0].last_error as string).length, 500);
});

test("settling clears the last error, so a row that worked does not still read as broken", async () => {
  const rows: Row[] = [{ id: "evt_1", status: "processing", attempts: 2, last_error: "an earlier attempt failed" }];
  await settleEvent(fakeEvents(rows), "evt_1", "processed", NOW);
  assert.equal(rows[0].status, "processed");
  assert.equal(rows[0].last_error, null);
  assert.equal(rows[0].settled_at, NOW.toISOString());
});

/* ---------------------------------------------------------------------------------------------
   Deciding to do nothing, which is a decision and is written down as one.
   --------------------------------------------------------------------------------------------- */

test("an event type this system does not act on is ignored without reading anything", async () => {
  // The endpoint is subscribed to eighteen types and acts on nine. The other nine land here.
  for (const type of ["payout.created", "external_account.created", "charge.dispute.created", "transfer.reversed"]) {
    assert.equal(await applyStripeEvent(untouchable, event(type)), "ignored", type);
  }
});

test("a checkout that belongs to another integration on the same account is ignored", async () => {
  const session = { payment_status: "paid", metadata: { kind: "something-else" } };
  assert.equal(await applyStripeEvent(untouchable, event("checkout.session.completed", session)), "ignored");
  assert.equal(await applyStripeEvent(untouchable, event("checkout.session.expired", session)), "ignored");
});

test("a checkout that has not been paid for yet is ignored, because the money is not real", async () => {
  // With a delayed payment method `completed` arrives unpaid and async_payment_succeeded follows.
  const session = { payment_status: "unpaid", metadata: { kind: "lot" } };
  assert.equal(await applyStripeEvent(untouchable, event("checkout.session.completed", session)), "ignored");
});

test("a payment intent that is not a fan backing is ignored, because the session already fulfilled it", async () => {
  const pi = { metadata: { kind: "lot" } };
  assert.equal(await applyStripeEvent(untouchable, event("payment_intent.succeeded", pi)), "ignored");
  assert.equal(await applyStripeEvent(untouchable, event("payment_intent.canceled", pi)), "ignored");
});

test("a transfer Door Money did not schedule is ignored", async () => {
  assert.equal(await applyStripeEvent(untouchable, event("transfer.created", { id: "tr_1", metadata: {} })), "ignored");
});
