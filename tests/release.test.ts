/*
  When a weekly slice may leave Door Money's balance.

  refundDue (tests/refunds.test.ts) pins how much goes back to a patron. This pins when money is
  allowed to go out in the first place, which is the other half of the same promise: /terms says a
  declined logo refunds the patron in full, and that is only true while nothing has been sent.

  The Friday job used to ask two questions, about the charge and about the act's payout setup, and
  never about the logo. The third question is what these cover.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { HOLDS, slicePlan, type SliceSource } from "@/lib/release";

const payableAct = { stripe_account_id: "acct_1", stripe_payouts_enabled: true };

const sponsorship = (mark_status: string): SliceSource => ({
  kind: "sponsorship",
  payment_status: "held",
  stripe_charge_id: "ch_1",
  mark_status,
});

const backing: SliceSource = { kind: "backing", payment_status: "held", stripe_charge_id: "ch_2" };

test("a sponsorship pays only once the musician has approved the logo", () => {
  const plan = slicePlan(sponsorship("approved"), payableAct);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan, { ok: true, chargeId: "ch_1", stripeAccountId: "acct_1" });
});

test("every other state of the logo holds the money", () => {
  // 'none' is a patron who has sent nothing, 'submitted' a musician who has not answered.
  // 'declined' is refunded rather than paid, and must never move either.
  for (const status of ["none", "submitted", "declined"]) {
    const plan = slicePlan(sponsorship(status), payableAct);
    assert.equal(plan.ok, false, `${status} released the money`);
    assert.equal(plan.ok === false && plan.hold, HOLDS.logoWaiting);
  }
});

test("a sponsorship with no logo column at all is held, not released", () => {
  // The column is optional on the type because a backing has none. A sponsorship that arrives
  // without it is a query that forgot to select it, and the safe reading of that is 'not approved'.
  const plan = slicePlan({ kind: "sponsorship", payment_status: "held", stripe_charge_id: "ch_1" }, payableAct);
  assert.equal(plan.ok, false);
  assert.equal(plan.ok === false && plan.hold, HOLDS.logoWaiting);
});

test("a fan backing pays on the calendar, because there is no logo to approve", () => {
  const plan = slicePlan(backing, payableAct);
  assert.equal(plan.ok, true);
  assert.equal(plan.ok === true && plan.chargeId, "ch_2");
});

test("an approved logo is still not enough without a charge to draw on", () => {
  const noCharge = { ...sponsorship("approved"), stripe_charge_id: null };
  assert.equal(slicePlan(noCharge, payableAct).ok, false);
  const refunded = { ...sponsorship("approved"), payment_status: "refunded" };
  assert.equal(slicePlan(refunded, payableAct).ok, false);
  // Both answer the same way, and before the logo question: there is nothing to send.
  for (const source of [noCharge, refunded, null, undefined]) {
    const plan = slicePlan(source, payableAct);
    assert.equal(plan.ok === false && plan.hold, HOLDS.noCharge);
  }
});

test("an act that has not finished payout setup holds the money too", () => {
  for (const act of [
    { stripe_account_id: null, stripe_payouts_enabled: true },
    { stripe_account_id: "acct_1", stripe_payouts_enabled: false },
  ]) {
    const plan = slicePlan(sponsorship("approved"), act);
    assert.equal(plan.ok === false && plan.hold, HOLDS.payoutSetup);
  }
});

test("the logo is asked about before payout setup, so the reason names the real blocker", () => {
  // Door Money reads these counts. A sponsorship waiting on a logo from an act that has also not
  // finished onboarding is a logo problem first: fixing the onboarding would not release it.
  const plan = slicePlan(sponsorship("submitted"), { stripe_account_id: null, stripe_payouts_enabled: false });
  assert.equal(plan.ok === false && plan.hold, HOLDS.logoWaiting);
});

test("a released or partially refunded payment has nothing left to draw on", () => {
  for (const status of ["requires_payment", "released", "refunded", "partially_refunded"]) {
    const plan = slicePlan({ ...sponsorship("approved"), payment_status: status }, payableAct);
    assert.equal(plan.ok === false && plan.hold, HOLDS.noCharge, `${status} was treated as payable`);
  }
});
