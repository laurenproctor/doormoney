/*
  The rules publishRun and the run-page checklist share. Everything here is the pure half; the
  ownership half is enforced in the action and exercised against a live database in tests/live.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { draftProgress, publishBlockers, readiness, type ReadinessInput } from "@/lib/readiness";

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
  categoryPublishable: true,
  incompleteOffers: [],
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
    categoryPublishable: true,
    incompleteOffers: [],
  });
  assert.equal(blockers.length, 4);
  assert.match(blockers.join(" "), /short bio/);
  assert.match(blockers.join(" "), /Finish the fundraiser/);
  assert.match(blockers.join(" "), /at least one sponsorship option/);
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

/*
  The second gate. Music is held to the one it has always been held to; every other category is
  held to the product contract's own test instead. Neither is the other's default.
*/

const theater = (): ReadinessInput => ({
  act: { name: "Foundation Theater", city: null, bio: "A company in a room above a pub.", stripe_account_id: "acct_2", stripe_payouts_enabled: true },
  run: {
    category_key: "theater",
    title: "Winter production",
    starts_on: null,
    ends_on: null,
    show_count: null,
    bidding_closes_at: null,
    status: "draft",
    purpose: "Rights, set build and four weeks of rehearsal room.",
    audience_description: "The company's own audience, about 90 a night for three weeks.",
    sponsor_promise: "A credit in the program and the sponsor's name in the foyer.",
    methods: ["selected_show_photos"],
    other: null,
  },
  lotCount: 2,
  auctionCount: 0,
  categoryPublishable: true,
  incompleteOffers: [],
});

test("a theater fundraiser publishes on the contract's three questions, with no dates and no city", () => {
  assert.deepEqual(publishBlockers(theater()), []);
});

test("outside music, the three questions are the gate, and the missing one is named", () => {
  for (const [field, expected] of [
    ["purpose", /what the funding enables/],
    ["audience_description", /who it reaches/],
    ["sponsor_promise", /what a sponsor receives/],
  ] as const) {
    const input = theater();
    input.run[field] = null;
    const blockers = publishBlockers(input);
    assert.equal(blockers.length, 1, `${field} should be the only thing in the way`);
    assert.match(blockers[0], expected);
  }
});

test("a music fundraiser is not asked the three questions, and keeps its own gate", () => {
  const input = ready();
  input.run.purpose = null;
  input.run.audience_description = null;
  input.run.sponsor_promise = null;
  assert.deepEqual(publishBlockers(input), [], "music publishes on the details it always published on");
  input.run.show_count = null;
  assert.match(publishBlockers(input).join(" "), /show count/, "and still needs those");
});

test("a category nobody has turned on cannot publish, however complete it is", () => {
  const input = theater();
  input.categoryPublishable = false;
  const blockers = publishBlockers(input);
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /Publishing is not open for it yet/);
});

test("a city is music's requirement, not everyone's", () => {
  const withoutCity = ready();
  withoutCity.act.city = null;
  assert.match(publishBlockers(withoutCity).join(" "), /name and city/, "music still wants one");
  assert.deepEqual(publishBlockers(theater()), [], "and nobody else does");
});

test("the checklist names the organizer the way its category does", () => {
  assert.equal(readiness(ready())[0].label, "Musician profile");
  assert.equal(readiness(theater())[0].label, "Theater company profile");
  const sports = theater();
  sports.run.category_key = "sports";
  assert.equal(readiness(sports)[0].label, "Team profile");
});

/* ------------------------------------------------------------------ how far a draft has come */

test("a draft's progress counts the four things that hold it back, and names the next one", () => {
  const done = draftProgress(readiness(ready()));
  assert.deepEqual([done.done, done.total, done.next], [4, 4, null]);

  const input = ready();
  input.lotCount = 0;
  input.auctionCount = 0;
  const partial = draftProgress(readiness(input));
  assert.equal(partial.total, 4);
  assert.equal(partial.done, 3);
  assert.equal(partial.next?.key, "lots");
});

test("payout setup is never one of the steps, because it never holds a publish up", () => {
  const input = ready();
  input.act.stripe_payouts_enabled = false;
  input.act.stripe_account_id = null;
  const progress = draftProgress(readiness(input));
  assert.deepEqual([progress.done, progress.total], [4, 4]);
});

test("an option whose offer is unfinished is not a step done, and is the next one", () => {
  const input = ready();
  input.lotCount = 1;
  input.auctionCount = 0;
  input.incompleteOffers = [{ key: "banner", name: "Stage banner", missing: ["Where it appears, and in what form", "At least one deliverable"] }];

  const progress = draftProgress(readiness(input));
  assert.deepEqual([progress.done, progress.total], [3, 4], "the options step is not done while an offer is unfinished");
  assert.equal(progress.next?.key, "lots");
  assert.match(progress.next?.note ?? "", /Stage banner still needs/);
  assert.match(publishBlockers(input).join(" "), /Finish the offer for Stage banner/, "and publishing is refused for the same reason");
});
