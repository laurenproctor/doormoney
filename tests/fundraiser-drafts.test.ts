import assert from "node:assert/strict";
import { test } from "node:test";
import { FundraiserDraftInput, categoryErrors } from "@/lib/fundraiser-drafts";

for (const category_key of ["music", "sports", "film", "theater"]) {
  test(`${category_key} can save an honest, incomplete draft`, () => {
    const draft = FundraiserDraftInput.parse({ category_key });
    for (const field of ["kind", "show_count", "starts_on", "ends_on", "goal_cents", "timezone", "delivery_due_at", "purpose", "sponsor_promise"] as const) assert.equal(draft[field], null);
    assert.equal(draft.title, "");
    assert.deepEqual(draft.activity_locations, []);
  });
}
test("future categories come from the registry without a new enum", () => {
  const draft = FundraiserDraftInput.parse({ category_key: "community", category_details: { project: "Public garden" } });
  assert.deepEqual(categoryErrors(draft, [{ key: "community", label: "Community", detail_keys: ["project"], draft_enabled: true }]), []);
  assert.ok(categoryErrors(draft, []).length);
  assert.ok(categoryErrors(draft, [{ key: "community", label: "Community", detail_keys: ["project"], draft_enabled: false }]).length);
});
test("the funding purpose, sponsor promise and audience are distinct", () => {
  const draft = FundraiserDraftInput.parse({ category_key: "film", purpose: "Camera rental", sponsor_promise: "Logo in the end credits", audience_description: "Festival audiences" });
  assert.equal(draft.purpose, "Camera rental");
  assert.equal(draft.sponsor_promise, "Logo in the end credits");
});
test("music-only fields cannot be smuggled into another category", () => {
  for (const fields of [{ kind: "tour" }, { show_count: 4 }]) assert.equal(FundraiserDraftInput.safeParse({ category_key: "film", ...fields }).success, false);
});
test("calendar dates and deadlines reject impossible dates and ambiguous instants", () => {
  for (const fields of [
    { starts_on: "2026-02-30" }, { starts_on: "2026-11-02", ends_on: "2026-11-01" },
    { fundraising_starts_on: "2026-11-02", fundraising_ends_on: "2026-11-01" },
    { delivery_due_at: "2026-11-01T12:00" }, { delivery_due_at: "2026-02-30T12:00:00Z" },
    { bidding_closes_at: "2026-11-01T12:00" }, { timezone: "Made/Up" },
  ]) assert.equal(FundraiserDraftInput.safeParse({ category_key: "music", ...fields }).success, false, JSON.stringify(fields));
});
test("multiple locations, remote activity and explicit time zones do not assume NYC", () => {
  const draft = FundraiserDraftInput.parse({ category_key: "theater", activity_mode: "hybrid", activity_locations: [{ city: "London", country_code: "GB" }, { city: "Accra", country_code: "GH" }], timezone: "Africa/Accra", delivery_due_at: "2026-12-01T18:00:00+00:00" });
  assert.equal(draft.activity_locations[1].city, "Accra");
  assert.equal(draft.timezone, "Africa/Accra");
});
test("a goal is exact money with an explicit currently supported currency", () => {
  assert.equal(FundraiserDraftInput.parse({ category_key: "sports", goal_cents: 125099, goal_currency: "USD" }).goal_cents, 125099);
  for (const fields of [{ goal_cents: 5 }, { goal_cents: -1, goal_currency: "USD" }, { goal_cents: 0.01, goal_currency: "USD" }, { goal_cents: 1, goal_currency: "XYZ" }]) assert.equal(FundraiserDraftInput.safeParse({ category_key: "sports", ...fields }).success, false);
});
test("draft input cannot assign ownership, publication or payment state", () => {
  for (const field of ["owner_id", "act_id", "status", "category_locked", "payment_status", "slug"]) assert.equal(FundraiserDraftInput.safeParse({ category_key: "film", [field]: "injected" }).success, false);
});
