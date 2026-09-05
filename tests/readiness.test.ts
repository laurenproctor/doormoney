/*
  The rules publishRun and the run-page checklist share. Everything here is the pure half; the
  ownership half is enforced in the action and exercised against a live database in tests/live.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { publishBlockers, readiness, type ReadinessInput } from "@/lib/readiness";

const ANSWER = "The musician photographs the marked case at selected dates, with the room and the date beside each image.";

const ready = (): ReadinessInput => ({
  act: { name: "Gutter Hymns", city: "New York", bio: "Four-piece out of Ridgewood.", stripe_account_id: "acct_1", stripe_payouts_enabled: true },
  run: {
    title: "Fall run",
    starts_on: "2026-10-03",
    ends_on: "2026-11-02",
    show_count: 18,
    bidding_closes_at: "2026-09-25T23:00:00-04:00",
    status: "draft",
    methods: ["selected_show_photos", "end_of_run_record"],
    other: null,
  },
  lotCount: 4,
  auctionCount: 2,
});

test("a finished draft publishes", () => {
  assert.deepEqual(publishBlockers(ready()), []);
});

test("a draft with no verification method cannot publish", () => {
  const input = ready();
  input.run.methods = [];
  const blockers = publishBlockers(input);
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /at least one way the placements will be recorded/);
});

test("other with no answer cannot publish, and the message names the write-in", () => {
  const input = ready();
  input.run.methods = ["other"];
  input.run.other = null;
  assert.match(publishBlockers(input)[0], /Describe the other verification method/);
});

test("other with an answer too short cannot publish, and the message says how short", () => {
  const input = ready();
  input.run.methods = ["other"];
  input.run.other = "photos";
  assert.match(publishBlockers(input)[0], /at least 10 characters/);
});

test("other with a good answer publishes", () => {
  const input = ready();
  input.run.methods = ["other"];
  input.run.other = ANSWER;
  assert.deepEqual(publishBlockers(input), []);
});

test("no spots, no bio, no dates: every missing thing is named at once", () => {
  const blockers = publishBlockers({
    act: { name: "Gutter Hymns", city: "New York", bio: null, stripe_account_id: null, stripe_payouts_enabled: false },
    run: { title: "Fall run", starts_on: null, ends_on: null, show_count: 0, bidding_closes_at: null, status: "draft", methods: [], other: null },
    lotCount: 0,
    auctionCount: 0,
  });
  assert.equal(blockers.length, 4);
  assert.match(blockers.join(" "), /short bio/);
  assert.match(blockers.join(" "), /Finish the fundraiser/);
  assert.match(blockers.join(" "), /at least one spot/);
  assert.match(blockers.join(" "), /at least one way/);
});

test("auction spots still need a close time", () => {
  const input = ready();
  input.run.bidding_closes_at = null;
  assert.match(publishBlockers(input)[0], /bidding close time/);
});

test("fixed-price spots do not need a close time", () => {
  const input = ready();
  input.run.bidding_closes_at = null;
  input.auctionCount = 0;
  assert.deepEqual(publishBlockers(input), []);
});

test("payout setup never blocks publishing, and shows as optional on the checklist", () => {
  const input = ready();
  input.act.stripe_payouts_enabled = false;
  input.act.stripe_account_id = null;
  assert.deepEqual(publishBlockers(input), []);

  const payouts = readiness(input).find((r) => r.key === "payouts");
  assert.ok(payouts);
  assert.equal(payouts.done, false);
  assert.equal(payouts.optional, true);
  assert.match(payouts.note, /fundraiser can open first/);
});

test("the checklist is the six rows, in order, and agrees with the publish gate", () => {
  const input = ready();
  input.run.methods = [];
  const rows = readiness(input);
  assert.deepEqual(rows.map((r) => r.key), ["profile", "run", "lots", "verification", "payouts", "publish"]);
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Musician profile", "Fundraiser details", "Sponsorships", "Placement verification", "Payout setup", "Ready to publish"],
  );
  const verification = rows.find((r) => r.key === "verification");
  const publish = rows.find((r) => r.key === "publish");
  assert.equal(verification?.done, false);
  assert.equal(publish?.done, false);
  // The last row says the same thing the publish button would.
  assert.equal(publish?.note, publishBlockers(input)[0]);
});

test("a published run reads as published even while something else is unfinished", () => {
  const input = ready();
  input.run.status = "open";
  input.act.bio = null;
  const publish = readiness(input).find((r) => r.key === "publish");
  assert.equal(publish?.done, true);
  assert.equal(publish?.note, "The fundraiser is public.");
});
