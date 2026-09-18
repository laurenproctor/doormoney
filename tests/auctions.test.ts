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

/*
  What the database's refusals become on the page. place_bid and begin_lot_purchase (migration
  0035) raise the reason as the message; these two maps are the only place those words are turned
  into copy, so a reason the database can raise and the page cannot say would be a silent "try
  once more". Every reason the functions raise is listed here on purpose.
*/
import { bidRefusalMessage, checkoutRefusal } from "@/lib/auctions";

const BID_REASONS = ["lot_not_found", "not_an_auction", "fundraiser_closed", "spot_on_hold", "bidding_over", "bidding_closed", "bid_below_minimum"];
const CHECKOUT_REASONS = ["lot_not_found", "spot_taken", "spot_being_taken", "bidding_passed_take_it_now", "not_for_sale_outright", "not_for_sale", "offer_not_current", "bid_not_on_lot", "amount_not_the_bid", "amount_not_the_price"];

test("every reason place_bid can raise has its own words", () => {
  const fallback = bidRefusalMessage("something_else");
  for (const reason of BID_REASONS) {
    const message = bidRefusalMessage(reason, reason === "bid_below_minimum" ? "54500" : null);
    assert.notEqual(message, fallback, `${reason} fell through to the generic message`);
    assert.doesNotMatch(message, /_/, `${reason} leaked a database word onto the page`);
  }
});

test("a bid under the minimum says what the next bid starts at", () => {
  assert.equal(bidRefusalMessage("bid_below_minimum", "54500"), "The next bid starts at $545.");
  // A detail that is not a number still gets a sentence, never NaN.
  assert.doesNotMatch(bidRefusalMessage("bid_below_minimum", null), /NaN|\$undefined/);
  assert.doesNotMatch(bidRefusalMessage("bid_below_minimum", "abc"), /NaN/);
});

test("every reason begin_lot_purchase can raise has its own words and a status", () => {
  const fallback = checkoutRefusal("something_else");
  assert.equal(fallback.status, 500);
  for (const reason of CHECKOUT_REASONS) {
    const r = checkoutRefusal(reason);
    assert.notEqual(r.error, fallback.error, `${reason} fell through to the generic message`);
    assert.ok(r.status >= 400 && r.status < 500, `${reason} is the caller's problem, not the server's`);
    assert.doesNotMatch(r.error, /_/, `${reason} leaked a database word onto the page`);
  }
});

test("a checkout on a spot somebody else is paying for is a conflict, and a lapsed offer is gone", () => {
  assert.equal(checkoutRefusal("spot_being_taken").status, 409);
  assert.equal(checkoutRefusal("spot_taken").status, 409);
  assert.equal(checkoutRefusal("offer_not_current").status, 410);
  assert.equal(checkoutRefusal("lot_not_found").status, 404);
});
