/*
  The minimum a bid has to clear. This is arithmetic only: the authoritative current top bid is read
  from the database elsewhere, and Phase 3 moves that read into the same transaction as the insert.
  What is tested here is the number, given a top bid.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { minimumBidCents } from "@/lib/auctions";
import { bidStepCents } from "@/lib/money";

test("the first bid on a lot has to meet the reserve exactly, with no step added", () => {
  assert.equal(minimumBidCents(10000, null), 10000);
  assert.equal(minimumBidCents(0, null), 0);
});

test("once there is a bid, the minimum is that bid plus one step", () => {
  assert.equal(minimumBidCents(10000, 10000), 10500);
  assert.equal(minimumBidCents(20000, 25000), 26000);
});

test("the step comes from the list price, not from the current top bid", () => {
  // A cheap lot bid far above its reserve still moves in that lot's small step.
  assert.equal(minimumBidCents(10000, 500000), 500500);
  // An expensive lot moves in its own larger step from the first raise onward.
  assert.equal(minimumBidCents(100000, 100000), 105000);
});

test("the minimum always strictly exceeds the standing bid", () => {
  for (const price of [0, 1, 5000, 12000, 100000]) {
    for (const top of [0, 1, 4999, 100000, 999999]) {
      assert.ok(minimumBidCents(price, top) > top, `minimum did not clear ${top} at price ${price}`);
    }
  }
});

test("the minimum is exactly the top bid plus the published step", () => {
  for (const price of [0, 2500, 12000, 100000]) {
    for (const top of [0, 7500, 250000]) {
      assert.equal(minimumBidCents(price, top), top + bidStepCents(price));
    }
  }
});

test("a zero top bid is a bid, not an absent one", () => {
  // null means nobody has bid; 0 means somebody bid nothing. They must not be treated alike.
  assert.equal(minimumBidCents(10000, null), 10000);
  assert.equal(minimumBidCents(10000, 0), 500);
});
