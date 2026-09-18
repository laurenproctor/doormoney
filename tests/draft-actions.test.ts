import assert from "node:assert/strict";
import { mock, test } from "node:test";

const id = "a0000000-0000-4000-8000-000000000001";
const requests: { table: string; operation: string; row: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
let matched = true;
let signedIn = true;
const categories = ["music", "sports", "film", "theater"].map(key => ({ key, label: key, detail_keys: [], draft_enabled: true }));
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("next/navigation", { namedExports: { redirect(to: string) { throw new Error(`redirect:${to}`); } } });
mock.module("@/lib/auth", { namedExports: {
  requireUser: async () => { if (!signedIn) throw new Error("sign in"); return { id: "owner" }; },
  ownedAct: async () => ({ id: "owned-organizer", slug: "organizer" }),
} });
mock.module("@/lib/supabase/server", { namedExports: { supabaseServer: async () => ({
  from(table: string) {
    const request = { table, operation: "read", row: {} as Record<string, unknown>, filters: {} as Record<string, unknown> };
    const result = { data: matched ? { id } : null, error: null };
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { request.filters[key] = value; return query; },
      order: async () => ({ data: categories, error: null }),
      insert(row: Record<string, unknown>) { request.operation = "insert"; request.row = row; requests.push(request); return query; },
      update(row: Record<string, unknown>) { request.operation = "update"; request.row = row; requests.push(request); return query; },
      maybeSingle: async () => result,
      single: async () => result,
    };
    return query;
  },
}) } });
const { saveFundraiserDraft, saveDraftForm } = await import("@/app/actions/drafts");

test("each launch category reaches a session-scoped insert with the authenticated owner", async () => {
  for (const category_key of categories.map(c => c.key)) {
    assert.equal((await saveFundraiserDraft({ category_key })).ok, true);
    const request = requests.at(-1)!;
    assert.equal(request.row.act_id, "owned-organizer");
    assert.equal(request.row.kind, null);
    assert.equal(request.row.show_count, null);
    assert.equal(request.row.status, "draft");
  }
});
test("edits are conditional on both ownership and still being a draft", async () => {
  assert.equal((await saveFundraiserDraft({ id, category_key: "film" })).ok, true);
  assert.deepEqual(requests.at(-1)!.filters, { id, act_id: "owned-organizer", status: "draft" });
  assert.equal("slug" in requests.at(-1)!.row, false);
  matched = false;
  assert.equal((await saveFundraiserDraft({ id, category_key: "film" })).ok, false);
  matched = true;
});
test("unauthenticated or injected ownership cannot reach a write", async () => {
  const before = requests.length;
  signedIn = false;
  await assert.rejects(saveFundraiserDraft({ category_key: "film" }), /sign in/);
  signedIn = true;
  assert.equal((await saveFundraiserDraft({ category_key: "film", act_id: "someone-else" })).ok, false);
  assert.equal((await saveFundraiserDraft({ category_key: "unknown" })).ok, false);
  assert.equal(requests.length, before);
});
test("the form preserves exact cents and an explicit UTC auction deadline", async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ id, category_key: "music", goal_amount: "19.99", goal_currency: "USD", bidding_closes_utc: "2026-11-01T18:00", purpose: "Tour travel", sponsor_promise: "Logo on the tour poster" })) form.set(key, value);
  assert.equal((await saveDraftForm({ ok: false }, form)).ok, true);
  const row = requests.at(-1)!.row;
  assert.equal(row.goal_cents, 1999);
  assert.equal(row.bidding_closes_at, "2026-11-01T18:00Z");
  assert.equal(row.sponsor_promise, "Logo on the tour poster");
  form.set("goal_amount", "12.345");
  assert.equal((await saveDraftForm({ ok: false }, form)).ok, false);
});
