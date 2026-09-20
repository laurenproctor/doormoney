/*
  Saving a patron profile: what kind of patron it is for, its links, and the categories it supports.

  The point of these is the boundary between three things that are easy to blur. What a patron is
  (a person, a business) is not a category. The categories a patron supports come from the registry
  and are stored apart from their interests. And interests typed when the field was called music
  preferences stay exactly as typed: nothing here reads "Jazz" as a vote for music.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Op = { table: string; verb: "insert" | "update" | "delete"; payload?: unknown; filters: Record<string, unknown> };

let ops: Op[] = [];
let registry = ["film", "music", "sports", "theater"];
let storedCategories: string[] = [];
let profileExists = true;

/** A query builder that records writes and answers reads from the state above. */
function from(table: string) {
  const state: { verb: Op["verb"] | "select"; payload?: unknown; filters: Record<string, unknown> } = { verb: "select", filters: {} };
  const answer = () => {
    if (state.verb !== "select") {
      ops.push({ table, verb: state.verb, payload: state.payload, filters: state.filters });
      return { data: null, error: null };
    }
    if (table === "fundraiser_categories") return { data: registry.map((key) => ({ key })), error: null };
    if (table === "patron_profile_categories") return { data: storedCategories.map((category_key) => ({ category_key })), error: null };
    if (table === "patron_profiles") return { data: profileExists ? { photo_path: null } : null, error: null };
    if (table === "profiles") return { data: { roles: ["patron"] }, error: null };
    return { data: null, error: null };
  };
  const builder = {
    select() { return builder; },
    insert(payload: unknown) { state.verb = "insert"; state.payload = payload; return builder; },
    update(payload: unknown) { state.verb = "update"; state.payload = payload; return builder; },
    delete() { state.verb = "delete"; return builder; },
    eq(column: string, value: unknown) { state.filters[column] = value; return builder; },
    in(column: string, value: unknown) { state.filters[column] = value; return builder; },
    order() { return builder; },
    maybeSingle: async () => answer(),
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(answer()).then(resolve, reject); },
  };
  return builder;
}

mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("@/lib/auth", { namedExports: {
  requireUser: async () => ({ id: "patron-1", email: "owner@kettle.example", email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }),
  currentProfile: async () => ({ id: "patron-1", username: "kettle-st", roles: ["patron"] }),
} });
mock.module("@/lib/supabase/server", { namedExports: {
  supabaseAdmin: () => ({ from, rpc: async () => ({ data: 0, error: null }) }),
  supabaseServer: async () => ({ from }),
} });
mock.module("@/lib/patronprofile", { namedExports: {
  eligibleActivity: async () => [],
  linkPatronRows: async () => 0,
  patronSinceFor: async () => "2026-01-01T00:00:00Z",
} });

const { saveProfileDetails } = await import("@/app/actions/profile");

const formWith = (fields: Record<string, string | string[]>) => {
  const form = new FormData();
  form.set("display_name", "Kettle St. Coffee");
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) form.append(key, v);
    else form.set(key, value);
  }
  return form;
};

const reset = () => { ops = []; storedCategories = []; profileExists = true; registry = ["film", "music", "sports", "theater"]; };

test("a business saves what it is, its links and the categories it supports", async () => {
  reset();
  const result = await saveProfileDetails({ ok: false }, formWith({
    profile_kind: "business",
    location: "Online",
    link_label_0: "Menu",
    link_url_0: "kettlest.example/menu",
    categories: ["sports", "theater"],
    interests: "Jazz\nYouth soccer",
  }));
  assert.equal(result.ok, true);

  const saved = ops.find((o) => o.table === "patron_profiles" && o.verb === "update");
  assert.ok(saved, "the profile row was written");
  const row = saved.payload as Record<string, unknown>;
  assert.equal(row.profile_kind, "business");
  assert.equal(row.location, "Online", "an online-only patron needs no city");
  assert.deepEqual(row.links, [{ label: "Menu", url: "https://kettlest.example/menu" }]);
  assert.deepEqual(row.interests, ["Jazz", "Youth soccer"], "interests are kept as typed");
  assert.equal(saved.filters.profile_id, "patron-1");
  for (const key of ["published", "patron_since", "categories", "category_key", "amount_cents", "email"]) {
    assert.equal(key in row, false, `${key} is not settable from the details form`);
  }

  const added = ops.find((o) => o.table === "patron_profile_categories" && o.verb === "insert");
  assert.deepEqual(added?.payload, [
    { profile_id: "patron-1", category_key: "sports" },
    { profile_id: "patron-1", category_key: "theater" },
  ]);
});

test("an interest is never read as a category", async () => {
  reset();
  const result = await saveProfileDetails({ ok: false }, formWith({ interests: "Music\nFilm\nJazz" }));
  assert.equal(result.ok, true);
  assert.equal(ops.some((o) => o.table === "patron_profile_categories"), false, "typing Music as an interest supports no category");
});

test("an individual is asked nothing about a business, and saving twice changes nothing", async () => {
  reset();
  storedCategories = ["music"];
  const result = await saveProfileDetails({ ok: false }, formWith({ categories: ["music"] }));
  assert.equal(result.ok, true);
  const row = ops.find((o) => o.table === "patron_profiles")?.payload as Record<string, unknown>;
  assert.equal(row.profile_kind, null);
  assert.deepEqual(row.links, []);
  assert.equal(ops.some((o) => o.table === "patron_profile_categories"), false, "an unchanged choice writes nothing");
});

test("unticking a category removes that one and only that one", async () => {
  reset();
  storedCategories = ["film", "music"];
  await saveProfileDetails({ ok: false }, formWith({ categories: ["music"] }));
  const removed = ops.filter((o) => o.table === "patron_profile_categories");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].verb, "delete");
  assert.deepEqual(removed[0].filters, { profile_id: "patron-1", category_key: ["film"] });
});

test("a category outside the registry, or one that cannot publish, is refused before anything is written", async () => {
  reset();
  registry = ["music"];
  const result = await saveProfileDetails({ ok: false }, formWith({ categories: ["music", "dance"] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors?.categories);
  assert.deepEqual(ops, []);
});

test("a fifth category needs no change here: the registry is the only list", async () => {
  reset();
  registry = ["dance", "music"];
  const result = await saveProfileDetails({ ok: false }, formWith({ categories: ["dance"] }));
  assert.equal(result.ok, true);
  assert.deepEqual(ops.find((o) => o.table === "patron_profile_categories")?.payload, [{ profile_id: "patron-1", category_key: "dance" }]);
});

test("a kind that is really a category, and a link that is not https, save nothing", async () => {
  reset();
  const kind = await saveProfileDetails({ ok: false }, formWith({ profile_kind: "music" }));
  assert.equal(kind.ok, false);
  assert.ok(kind.errors?.profile_kind);
  const link = await saveProfileDetails({ ok: false }, formWith({ link_url_0: "http://plain.example" }));
  assert.equal(link.ok, false);
  assert.ok(link.errors?.links);
  assert.deepEqual(ops, []);
});

test("a first profile is created private, and its categories are written after the row exists", async () => {
  reset();
  profileExists = false;
  const result = await saveProfileDetails({ ok: false }, formWith({ profile_kind: "nonprofit", categories: ["film"] }));
  assert.equal(result.ok, true);
  const created = ops.findIndex((o) => o.table === "patron_profiles" && o.verb === "insert");
  const categories = ops.findIndex((o) => o.table === "patron_profile_categories" && o.verb === "insert");
  assert.ok(created >= 0 && categories > created, "the row comes first, because each choice hangs off it");
  assert.equal((ops[created].payload as Record<string, unknown>).published, false);
});
