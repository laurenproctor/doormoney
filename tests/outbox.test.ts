/*
  The refund queue's arithmetic: the key that stops an obligation being written twice, and the
  schedule that decides when to try again and when to stop.

  The queue itself talks to Postgres and Stripe, so what is pinned here is the part that decides
  behaviour rather than the part that performs it. supabase/tests/permissions_test.sql holds the
  shape of the table under it, including that a settled row cannot also be waiting for a worker.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKOFF_MINUTES, MAX_ATTEMPTS, backoffMinutes, workRefundQueue } from "@/lib/outbox";
import { refundKey } from "@/lib/refunds";

test("the key names the payment and the reason, and nothing else", () => {
  // It is the Stripe idempotency key as well as the queue's unique key, so it must not carry a
  // timestamp, an attempt count or anything else that changes between tries.
  assert.equal(refundKey("abc", "run_cancelled"), "refund_abc_run_cancelled");
  assert.equal(refundKey("abc", "mark_declined"), "refund_abc_mark_declined");
  assert.equal(refundKey("abc", "run_cancelled"), refundKey("abc", "run_cancelled"));
});

test("one payment can owe a refund for each reason, and they do not collide", () => {
  assert.notEqual(refundKey("abc", "run_cancelled"), refundKey("abc", "mark_declined"));
});

test("the wait widens with every failed attempt", () => {
  const waits = Array.from({ length: BACKOFF_MINUTES.length }, (_, i) => backoffMinutes(i + 1));
  assert.deepEqual(waits, [...BACKOFF_MINUTES]);
  for (let i = 1; i < waits.length; i += 1) assert.ok(waits[i]! > waits[i - 1]!, `the wait shrank at attempt ${i + 1}`);
});

test("a refund gets six attempts, then stops and waits for a person", () => {
  for (let attempts = 1; attempts < MAX_ATTEMPTS; attempts += 1) {
    assert.notEqual(backoffMinutes(attempts), null, `attempt ${attempts} should have been retried`);
  }
  assert.equal(backoffMinutes(MAX_ATTEMPTS), null);
  assert.equal(backoffMinutes(MAX_ATTEMPTS + 50), null);
});

test("the attempts span about a day and a half, not minutes and not weeks", () => {
  // Long enough for a card network to come back, short enough that a patron is not waiting on a
  // queue nobody reads. Anything past this is Door Money's to look at, which is the point of stopping.
  const total = BACKOFF_MINUTES.reduce((n, m) => n + m, 0);
  assert.ok(total > 24 * 60, `the queue gives up after ${total} minutes, which is under a day`);
  assert.ok(total < 5 * 24 * 60, `the queue keeps trying for ${total} minutes, which is over five days`);
});

test("an empty list of keys works nothing, and never falls through to the whole queue", async () => {
  // cancelRun hands the worker the keys it queued, and a fundraiser with no money held queues none.
  // The daily pass asks for everything due by passing no list at all; an empty list must not be
  // read the same way, or one musician's cancel works, and reports, another musician's refunds.
  const untouchable = {
    from() {
      throw new Error("the queue was read");
    },
  } as unknown as Parameters<typeof workRefundQueue>[0];
  assert.deepEqual(await workRefundQueue(untouchable, []), { succeeded: 0, refundedCents: 0, retryable: 0, failed: 0 });
});

test("a first attempt never has a negative or missing wait behind it", () => {
  // attempts is always the count including the one that just failed, so it is never below one.
  // Zero is guarded anyway: a wait of undefined would schedule the retry for the epoch.
  for (const attempts of [0, 1]) {
    const wait = backoffMinutes(attempts);
    assert.ok(typeof wait === "number" && wait > 0, `attempt ${attempts} produced ${wait}`);
  }
});
