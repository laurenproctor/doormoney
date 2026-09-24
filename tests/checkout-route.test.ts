/*
  Starting a payment: which fundraiser it is for, and whether it may start at all.

  One organizer, Gutter Hymns, with two fundraisers open at once. "Winter residency" (B) has the
  later start date, so it is the one the old code meant by "the current fundraiser". "Fall run" (A)
  is the one the fan is looking at. Before this branch a backing made from A's widget was written
  to B. Every test here is a way that could happen, or a way the fix could break what already works.

  The second half is who may hold an option at all (migration 0064): the honeypot, the four
  limits the database answers with a word (60 attempts per address and 30 per option in ten
  minutes, 25 open holds per address, 2 per email; loose on the address because a show shares
  one, tight on the email because one buyer is one email), the one sentence the route says for
  all of them, and the hold ending with the Stripe session.

  Nothing talks to Postgres or Stripe. The database is a small in-memory stand-in that records
  every write, and the two Stripe calls record what they were asked to create. The hold decision
  is the database's (begin_lot_purchase_limited), so here it is an answer the test sets:
  supabase/tests/checkout_holds_test.sql is where the counting itself is proved.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type Stripe from "stripe";

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
/** What begin_lot_purchase_limited answers next: a hold, or one of its words. */
let holdAnswer: { purchase_id: string | null; refusal: string | null } = { purchase_id: "purchase-1", refusal: null };
/** The purchases the stand-in database holds, as the webhook reads them back (with the lot joined). */
type PurchaseRow = { id: string; lot_id: string; payment_status: string; lots: { mode: string; winner_bid_id: string | null; run_id: string } };
let purchases: PurchaseRow[] = [];
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
    if (table === "purchases") return purchases.filter((r) => s.filters.id === undefined || r.id === s.filters.id);
    return [];
  };
  const settle = () => {
    if (s.verb !== "select") {
      writes.push({ table, verb: s.verb, payload: s.payload, filters: s.filters });
      if (table === "purchases" && s.verb === "delete") purchases = purchases.filter((r) => !(r.id === s.filters.id && r.payment_status === s.filters.payment_status));
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
/**
 * begin_lot_purchase_limited, as far as the route can see it: one row, a purchase id or a word.
 * A hold that is granted is written into the stand-in's purchases, the way the real one would be
 * found by the webhook afterwards.
 */
function rpc(fn: string, args: Record<string, unknown>) {
  rpcs.push({ fn, args });
  const answer = () => {
    if (fn !== "begin_lot_purchase_limited") return { data: null, error: null };
    if (holdAnswer.purchase_id) {
      const lotId = String(args.p_lot_id);
      const runId = lotId === LOT_A ? A : lotId === LOT_B ? B : THEATER;
      purchases.push({ id: holdAnswer.purchase_id, lot_id: lotId, payment_status: "requires_payment", lots: { mode: "fixed", winner_bid_id: null, run_id: runId } });
    }
    return { data: { ...holdAnswer }, error: null };
  };
  return {
    maybeSingle: async () => answer(),
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(answer()).then(resolve, reject); },
  };
}
const admin = { from, rpc };

mock.module("@/lib/supabase/server", { namedExports: { supabaseAdmin: () => admin, supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) } });
mock.module("@/lib/patrons", { namedExports: { patronFor: async () => "patron-1", payingProfileId: () => null } });
mock.module("@/lib/stripe", { namedExports: {
  stripe: {},
  stripeConfigured: () => true,
  CHECKOUT_MINUTES: 30,
  createBackingIntent: async (params: Record<string, unknown>) => { intents.push(params); return { id: "pi_test", client_secret: "pi_secret" }; },
  createLotCheckoutSession: async (params: Record<string, unknown>) => { sessions.push(params); return { id: "cs_test", client_secret: "cs_secret" }; },
  transferSliceToAct: async () => ({}), customerForPatron: async () => "cus", createBidSetupIntent: async () => ({}), chargeSavedCard: async () => ({}),
} });

const { POST } = await import("@/app/api/checkout/route");

const post = (body: Record<string, unknown>) => POST(new Request("http://localhost/api/checkout", { method: "POST", body: JSON.stringify(body) }));
const backing = (extra: Record<string, unknown>) => post({ kind: "backing", slug: ACT.slug, tier: "thank_you", displayName: "Dana", email: "dana@example.com", ...extra });
const lot = (lotId: string) => post({ kind: "lot", lotId, patronName: "Kettle St. Coffee", email: "owner@kettle.example" });
const restoreKey = () => { if (secretKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = secretKey; };
const reset = () => { resetRuns(); resetPolicies(); writes = []; rpcs = []; intents = []; sessions = []; purchases = []; holdAnswer = { purchase_id: "purchase-1", refusal: null }; restoreKey(); };
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
  assert.equal(rpcs[0].fn, "begin_lot_purchase_limited");
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

// ---------------------------------------------------------------
// Who may hold an option (migration 0064)
// ---------------------------------------------------------------

const { applyStripeEvent } = await import("@/lib/stripeEvents");
const { CHECKOUT_LIMIT_REACHED } = await import("@/lib/auctions");
const { CHECKOUT_MINUTES: FLOOR, CHECKOUT_GRACE_MINUTES } = await import("@/lib/checkout-hold");

const held = () => rpcs.filter((r) => r.fn === "begin_lot_purchase_limited");
/** A lot checkout from a given address, the way Vercel hands the address to the route. */
const lotFrom = (ip: string, body: Record<string, unknown> = {}) =>
  POST(new Request("http://localhost/api/checkout", { method: "POST", headers: { "x-real-ip": ip }, body: JSON.stringify({ kind: "lot", lotId: LOT_A, patronName: "Kettle St. Coffee", email: "Owner@Kettle.example", ...body }) }));

test("a filled honeypot is refused before anything is read, written or held", async () => {
  reset();
  const res = await lotFrom("203.0.113.1", { website: "https://spam.example" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "That did not go through.");
  assert.deepEqual(held(), [], "nothing was held");
  assert.deepEqual(writes, [], "nothing was written");
  assert.deepEqual(sessions, [], "and Stripe was not asked for a session");
});

test("an empty honeypot is what every person sends, and changes nothing", async () => {
  reset();
  assert.equal((await lotFrom("203.0.113.1", { website: "" })).status, 200);
  assert.equal(held().length, 1);
});

test("the normal path: the hold is asked for from this address and this email, and made", async () => {
  reset();
  const before = Date.now();
  const res = await lotFrom("203.0.113.7");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { clientSecret: "cs_secret" });
  const [call] = held();
  assert.equal(call.args.p_client_ip, "203.0.113.7", "the address the platform reported");
  assert.equal(call.args.p_email, "owner@kettle.example", "the email, lower-cased, so capitals are not a second buyer");
  assert.equal(call.args.p_lot_id, LOT_A);
  assert.equal(call.args.p_amount_cents, 120000);
  assert.equal(call.args.p_bid_id, null);
  assert.equal(purchases.length, 1, "the purchase exists");
  assert.ok(writes.some((w) => w.table === "purchases" && w.verb === "update" && w.payload?.stripe_checkout_session_id === "cs_test"), "and carries its session");
  // The hold ends with the session: Stripe's floor plus a minute, and the database's own clearing
  // a short grace after that, for the webhook of a payment made in the last seconds.
  const expiresAt = (sessions[0].expiresAt as Date).getTime();
  const holdUntil = new Date(String(call.args.p_expires_at)).getTime();
  assert.ok(expiresAt >= before + (FLOOR + 1) * 60_000 - 5 && expiresAt <= Date.now() + (FLOOR + 1) * 60_000 + 5, "the session is asked to end thirty-one minutes out");
  assert.equal(holdUntil - expiresAt, CHECKOUT_GRACE_MINUTES * 60_000, "and the hold outlives it by the grace alone");
});

test("with no address header every request is one place, which is what a limit does when it cannot tell callers apart", async () => {
  reset();
  await lot(LOT_A);
  assert.equal(held()[0].args.p_client_ip, "unknown");
  reset();
  await POST(new Request("http://localhost/api/checkout", { method: "POST", headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" }, body: JSON.stringify({ kind: "lot", lotId: LOT_A, patronName: "K", email: "k@example.com" }) }));
  assert.equal(held()[0].args.p_client_ip, "198.51.100.4", "the first forwarded address when that is all there is");
});

for (const [word, limit] of [["too_many_from_ip", "the per-address attempt limit (60 in ten minutes)"], ["too_many_on_lot", "the per-option attempt limit (30 in ten minutes)"], ["too_many_holds_ip", "the open-hold cap for an address (25)"], ["too_many_holds_email", "the open-hold cap for an email (2)"]] as const) {
  test(`${limit}: refused in one plain sentence, with nothing held and no session made`, async () => {
    reset();
    holdAnswer = { purchase_id: null, refusal: word };
    const res = await lotFrom("203.0.113.9");
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.error, CHECKOUT_LIMIT_REACHED);
    assert.equal(body.error, "Too many tries from here. Try again in a few minutes.");
    assert.doesNotMatch(body.error, /—/, "no em dash");
    assert.doesNotMatch(JSON.stringify(body), /ip|lot|email|limit/i, "and never which limit it was");
    assert.equal(purchases.length, 0, "nothing was held");
    assert.deepEqual(sessions, [], "and Stripe was not asked for a session");
  });
}

test("a refusal from begin_lot_purchase still comes back as its own sentence, through the same call", async () => {
  reset();
  holdAnswer = { purchase_id: null, refusal: "spot_being_taken" };
  const res = await lotFrom("203.0.113.9");
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Someone is taking that spot/);
});

test("an expired session releases its hold through the webhook: the purchase goes and the option is open again", async () => {
  reset();
  await lotFrom("203.0.113.7");
  const asked = sessions[0];
  assert.equal(purchases[0].payment_status, "requires_payment");
  const session = {
    id: "cs_test", payment_status: "unpaid",
    metadata: { kind: "lot", purchase_id: asked.purchaseId, lot_id: asked.lotId, run_id: asked.runId, act_id: ACT.id, act_slug: ACT.slug },
  } as unknown as Stripe.Checkout.Session;
  const event = { id: "evt_expired_1", type: "checkout.session.expired", data: { object: session } } as unknown as Stripe.Event;
  writes = [];
  assert.equal(await applyStripeEvent(admin as never, event), "processed");
  assert.equal(purchases.length, 0, "the purchase is gone");
  const reopened = writes.find((w) => w.table === "lots" && w.verb === "update");
  assert.ok(reopened, "the lot was written");
  assert.deepEqual(reopened!.payload, { status: "open", funding_deadline: null });
  assert.deepEqual(reopened!.filters, { id: LOT_A, status: "pending_funding" }, "and only out of the hold this session put on it");
});

test("and a second expiry for the same session finds nothing to release, and says so without touching the lot", async () => {
  reset();
  await lotFrom("203.0.113.7");
  const asked = sessions[0];
  const session = { id: "cs_test", metadata: { kind: "lot", purchase_id: asked.purchaseId, lot_id: asked.lotId, run_id: asked.runId } } as unknown as Stripe.Checkout.Session;
  const event = { id: "evt_expired_2", type: "checkout.session.expired", data: { object: session } } as unknown as Stripe.Event;
  await applyStripeEvent(admin as never, event);
  writes = [];
  assert.equal(await applyStripeEvent(admin as never, event), "processed");
  assert.deepEqual(writes, []);
});
