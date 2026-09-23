/*
  Changing a show on somebody else's run.

  Three holes, all in src/app/actions/shows.ts. The ownership check read the shows table, which
  every visitor can read (0001, "public read shows"), so finding the row proved only that the show
  exists. markShow handed the caller's patch object straight to .update(), so any column on the row
  could be written by name. And uploadShowPhoto put the file in the bucket with the service role,
  which row level security does not apply to, before any of that ran.

  The fix resolves the show's run through runs filtered on the act this account owns, the way
  src/app/actions/run.ts does. These hold it.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Op = { table: string; verb: "insert" | "update" | "delete"; payload?: unknown; filters: Record<string, unknown> };

const OWN_SHOW = "11111111-1111-4111-8111-111111111111";
const THEIR_SHOW = "22222222-2222-4222-8222-222222222222";

let act: { id: string; slug: string } = { id: "act-1", slug: "gutter-hymns" };
let shows: { id: string; run_id: string }[] = [];
let runs: { id: string; slug: string; act_id: string }[] = [];
let ops: Op[] = [];
let uploads: { path: string; contentType?: string }[] = [];
let updateError: { message: string } | null = null;

function from(table: string) {
  const state: { verb: Op["verb"] | "select"; payload?: unknown; filters: Record<string, unknown> } = { verb: "select", filters: {} };
  const answer = () => {
    if (state.verb !== "select") {
      ops.push({ table, verb: state.verb, payload: state.payload, filters: state.filters });
      return { data: null, error: state.verb === "update" ? updateError : null };
    }
    // Both reads are filtered the way the action filters them: the show by its id alone, because
    // that is all a public read can be, and the run by its id and the act this account owns.
    if (table === "shows") return { data: shows.find((s) => s.id === state.filters.id) ?? null, error: null };
    if (table === "runs") {
      const run = runs.find((r) => r.id === state.filters.id && (state.filters.act_id === undefined || r.act_id === state.filters.act_id));
      return { data: run ? { id: run.id, slug: run.slug } : null, error: null };
    }
    return { data: null, error: null };
  };
  const builder = {
    select() { return builder; },
    insert(payload: unknown) { state.verb = "insert"; state.payload = payload; return builder; },
    update(payload: unknown) { state.verb = "update"; state.payload = payload; return builder; },
    delete() { state.verb = "delete"; return builder; },
    eq(column: string, value: unknown) { state.filters[column] = value; return builder; },
    maybeSingle: async () => answer(),
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(answer()).then(resolve, reject); },
  };
  return builder;
}

const storage = {
  from() {
    return {
      async upload(path: string, _body: unknown, opts?: { contentType?: string }) {
        uploads.push({ path, contentType: opts?.contentType });
        return { data: { path }, error: null };
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `https://files.example.test/shows/${path}` } };
      },
    };
  },
};

mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("@/lib/auth", { namedExports: { requireUser: async () => ({ id: "owner" }), ownedAct: async () => act } });
mock.module("@/lib/supabase/server", { namedExports: { supabaseServer: async () => ({ from }), supabaseAdmin: () => ({ from, storage }) } });

const { markShow, removeShow, uploadShowPhoto } = await import("@/app/actions/shows");

const reset = () => {
  act = { id: "act-1", slug: "gutter-hymns" };
  shows = [
    { id: OWN_SHOW, run_id: "run-1" },
    { id: THEIR_SHOW, run_id: "run-2" },
  ];
  runs = [
    { id: "run-1", slug: "winter", act_id: "act-1" },
    { id: "run-2", slug: "their-tour", act_id: "act-2" },
  ];
  ops = [];
  uploads = [];
  updateError = null;
};

const photoForm = (showId: string) => {
  const form = new FormData();
  form.set("show_id", showId);
  form.set("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "night.jpg", { type: "image/jpeg" }));
  return form;
};

// ---------------------------------------------------------------
// 1. Ownership is proven through the run, not the public shows table.
// ---------------------------------------------------------------

test("a show on somebody else's run is refused, though the row reads back fine", async () => {
  reset();
  const found = shows.find((s) => s.id === THEIR_SHOW);
  assert.ok(found, "the show is readable: that is the point, and why reading it proves nothing");

  const marked = await markShow(THEIR_SHOW, { played: true });
  assert.equal(marked.ok, false);
  assert.equal(marked.error, "That show is not on this account.");

  const removed = await removeShow(THEIR_SHOW);
  assert.equal(removed.ok, false);

  assert.deepEqual(ops, [], "nothing was written on a run this account does not own");
});

test("the run is read under the act this account owns, and that is the whole proof", async () => {
  reset();
  const result = await markShow(OWN_SHOW, { played: true });
  assert.equal(result.ok, true);
  assert.deepEqual(ops.map((o) => [o.table, o.verb]), [["shows", "update"]]);
});

test("no act on the account changes nothing, whatever the show id is", async () => {
  reset();
  act = { id: "act-none", slug: "nobody" };
  assert.equal((await markShow(OWN_SHOW, { played: true })).ok, false);
  assert.equal((await removeShow(OWN_SHOW)).ok, false);
  assert.deepEqual(ops, []);
});

test("an id that is not a show id is refused before the account is read", async () => {
  reset();
  assert.equal((await markShow("", { played: true })).ok, false);
  assert.equal((await markShow("' or true --", { played: true })).ok, false);
  assert.deepEqual(ops, []);
});

test("a show whose run is gone is refused", async () => {
  reset();
  runs = [];
  assert.equal((await removeShow(OWN_SHOW)).ok, false);
  assert.deepEqual(ops, []);
});

// ---------------------------------------------------------------
// 2. markShow writes two keys and no others.
// ---------------------------------------------------------------

test("played and attendance are the whole patch", async () => {
  reset();
  assert.equal((await markShow(OWN_SHOW, { played: true })).ok, true);
  assert.deepEqual(ops[0].payload, { played: true });

  ops = [];
  assert.equal((await markShow(OWN_SHOW, { attendance: 240 })).ok, true);
  assert.deepEqual(ops[0].payload, { attendance: 240 });

  ops = [];
  assert.equal((await markShow(OWN_SHOW, { attendance: null })).ok, true);
  assert.deepEqual(ops[0].payload, { attendance: null }, "clearing the number is a change, not an empty patch");

  ops = [];
  assert.equal((await markShow(OWN_SHOW, { played: false, attendance: 12 })).ok, true);
  assert.deepEqual(ops[0].payload, { played: false, attendance: 12 });
  assert.deepEqual(ops[0].filters, { id: OWN_SHOW });
});

test("any other key is refused, and the allowed keys beside it are not saved either", async () => {
  reset();
  for (const patch of [
    { run_id: "run-2" },
    { photo_url: "https://elsewhere.example.test/x.jpg" },
    { played_on: "1999-01-01" },
    { id: THEIR_SHOW },
    { played: true, run_id: "run-2" },
  ]) {
    const result = await markShow(OWN_SHOW, patch as never);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(result.error, "That change is not allowed.");
  }
  assert.deepEqual(ops, [], "not one of them reached the row");
});

test("an empty patch writes nothing", async () => {
  reset();
  const result = await markShow(OWN_SHOW, {});
  assert.equal(result.ok, false);
  assert.deepEqual(ops, []);
});

test("attendance is still a whole number in range", async () => {
  reset();
  for (const bad of [12.5, -1, 2_000_000, "240"]) {
    const result = await markShow(OWN_SHOW, { attendance: bad } as never);
    assert.equal(result.ok, false, String(bad));
  }
  assert.deepEqual(ops, []);
});

test("what the database refuses is said in words", async () => {
  reset();
  updateError = { message: "nope" };
  const result = await markShow(OWN_SHOW, { played: true });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /did not save/);
});

// ---------------------------------------------------------------
// 3. The photo goes nowhere until ownership is settled.
// ---------------------------------------------------------------

test("a photo for somebody else's show never reaches the bucket", async () => {
  reset();
  const result = await uploadShowPhoto({ ok: false }, photoForm(THEIR_SHOW));
  assert.equal(result.ok, false);
  assert.equal(result.error, "That show is not on this account.");
  assert.deepEqual(uploads, [], "the service role was never handed the file");
  assert.deepEqual(ops, []);
});

test("nor does one for a show id that names nothing", async () => {
  reset();
  assert.equal((await uploadShowPhoto({ ok: false }, photoForm("not-a-uuid"))).ok, false);
  assert.deepEqual(uploads, []);
});

test("the owner's photo uploads under the run the account owns, and the row takes the address", async () => {
  reset();
  const result = await uploadShowPhoto({ ok: false }, photoForm(OWN_SHOW));
  assert.equal(result.ok, true);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].path, new RegExp(`^run-1/${OWN_SHOW}-\\d+\\.jpg$`));
  assert.equal(uploads[0].contentType, "image/jpeg");
  assert.deepEqual(ops.map((o) => [o.table, o.verb]), [["shows", "update"]]);
  assert.deepEqual(ops[0].payload, { photo_url: `https://files.example.test/shows/${uploads[0].path}` });
});
