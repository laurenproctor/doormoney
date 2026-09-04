/*
  The arithmetic every payout rests on. These tests record what the code does today, including the
  parts later phases will change on purpose: the fee floors in the act's favour, and the weekly
  remainder is handed to the last Friday rather than spread across the run.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { bidStepCents, feeCents, weeklySlices } from "@/lib/money";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const sum = (slices: { amountCents: number }[]) => slices.reduce((n, s) => n + s.amountCents, 0);

test("the fee is 15% and always rounds down, so the act never loses a cent to rounding", () => {
  assert.equal(feeCents(10000), 1500);
  assert.equal(feeCents(0), 0);
  // 14.85 cents of fee becomes 14, not 15. The stray cent stays with the act.
  assert.equal(feeCents(99), 14);
  assert.equal(feeCents(1), 0);
  assert.equal(feeCents(100000000), 15000000);
});

test("the fee percent is a parameter, and 0% takes nothing", () => {
  assert.equal(feeCents(10000, 0), 0);
  assert.equal(feeCents(10000, 100), 10000);
  assert.equal(feeCents(10000, 10), 1000);
});

test("the act's net is always the larger half of a sale", () => {
  for (const amount of [1, 99, 100, 4999, 10000, 123456]) {
    const net = amount - feeCents(amount);
    assert.ok(net >= amount - Math.ceil(amount * 0.15), `net too small for ${amount}`);
    assert.ok(net <= amount, `net exceeds amount for ${amount}`);
  }
});

test("slices land on Fridays, from the first Friday on or after the start", () => {
  // 2026-09-01 is a Tuesday, so the first slice is Friday the 4th.
  const slices = weeklySlices(10000, day("2026-09-01"), day("2026-09-30"));
  assert.deepEqual(
    slices.map((s) => s.dueOn.toISOString().slice(0, 10)),
    ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"],
  );
  for (const s of slices) assert.equal(s.dueOn.getUTCDay(), 5, "every due date is a Friday in UTC");
});

test("a run that starts on a Friday pays that same Friday", () => {
  const slices = weeklySlices(10000, day("2026-09-04"), day("2026-09-04"));
  assert.equal(slices.length, 1);
  assert.equal(slices[0].dueOn.toISOString().slice(0, 10), "2026-09-04");
  assert.equal(slices[0].amountCents, 10000);
});

test("a total that does not divide evenly gives the remainder to the last Friday", () => {
  // Three Fridays, 10000 cents: 3333 each leaves 1 cent over.
  const slices = weeklySlices(10000, day("2026-09-01"), day("2026-09-20"));
  assert.deepEqual(slices.map((s) => s.amountCents), [3333, 3333, 3334]);
  assert.equal(sum(slices), 10000);
});

test("the slices always add back up to the amount, however the run falls", () => {
  const starts = ["2026-09-01", "2026-09-04", "2026-09-05", "2026-10-31"];
  const ends = ["2026-09-04", "2026-09-20", "2026-11-30", "2027-01-15"];
  for (const amount of [0, 1, 7, 999, 10000, 33333, 8675309]) {
    for (const s of starts) {
      for (const e of ends) {
        if (day(e) < day(s)) continue;
        const slices = weeklySlices(amount, day(s), day(e));
        assert.equal(sum(slices), amount, `${amount} over ${s}..${e} did not add up`);
        assert.ok(slices.length >= 1, "there is always at least one slice");
        assert.ok(slices.every((x) => x.amountCents >= 0), "no slice is negative");
      }
    }
  }
});

test("a zero amount still produces a schedule, all of it zero", () => {
  const slices = weeklySlices(0, day("2026-09-01"), day("2026-09-30"));
  assert.equal(slices.length, 4);
  assert.deepEqual(slices.map((s) => s.amountCents), [0, 0, 0, 0]);
});

test("a run with no Friday in it still pays once, on the end date", () => {
  // Monday to Thursday: no Friday falls inside, so the whole amount lands on the last day.
  const slices = weeklySlices(5000, day("2026-09-07"), day("2026-09-10"));
  assert.equal(slices.length, 1);
  assert.equal(slices[0].dueOn.toISOString().slice(0, 10), "2026-09-10");
  assert.equal(slices[0].amountCents, 5000);
});

test("a backwards run (end before start) collapses to one slice on the end date", () => {
  // Current behaviour, not a promise. Nothing validates the order of the two dates yet.
  const slices = weeklySlices(7777, day("2026-09-30"), day("2026-09-01"));
  assert.equal(slices.length, 1);
  assert.equal(slices[0].amountCents, 7777);
});

test("the bid step is 5% rounded up to $5, and never under $5", () => {
  assert.equal(bidStepCents(0), 500);
  assert.equal(bidStepCents(1), 500);
  assert.equal(bidStepCents(10000), 500);
  // 5% of $120 is $6, which rounds up to the next $5 mark: $10.
  assert.equal(bidStepCents(12000), 1000);
  assert.equal(bidStepCents(20000), 1000);
  assert.equal(bidStepCents(100000), 5000);
});

test("the bid step is always a whole number of $5 and never decreases with price", () => {
  let previous = 0;
  for (let price = 0; price <= 200000; price += 1000) {
    const step = bidStepCents(price);
    assert.equal(step % 500, 0, `step for ${price} is not a multiple of $5`);
    assert.ok(step >= previous, `step went backwards at ${price}`);
    previous = step;
  }
});
