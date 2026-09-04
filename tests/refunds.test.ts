/*
  What goes back to a patron. The rule on /terms is that a patron gets back every slice not yet
  released, and Door Money returns its fee on that part too. refundDue is the whole of that
  arithmetic; everything around it is Stripe and bookkeeping.

  Phase 2 changes when a refund is owed, not how much. These tests pin the how much.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { refundDue } from "@/lib/refunds";
import { feeCents } from "@/lib/money";

/** A $100 sale at the standard 15%: $85 of act net, $15 of fee. */
const sale = { amount_cents: 10000, fee_cents: 1500 };

test("before any slice is paid, the patron gets the whole charge back, fee included", () => {
  assert.equal(refundDue(sale, 0), 10000);
});

test("once the act has been paid in full, nothing goes back", () => {
  assert.equal(refundDue(sale, 8500), 0);
});

test("half the act's net paid out means half the charge comes back", () => {
  // $42.50 of the $85 net has gone to the act, so $50 of the $100 returns: the unpaid
  // half of the net plus the fee that rode on it.
  assert.equal(refundDue(sale, 4250), 5000);
});

test("the fee is refunded in proportion, never kept on money the act never saw", () => {
  const paid = 1700; // one fifth of the net
  const refund = refundDue(sale, paid);
  assert.equal(refund, 8000);
  // Of that refund, four fifths of the fee came back too.
  assert.equal(refund - (8500 - paid), 1200);
});

test("paying the act more than its net never produces a negative refund", () => {
  assert.equal(refundDue(sale, 8501), 0);
  assert.equal(refundDue(sale, 999999), 0);
});

test("a sale whose fee swallows the whole amount refunds everything", () => {
  // net <= 0 is the guard: there is no act share to prorate against, so the patron gets it all.
  assert.equal(refundDue({ amount_cents: 1000, fee_cents: 1000 }, 0), 1000);
  assert.equal(refundDue({ amount_cents: 1000, fee_cents: 5000 }, 0), 1000);
  // Even when slices were somehow already paid, the guard returns the full amount.
  assert.equal(refundDue({ amount_cents: 1000, fee_cents: 1000 }, 500), 1000);
});

test("a zero-value sale refunds zero", () => {
  assert.equal(refundDue({ amount_cents: 0, fee_cents: 0 }, 0), 0);
});

test("the refund rounds to whole cents and stays inside the charge", () => {
  // One cent of net paid out of 8500 leaves an unroundable fraction; it must not exceed the charge.
  assert.equal(refundDue(sale, 1), 9999);
  for (let paid = 0; paid <= 8500; paid += 7) {
    const refund = refundDue(sale, paid);
    assert.ok(Number.isInteger(refund), `refund for ${paid} paid is not whole cents`);
    assert.ok(refund >= 0 && refund <= sale.amount_cents, `refund for ${paid} paid is out of range`);
  }
});

test("the refund never falls below what the patron is owed for unreleased money", () => {
  // The patron must always get back at least the unpaid net; the fee share is on top.
  for (const amount of [500, 2500, 10000, 33333]) {
    const fee = feeCents(amount);
    const net = amount - fee;
    for (const paid of [0, 1, Math.floor(net / 3), net - 1, net]) {
      const refund = refundDue({ amount_cents: amount, fee_cents: fee }, paid);
      assert.ok(refund >= net - paid, `refund ${refund} is under the unpaid net for ${amount}/${paid}`);
    }
  }
});

test("a refund shrinks as more of the run is paid out", () => {
  let previous = Infinity;
  for (let paid = 0; paid <= 8500; paid += 500) {
    const refund = refundDue(sale, paid);
    assert.ok(refund <= previous, `refund grew at ${paid} paid`);
    previous = refund;
  }
});
