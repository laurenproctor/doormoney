/*
  Placing a bid: the card behind it, and whether the category may take one at all.

  The setup route stores a card and asks the payment gate, and the action used to trust that the
  route had run: setupIntentId was optional with Stripe configured, and the action never asked the
  gate itself. A caller of the action could place a bid with no card behind it, on a category whose
  payments are not open. Every test here is one way in, or the ordinary path that has to keep
  working.

  Nothing talks to Postgres or Stripe. The database is a small in-memory stand-in that records
  every write and every rpc, and Stripe is a map of SetupIntents by id.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";

const LOT = "10000000-0000-4000-8000-00000000000a";
const OTHER_LOT = "10000000-0000-4000-8000-00000000000b";
const HOSPITALITY_LOT = "10000000-0000-4000-8000-00000000000c";
const PATRON = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_PATRON = "aaaaaaaa-0000-4000-8000-000000000002";

const lots = [
  { id: LOT, price_cents: 45000, runs: { slug: "fall-run", category_key: "music", acts: { slug: "gutter-hymns" } } },
  { id: OTHER_LOT, price_cents: 35000, runs: { slug: "fall-run", category_key: "music", acts: { slug: "gutter-hymns" } } },
  { id: HOSPITALITY_LOT, price_cents: 20000, runs: { slug: "dinner-series", category_key: "hospitality", acts: { slug: "the-counter" } } },
];
/** delivery_policies, as production has them: music switched on, hospitality with no row at all. */
const policies = [{ category_key: "music", version: 1, status: "active" }];

type Intent = { status: string; payment_method: string | null; customer: string; metadata: Record<string, string> };
const ours = (over: Partial<Intent> = {}): Intent => ({ status: "succeeded", payment_method: "pm_1", customer: "cus_1", metadata: { kind: "bid", lot_id: LOT, patron_id: PATRON }, ...over });
const intents: Record<string, Intent> = {
  seti_ok: ours(),
  seti_pending: ours({ status: "requires_payment_method", payment_method: null }),
  seti_other_lot: ours({ metadata: { kind: "bid", lot_id: OTHER_LOT, patron_id: PATRON } }),
  seti_other_patron: ours({ customer: "cus_2", metadata: { kind: "bid", lot_id: LOT, patron_id: OTHER_PATRON } }),
  seti_used: ours(),
  seti_unmarked: ours({ metadata: {} }),
};
/** SetupIntents that already sit on a bid row. */
let usedIntents: string[] = [];

type Write = { table: string; verb: string; payload?: Record<string, unknown> };
let writes: Write[] = [];
let rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let retrieved: string[] = [];
let patronCalls = 0;
let stripeOn = true;

function from(table: string) {
  const s: { verb: string; payload?: Record<string, unknown>; filters: Record<string, unknown> } = { verb: "select", filters: {} };
  const rows = () => {
    if (table === "lots") return lots.filter((l) => l.id === s.filters.id);
    if (table === "delivery_policies") return policies.filter((p) => p.category_key === s.filters.category_key);
    if (table === "patrons") return s.filters.id === PATRON ? [{ stripe_customer_id: "cus_1" }] : [];
    if (table === "bids") return usedIntents.includes(String(s.filters.stripe_setup_intent_id)) ? [{ id: "bid-old" }] : [];
    return [];
  };
  const settle = () => {
    if (s.verb !== "select") {
      writes.push({ table, verb: s.verb, payload: s.payload });
      return { data: null, error: null };
    }
    return { data: rows(), error: null };
  };
  const b = {
    select() { return b; },
    insert(payload: Record<string, unknown>) { s.verb = "insert"; s.payload = payload; return b; },
    update(payload: Record<string, unknown>) { s.verb = "update"; s.payload = payload; return b; },
    eq(k: string, v: unknown) { s.filters[k] = v; return b; },
    is() { return b; },
    limit() { return b; },
    maybeSingle: async () => { const r = settle(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }; },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(settle()).then(resolve, reject); },
  };
  return b;
}
const admin = {
  from,
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcs.push({ fn, args });
    return { data: [{ bid_id: "bid-new", next_minimum_cents: 50000 }], error: null };
  },
};

mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("@/lib/supabase/server", { namedExports: { supabaseAdmin: () => admin, supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) } });
mock.module("@/lib/patrons", { namedExports: { patronFor: async () => { patronCalls += 1; return PATRON; }, payingProfileId: () => null } });
mock.module("@/lib/auctions", { namedExports: { bidRefusalMessage: (reason: string) => reason, minimumBidCents: () => 0, notifyOutbid: async () => {} } });
mock.module("@/lib/stripe", { namedExports: {
  stripe: { setupIntents: { retrieve: async (id: string) => { retrieved.push(id); const i = intents[id]; if (!i) throw new Error(`No such setupintent: ${id}`); return i; } } },
  stripeConfigured: () => stripeOn,
} });

const { placeBid } = await import("@/app/actions/bids");
const { cardlessBidsAllowed } = await import("@/lib/payment-gate");

/** Next types NODE_ENV read-only; the tests below set it on purpose and put it back. */
const processEnv = process.env as Record<string, string | undefined>;
const env = { NODE_ENV: processEnv.NODE_ENV, VERCEL_ENV: processEnv.VERCEL_ENV };
const restoreEnv = () => {
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete processEnv[k]; else processEnv[k] = v; }
};
const reset = () => { writes = []; rpcs = []; retrieved = []; patronCalls = 0; stripeOn = true; usedIntents = ["seti_used"]; restoreEnv(); delete processEnv.VERCEL_ENV; processEnv.NODE_ENV = "test"; };
const bid = (extra: Record<string, unknown> = {}) => placeBid({ lotId: LOT, amountCents: 45000, patronName: "Kettle St. Coffee", email: "owner@kettle.example", ...extra });
const refused = (r: Awaited<ReturnType<typeof placeBid>>) => { assert.equal(r.ok, false); return r.ok ? "" : r.error; };
const nothingPlaced = () => assert.equal(rpcs.length, 0, "place_bid was not called");


// ---------------------------------------------------------------
// The card behind the bid
// ---------------------------------------------------------------

test("with Stripe configured, a bid with no SetupIntent is refused before anything is written", async () => {
  reset();
  const error = refused(await bid());
  assert.match(error, /needs a saved card/);
  nothingPlaced();
  assert.equal(writes.length, 0);
  assert.equal(patronCalls, 0, "not even the patron row");
});

test("a SetupIntent that has not succeeded is refused", async () => {
  reset();
  const error = refused(await bid({ setupIntentId: "seti_pending" }));
  assert.match(error, /card was not saved/);
  nothingPlaced();
});

test("a SetupIntent Stripe does not know is refused the same way", async () => {
  reset();
  refused(await bid({ setupIntentId: "seti_missing" }));
  assert.deepEqual(retrieved, ["seti_missing"]);
  nothingPlaced();
});

test("a SetupIntent stored for another spot is refused", async () => {
  reset();
  const error = refused(await bid({ setupIntentId: "seti_other_lot" }));
  assert.match(error, /not on this bid/);
  nothingPlaced();
});

test("a SetupIntent stored for another bidder is refused", async () => {
  reset();
  const error = refused(await bid({ setupIntentId: "seti_other_patron" }));
  assert.match(error, /not on this bid/);
  nothingPlaced();
});

test("a SetupIntent the setup route did not create, with no metadata tying it to a bid, is refused", async () => {
  reset();
  refused(await bid({ setupIntentId: "seti_unmarked" }));
  nothingPlaced();
});

test("a SetupIntent that already backs a bid is refused", async () => {
  reset();
  const error = refused(await bid({ setupIntentId: "seti_used" }));
  assert.match(error, /already backs a bid/);
  nothingPlaced();
});


// ---------------------------------------------------------------
// The payment gate, on this door as well as the setup route's
// ---------------------------------------------------------------

test("a category whose payments are not open takes no bid, and nothing is written", async () => {
  reset();
  const error = refused(await bid({ lotId: HOSPITALITY_LOT, setupIntentId: "seti_ok" }));
  assert.match(error, /Payments are not open/);
  nothingPlaced();
  assert.equal(writes.length, 0);
  assert.equal(patronCalls, 0, "the patron row is a write, and it comes after the gate");
  assert.equal(retrieved.length, 0, "Stripe was never asked");
});

test("the gate is asked on the cardless path too", async () => {
  reset();
  stripeOn = false;
  refused(await bid({ lotId: HOSPITALITY_LOT }));
  nothingPlaced();
  assert.equal(patronCalls, 0);
});


// ---------------------------------------------------------------
// The paths that have to keep working
// ---------------------------------------------------------------

test("a confirmed card stored for this lot and this bidder places the bid with the card on it", async () => {
  reset();
  const r = await bid({ setupIntentId: "seti_ok" });
  assert.equal(r.ok, true);
  assert.equal(rpcs.length, 1);
  assert.equal(rpcs[0].fn, "place_bid");
  assert.equal(rpcs[0].args.p_lot_id, LOT);
  assert.equal(rpcs[0].args.p_patron_id, PATRON);
  assert.equal(rpcs[0].args.p_amount_cents, 45000);
  assert.equal(rpcs[0].args.p_payment_method_id, "pm_1", "the payment method Stripe reported, not one the browser sent");
  assert.equal(rpcs[0].args.p_setup_intent_id, "seti_ok");
  if (r.ok) assert.equal(r.nextMinimumCents, 50000);
});

test("without Stripe, outside production, a bid goes in with no card, as the sample fundraisers need", async () => {
  reset();
  stripeOn = false;
  const r = await bid();
  assert.equal(r.ok, true);
  assert.equal(rpcs[0].args.p_payment_method_id, null);
  assert.equal(rpcs[0].args.p_setup_intent_id, null);
});

test("without Stripe, a production build refuses the bid rather than taking it unbacked", async () => {
  reset();
  stripeOn = false;
  processEnv.NODE_ENV = "production";
  const error = refused(await bid());
  assert.match(error, /unavailable right now/);
  nothingPlaced();
  restoreEnv();
});

test("the cardless path is closed on any Vercel deployment and on any production build", () => {
  assert.equal(cardlessBidsAllowed({ NODE_ENV: "development" }), true);
  assert.equal(cardlessBidsAllowed({ NODE_ENV: "test" }), true);
  assert.equal(cardlessBidsAllowed({}), true);
  assert.equal(cardlessBidsAllowed({ NODE_ENV: "production" }), false);
  assert.equal(cardlessBidsAllowed({ NODE_ENV: "development", VERCEL_ENV: "preview" }), false);
  assert.equal(cardlessBidsAllowed({ VERCEL_ENV: "production" }), false);
});
