/*
  Starting a payment: which fundraiser it is for, and whether it may start at all.

  One organizer, Gutter Hymns, with two fundraisers open at once. "Winter residency" (B) has the
  later start date, so it is the one the old code meant by "the current fundraiser". "Fall run" (A)
  is the one the fan is looking at. Before this branch a backing made from A's widget was written
  to B. Every test here is a way that could happen, or a way the fix could break what already works.

  Nothing talks to Postgres or Stripe. The database is a small in-memory stand-in that records
  every write, and the two Stripe calls record what they were asked to create.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";

const ACT = { id: "ac000000-0000-4000-8000-000000000001", slug: "gutter-hymns", name: "Gutter Hymns" };
const OTHER_ACT = { id: "ac000000-0000-4000-8000-000000000002", slug: "second-stage", name: "Second Stage" };
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const CLOSED = "cccccccc-0000-4000-8000-00000000000c";
const THEATER = "dddddddd-0000-4000-8000-00000000000d";
const LOT_A = "10000000-0000-4000-8000-00000000000a";
const LOT_B = "10000000-0000-4000-8000-00000000000b";
const LOT_THEATER = "10000000-0000-4000-8000-00000000000d";

type Run = { id: string; act_id: string; slug: string; title: string; status: string; category_key: string | null; starts_on: string };
let runs: Run[] = [];
/** delivery_policies, as production has them: music switched on, theater only proposed. */
type Policy = { category_key: string; version: number; status: string };
let policies: Policy[] | "unreadable" = [];
const resetPolicies = () => { policies = [{ category_key: "music", version: 1, status: "active" }, { category_key: "theater", version: 1, status: "proposed" }]; };
const resetRuns = () => {
  runs = [
    { id: A, act_id: ACT.id, slug: "fall-run", title: "Fall run", status: "open", category_key: "music", starts_on: "2026-10-03" },
    { id: B, act_id: ACT.id, slug: "winter-residency", title: "Winter residency", status: "open", category_key: "music", starts_on: "2026-12-01" },
    { id: CLOSED, act_id: ACT.id, slug: "spring-run", title: "Spring run", status: "closed", category_key: "music", starts_on: "2026-03-01" },
    { id: THEATER, act_id: OTHER_ACT.id, slug: "winter-production", title: "Winter production", status: "open", category_key: "theater", starts_on: "2026-11-01" },
  ];
};
const lotOn = (id: string, runId: string, act: typeof ACT) => {
  const run = runs.find((r) => r.id === runId)!;
  return { id, label: null, surface_key: "kick_head", price_cents: 120000, mode: "fixed", status: "open", winner_bid_id: null, funding_token: null, funding_deadline: null, buy_now_cents: null,
    runs: { id: run.id, slug: run.slug, title: run.title, status: run.status, category_key: run.category_key, act_id: act.id, acts: act } };
};

type Write = { table: string; verb: string; payload?: Record<string, unknown>; filters: Record<string, unknown> };
let writes: Write[] = [];
let rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let intents: Record<string, unknown>[] = [];
let sessions: Record<string, unknown>[] = [];
/** Whatever key the test run started with, put back after the tests that set one. */
const secretKey: string | undefined = process.env.STRIPE_SECRET_KEY;

function from(table: string) {
  const s: { verb: string; payload?: Record<string, unknown>; filters: Record<string, unknown>; limit?: number } = { verb: "select", filters: {} };
  const rows = () => {
    if (table === "acts") return [ACT, OTHER_ACT].filter((a) => a.slug === s.filters.slug);
    if (table === "runs") {
      let out = runs.filter((r) => (s.filters.id === undefined || r.id === s.filters.id) && (s.filters.act_id === undefined || r.act_id === s.filters.act_id));
      const statuses = s.filters.status as string[] | undefined;
      if (statuses) out = out.filter((r) => statuses.includes(r.status));
      out = [...out].sort((x, y) => y.starts_on.localeCompare(x.starts_on));
      return s.limit ? out.slice(0, s.limit) : out;
    }
    if (table === "delivery_policies") return policies === "unreadable" ? [] : policies.filter((p) => p.category_key === s.filters.category_key);
    if (table === "lots") return [lotOn(LOT_A, A, ACT), lotOn(LOT_B, B, ACT), lotOn(LOT_THEATER, THEATER, OTHER_ACT)].filter((l) => l.id === s.filters.id);
    return [];
  };
  const settle = () => {
    if (s.verb !== "select") {
      writes.push({ table, verb: s.verb, payload: s.payload, filters: s.filters });
      return { data: s.verb === "insert" ? { id: `${table}-row-${writes.length}` } : null, error: null };
    }
    if (table === "delivery_policies" && policies === "unreadable") return { data: null, error: { message: "relation does not exist" } };
    return { data: rows(), error: null };
  };
  const b = {
    select() { return b; },
    insert(payload: Record<string, unknown>) { s.verb = "insert"; s.payload = payload; return b; },
    update(payload: Record<string, unknown>) { s.verb = "update"; s.payload = payload; return b; },
    delete() { s.verb = "delete"; return b; },
    eq(k: string, v: unknown) { s.filters[k] = v; return b; },
    in(k: string, v: unknown) { s.filters[k] = v; return b; },
    is() { return b; },
    order() { return b; },
    limit(n: number) { s.limit = n; return b; },
    maybeSingle: async () => { const r = settle(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }; },
    single: async () => { const r = settle(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }; },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(settle()).then(resolve, reject); },
  };
  return b;
}
const admin = { from, rpc: async (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return { data: "purchase-1", error: null }; } };

mock.module("@/lib/supabase/server", { namedExports: { supabaseAdmin: () => admin, supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) } });
mock.module("@/lib/patrons", { namedExports: { patronFor: async () => "patron-1", payingProfileId: () => null } });
mock.module("@/lib/stripe", { namedExports: {
  stripe: {},
  stripeConfigured: () => true,
  CHECKOUT_MINUTES: 30,
  createBackingIntent: async (params: Record<string, unknown>) => { intents.push(params); return { id: "pi_test", client_secret: "pi_secret" }; },
  createLotCheckoutSession: async (params: Record<string, unknown>) => { sessions.push(params); return { id: "cs_test", client_secret: "cs_secret" }; },
  retrieveIntentWithCharge: async (id: string) => ({ id, latest_charge: null }),
  transferSliceToAct: async () => ({}), customerForPatron: async () => "cus", createBidSetupIntent: async () => ({}), chargeSavedCard: async () => ({}),
} });

const { POST } = await import("@/app/api/checkout/route");

const post = (body: Record<string, unknown>) => POST(new Request("http://localhost/api/checkout", { method: "POST", body: JSON.stringify(body) }));
const backing = (extra: Record<string, unknown>) => post({ kind: "backing", slug: ACT.slug, tier: "thank_you", displayName: "Dana", email: "dana@example.com", ...extra });
const lot = (lotId: string) => post({ kind: "lot", lotId, patronName: "Kettle St. Coffee", email: "owner@kettle.example" });
const restoreKey = () => { if (secretKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = secretKey; };
const reset = () => { resetRuns(); resetPolicies(); writes = []; rpcs = []; intents = []; sessions = []; restoreKey(); };
const backingRows = () => writes.filter((w) => w.table === "backings" && w.verb === "insert").map((w) => w.payload!);


// ---------------------------------------------------------------
// Widget A cannot create a payment for fundraiser B
// ---------------------------------------------------------------

test("a backing from A's widget is written to A, though B is the organizer's current fundraiser", async () => {
  reset();
  const res = await backing({ runId: A });
  assert.equal(res.status, 200);
  assert.equal(backingRows().length, 1);
  assert.equal(backingRows()[0].run_id, A, "the row is on the fundraiser the fan was looking at");
  assert.equal(intents[0].runId, A, "and so is the payment intent's metadata");
  assert.match(String(intents[0].description), /Fall run/);
  assert.doesNotMatch(String(intents[0].description), /Winter residency/);
});

test("and a backing from B's widget is written to B", async () => {
  reset();
  await backing({ runId: B });
  assert.equal(backingRows()[0].run_id, B);
  assert.equal(intents[0].runId, B);
});

test("a fundraiser that belongs to another organizer cannot be paid through this one's widget", async () => {
  reset();
  const res = await backing({ runId: THEATER });
  assert.equal(res.status, 404);
  assert.deepEqual(writes, [], "nothing was written");
  assert.deepEqual(intents, [], "and nothing was asked of Stripe");
});

test("a closed fundraiser is closed: the backing is refused, never moved to an open one", async () => {
  reset();
  const res = await backing({ runId: CLOSED });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /closed/);
  assert.deepEqual(backingRows(), [], "the money did not drift to Fall run or Winter residency");
  assert.deepEqual(intents, []);
});

test("an id that is not an id is refused by the input check, before anything is read", async () => {
  reset();
  for (const runId of ["fall-run", "", `${A} or 1=1`, 7]) assert.equal((await backing({ runId })).status, 400);
  assert.deepEqual(writes, []);
});

// ---------------------------------------------------------------
// The compatibility path
// ---------------------------------------------------------------

test("a page loaded before exact widgets sends no fundraiser, and is refused when there are two to confuse", async () => {
  reset();
  const res = await backing({});
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Reload/);
  assert.deepEqual(writes, [], "no guess was made about which one was meant");
});

test("with exactly one fundraiser open there is nothing to confuse, so the old request still works", async () => {
  reset();
  runs = runs.filter((r) => r.id !== B);
  const res = await backing({});
  assert.equal(res.status, 200);
  assert.equal(backingRows()[0].run_id, A);
  assert.equal(intents[0].runId, A, "and it names its fundraiser from here on, like any other");
});

test("with none open the old request is told the fundraiser is closed, as before", async () => {
  reset();
  runs = runs.filter((r) => r.status !== "open" || r.act_id !== ACT.id);
  assert.equal((await backing({})).status, 400);
});

// ---------------------------------------------------------------
// Backings stay music's, and stay apart from sponsorships
// ---------------------------------------------------------------

test("the widget's backing tiers are never sold on a fundraiser outside music", async () => {
  reset();
  const res = await post({ kind: "backing", slug: OTHER_ACT.slug, runId: THEATER, tier: "merch_card", displayName: "Dana", email: "dana@example.com" });
  assert.equal(res.status, 400);
  assert.deepEqual(writes, []);
});

test("a backing writes a backing and a sponsorship writes a purchase, and neither touches the other's table", async () => {
  reset();
  await backing({ runId: A });
  assert.deepEqual([...new Set(writes.map((w) => w.table))], ["backings"]);
  assert.equal(rpcs.length, 0, "no lot was held for a backing");

  reset();
  await lot(LOT_A);
  assert.equal(rpcs[0].fn, "begin_lot_purchase");
  assert.equal(writes.some((w) => w.table === "backings"), false);
});

// ---------------------------------------------------------------
// A sponsorship names its fundraiser too, and the money math is untouched
// ---------------------------------------------------------------

test("a lot checkout carries the exact fundraiser the lot is on, and returns to that fundraiser's page", async () => {
  reset();
  await lot(LOT_A);
  assert.equal(sessions[0].runId, A);
  assert.match(String(sessions[0].returnUrl), /\/gutter-hymns\/support-fall-run\?paid=\{CHECKOUT_SESSION_ID\}$/);

  reset();
  await lot(LOT_B);
  assert.equal(sessions[0].runId, B, "a lot on B is a payment for B, under the same organizer");
  assert.match(String(sessions[0].returnUrl), /\/gutter-hymns\/support-winter-residency\?paid=/);
});

test("the fee is what it was: fifteen percent, worked out the same way, on both kinds", async () => {
  reset();
  await lot(LOT_A);
  assert.equal(rpcs[0].args.p_amount_cents, 120000);
  assert.equal(rpcs[0].args.p_fee_cents, 18000);
  await backing({ runId: A });
  assert.equal(backingRows()[0].amount_cents, 2500);
  assert.equal(backingRows()[0].fee_cents, 375);
});

// ---------------------------------------------------------------
// No live money for a category with no delivery policy
// ---------------------------------------------------------------

test("a theater sponsorship can be checked out in test mode, which is how it is verified", async () => {
  reset();
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  const res = await lot(LOT_THEATER);
  assert.equal(res.status, 200);
  assert.equal(sessions[0].runId, THEATER);
});

test("with a live key it is refused before a purchase is made or a lot is held", async () => {
  reset();
  process.env.STRIPE_SECRET_KEY = "sk_live_abc";
  const res = await lot(LOT_THEATER);
  assert.equal(res.status, 403);
  assert.deepEqual(rpcs, [], "begin_lot_purchase was never called, so nothing was held");
  assert.deepEqual(sessions, []);
  assert.deepEqual(writes, []);
});

test("and a live key changes nothing for music", async () => {
  reset();
  process.env.STRIPE_SECRET_KEY = "sk_live_abc";
  assert.equal((await lot(LOT_A)).status, 200);
  assert.equal((await backing({ runId: A })).status, 200);
  assert.equal(sessions[0].runId, A);
  assert.equal(backingRows()[0].run_id, A);
  restoreKey();
});

// ---------------------------------------------------------------
// The switch is the category's delivery policy
// ---------------------------------------------------------------

test("switching theater's policy to active is what opens it for live money, and nothing else does", async () => {
  reset();
  process.env.STRIPE_SECRET_KEY = "sk_live_abc";
  assert.equal((await lot(LOT_THEATER)).status, 403, "proposed: refused");
  policies = [{ category_key: "music", version: 1, status: "active" }, { category_key: "theater", version: 1, status: "active" }];
  const res = await lot(LOT_THEATER);
  assert.equal(res.status, 200, "active: open");
  assert.equal(sessions[0].runId, THEATER);
  restoreKey();
});

test("a draft of a later version never closes a category that is switched on", async () => {
  reset();
  process.env.STRIPE_SECRET_KEY = "sk_live_abc";
  // Music version 2 is being drafted beside the active version 1. Live music checkout carries on.
  policies = [{ category_key: "music", version: 1, status: "active" }, { category_key: "music", version: 2, status: "proposed" }];
  assert.equal((await lot(LOT_A)).status, 200);
  assert.equal((await backing({ runId: A })).status, 200);
  restoreKey();
});

test("a category with no usable policy takes nothing, in either mode", async () => {
  for (const key of ["sk_test_abc", "sk_live_abc"]) {
    reset();
    process.env.STRIPE_SECRET_KEY = key;
    policies = [{ category_key: "music", version: 1, status: "active" }, { category_key: "theater", version: 1, status: "retired" }];
    assert.equal((await lot(LOT_THEATER)).status, 403, key);
    assert.deepEqual(rpcs, [], "nothing was held");
  }
  restoreKey();
});

test("when the policies cannot be read, music stays open and nothing else opens for live money", async () => {
  reset();
  policies = "unreadable";
  process.env.STRIPE_SECRET_KEY = "sk_live_abc";
  assert.equal((await lot(LOT_A)).status, 200, "a database hiccup does not close music");
  assert.equal((await lot(LOT_THEATER)).status, 403, "and does not open theater");
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  assert.equal((await lot(LOT_THEATER)).status, 200, "test mode still verifies it");
  restoreKey();
});
