/*
  A draft's step count on the dashboard home.

  It exists because the two disagreed. Until 2026-09-23 the home counted the options step done the
  moment one spot existed, so Today said "This draft has everything it needs" and "4 of 4 steps
  done" about a draft publishRun refused, because publishBlockers also asks every open spot whether
  its offer states what the product contract asks for before a purchase. draftStep now reads the
  same rule, so the sentence on the home and the answer from the publish button cannot disagree.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { draftStep, type HomeAct } from "@/lib/dashboard-home";

const ACT: HomeAct = {
  id: "a1000000-0000-4000-8000-000000000001",
  name: "Gutter Hymns",
  city: "New York",
  bio: "Four-piece out of Ridgewood.",
  stripe_account_id: "acct_1",
  stripe_payouts_enabled: true,
};

/** A music draft with nothing else outstanding, so the options step is the only one in question. */
const RUN = {
  id: "r1000000-0000-4000-8000-000000000001",
  slug: "fall-run",
  title: "Fall run",
  status: "draft",
  category_key: "music",
  fundraising_ends_on: null,
  goal_cents: null,
  kind: "tour",
  starts_on: "2026-10-03",
  ends_on: "2026-11-02",
  show_count: 18,
  bidding_closes_at: "2026-09-25T23:00:00-04:00",
  purpose: "Van, backline and three weeks of rooms.",
  audience_description: "Rooms of about 200 across the northeast.",
  sponsor_promise: "The sponsor's name on the kick drum head.",
  verification_methods: ["selected_show_photos"],
  verification_other: null,
};

const TEMPLATES = [{ key: "kick_drum", name: "Kick drum head" }];

/** Everything the contract asks of an offer, so this spot holds nothing back. */
const COMPLETE_TERMS = {
  version: 1,
  placement: { description: "On the kick drum head, facing the room.", format: "A printed vinyl decal", appearance: null },
  appearances: { quantity: 18, unit: "show", schedule: null },
  delivery_window: { starts_on: "2026-10-03", ends_on: "2026-11-02", timezone: "America/New_York", deadline_on: null },
  audience: { description: "Rooms of about 200 across the northeast." },
  production: { included: true, cost_cents: null, who_pays: null, description: null },
  sponsor_materials: { type: "artwork", description: "A vector logo.", due_days_after_purchase: 14 },
  approval: { rule: "approval", deadline_days_after_materials: null, description: null },
  deliverables: [{ title: "The decal on the head", quantity: 18, due_on: null, description: "On the head for every date.", evidence_method: "photo", evidence_visibility: "private" }],
};

const spot = (over: Record<string, unknown> = {}) => ({
  run_id: RUN.id,
  price_cents: 40000,
  mode: "fixed",
  surface_key: "kick_drum",
  status: "open",
  reach_estimate: null,
  reach_basis: null,
  offer_terms: COMPLETE_TERMS,
  exclusive: false,
  terms_grandfathered: false,
  ...over,
});

test("a draft whose only option has an unfinished offer is not four of four", () => {
  const step = draftStep(ACT, RUN, [spot({ offer_terms: {} })], TEMPLATES, true);
  assert.deepEqual([step.done, step.total], [3, 4]);
  assert.equal(step.label, "Sponsorships");
  assert.match(step.note ?? "", /Kick drum head still needs/);
  assert.equal(step.href, `/dashboard/runs/${RUN.id}?tab=options`);
});

test("the same draft is four of four once the offer states what a sponsor reads", () => {
  const step = draftStep(ACT, RUN, [spot()], TEMPLATES, true);
  assert.deepEqual([step.done, step.total, step.label], [4, 4, null]);
});

test("a draft with no option at all is still three of four, and says so plainly", () => {
  const step = draftStep(ACT, RUN, [], TEMPLATES, true);
  assert.deepEqual([step.done, step.total], [3, 4]);
  assert.equal(step.note, "Nothing priced yet.");
});

test("a spot that is already sold is not asked to finish its offer again", () => {
  // The frozen document a sale was made under, and a second spot carrying the same one beside it.
  const sold = spot({ status: "sold", offer_terms: {} });
  const beside = spot({ offer_terms: {} });
  const step = draftStep(ACT, RUN, [sold, beside], TEMPLATES, true);
  assert.deepEqual([step.done, step.total], [4, 4]);
});
