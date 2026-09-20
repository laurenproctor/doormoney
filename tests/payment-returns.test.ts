/*
  Coming back from a payment, and what Stripe is told when one starts.

  The ids in an address bar can be edited, and two fundraisers by one organizer share everything in
  the address except their own word. So: a checkout session for "Fall run" (A) pasted onto "Winter
  residency" (B)'s page, under the same organizer, must show nothing. Before this branch it showed
  "paid", because the check compared the organizer's address.

  The real src/lib/stripe.ts and src/lib/payment-returns.ts run here. The Stripe SDK's network calls
  are replaced on the client object itself, so what is asserted is the exact parameters Door Money
  would have sent.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const LOT_A = "10000000-0000-4000-8000-00000000000a";
const LOT_B = "10000000-0000-4000-8000-00000000000b";
const ORGANIZER = { act_id: "ac000000-0000-4000-8000-000000000001", act_slug: "gutter-hymns" };

process.env.STRIPE_SECRET_KEY = "sk_test_returns";

/** lots.run_id, which is all the legacy path reads. */
let lotLookups: string[] = [];
mock.module("@/lib/supabase/server", { namedExports: {
  supabaseAdmin: () => ({}),
  supabaseServer: async () => ({
    from: () => {
      let id = "";
      const b = { select: () => b, eq: (_k: string, v: string) => { id = v; return b; }, maybeSingle: async () => { lotLookups.push(id); return { data: id === LOT_A ? { run_id: A } : id === LOT_B ? { run_id: B } : null, error: null }; } };
      return b;
    },
  }),
} });

const { stripe, createBackingIntent, createLotCheckoutSession, chargeSavedCard } = await import("@/lib/stripe");
const { lotPaidNotice, backingReturnNotice } = await import("@/lib/payment-returns");

type Meta = Record<string, string>;
let sessions: Record<string, { metadata: Meta; status: string; payment_status: string; amount_total: number; customer_details: { email: string } }> = {};
let intents: Record<string, { metadata: Meta; status: string; amount: number }> = {};
const created: { kind: string; params: Record<string, unknown>; options?: Record<string, unknown> }[] = [];

mock.method(stripe.checkout.sessions, "retrieve", async (id: string) => { if (!sessions[id]) throw new Error("No such checkout.session"); return sessions[id]; });
mock.method(stripe.paymentIntents, "retrieve", async (id: string) => { if (!intents[id]) throw new Error("No such payment_intent"); return intents[id]; });
mock.method(stripe.checkout.sessions, "create", async (params: Record<string, unknown>) => { created.push({ kind: "session", params }); return { id: "cs_new", client_secret: "s" }; });
mock.method(stripe.paymentIntents, "create", async (params: Record<string, unknown>, options?: Record<string, unknown>) => { created.push({ kind: "intent", params, options }); return { id: "pi_new", client_secret: "s", status: "succeeded" }; });

const paidSession = (metadata: Meta) => ({ metadata, status: "complete", payment_status: "paid", amount_total: 120000, customer_details: { email: "owner@kettle.example" } });
const reset = () => { sessions = {}; intents = {}; lotLookups = []; created.length = 0; };

// ---------------------------------------------------------------
// Return notice A cannot display as B
// ---------------------------------------------------------------

test("a sponsor who paid for A sees the notice on A's page", async () => {
  reset();
  sessions.cs_a = paidSession({ kind: "lot", lot_id: LOT_A, run_id: A, ...ORGANIZER });
  assert.deepEqual(await lotPaidNotice("cs_a", A), { kind: "paid", amount: 120000, email: "owner@kettle.example" });
  assert.deepEqual(lotLookups, [], "a session that names its fundraiser needs no lookup");
});

test("the same session on B's page, under the same organizer, shows nothing", async () => {
  reset();
  sessions.cs_a = paidSession({ kind: "lot", lot_id: LOT_A, run_id: A, ...ORGANIZER });
  // The old check was metadata.act_slug === slug, and both fundraisers live under gutter-hymns.
  assert.equal(sessions.cs_a.metadata.act_slug, "gutter-hymns");
  assert.equal(await lotPaidNotice("cs_a", B), null);
});

test("a session from before run_id was carried is matched through its lot, never through the organizer", async () => {
  reset();
  sessions.cs_old = paidSession({ kind: "lot", lot_id: LOT_A, ...ORGANIZER });
  assert.deepEqual((await lotPaidNotice("cs_old", A))?.kind, "paid");
  assert.equal(await lotPaidNotice("cs_old", B), null, "its lot is on A, so B's page says nothing");
  assert.deepEqual(lotLookups, [LOT_A, LOT_A]);

  sessions.cs_bare = paidSession({ kind: "lot", ...ORGANIZER });
  assert.equal(await lotPaidNotice("cs_bare", A), null, "and a session that names neither a fundraiser nor a lot is not acknowledged at all");
});

test("a page that does not know its own fundraiser acknowledges nothing", async () => {
  reset();
  sessions.cs_a = paidSession({ kind: "lot", lot_id: LOT_A, run_id: A, ...ORGANIZER });
  for (const unknown of [undefined, null, "", "fall-run"]) assert.equal(await lotPaidNotice("cs_a", unknown), null);
});

test("the notice keeps its existing meanings: processing, unpaid, not a lot, not a session, not found", async () => {
  reset();
  sessions.cs_async = { ...paidSession({ kind: "lot", lot_id: LOT_A, run_id: A }), payment_status: "unpaid" };
  assert.equal((await lotPaidNotice("cs_async", A))?.kind, "processing");
  sessions.cs_open = { ...paidSession({ kind: "lot", lot_id: LOT_A, run_id: A }), status: "open" };
  assert.equal(await lotPaidNotice("cs_open", A), null);
  sessions.cs_other = paidSession({ kind: "backing", run_id: A });
  assert.equal(await lotPaidNotice("cs_other", A), null);
  assert.equal(await lotPaidNotice("pi_123", A), null, "only a checkout session id is looked up");
  assert.equal(await lotPaidNotice("cs_missing", A), null, "an id Stripe does not know is not an error page");
  assert.equal(await lotPaidNotice(undefined, A), null);
});

test("a fan sent back from a redirect sees 'backed' for A's widget and nothing in B's", async () => {
  reset();
  intents.pi_a = { metadata: { kind: "backing", backing_id: "x", run_id: A, tier: "merch_card", ...ORGANIZER }, status: "succeeded", amount: 10000 };
  const params = { paymentIntent: "pi_a", redirectStatus: "succeeded" };
  assert.deepEqual(await backingReturnNotice(params, A), { label: "$100", place: "the merch table card" });
  assert.equal(await backingReturnNotice(params, B), null, "same organizer address, different fundraiser");
  assert.equal(await backingReturnNotice(params, null), null);
});

test("a backing return names its fundraiser or shows nothing: there is no organizer fallback", async () => {
  reset();
  intents.pi_bare = { metadata: { kind: "backing", backing_id: "x", tier: "thank_you", ...ORGANIZER }, status: "succeeded", amount: 2500 };
  assert.equal(await backingReturnNotice({ paymentIntent: "pi_bare", redirectStatus: "succeeded" }, A), null);
  intents.pi_lot = { metadata: { kind: "lot", run_id: A }, status: "succeeded", amount: 2500 };
  assert.equal(await backingReturnNotice({ paymentIntent: "pi_lot", redirectStatus: "succeeded" }, A), null, "a sponsorship is not a backing");
  intents.pi_failed = { metadata: { kind: "backing", run_id: A, tier: "thank_you" }, status: "requires_payment_method", amount: 2500 };
  assert.equal(await backingReturnNotice({ paymentIntent: "pi_failed", redirectStatus: "succeeded" }, A), null, "the address bar saying succeeded is not Stripe saying it");
  assert.equal(await backingReturnNotice({ paymentIntent: "pi_failed", redirectStatus: "failed" }, A), null);
});

// ---------------------------------------------------------------
// What Stripe is told
// ---------------------------------------------------------------

test("a lot checkout names its fundraiser on the session and on the payment intent under it", async () => {
  reset();
  await createLotCheckoutSession({ purchaseId: "p1", lotId: LOT_A, runId: A, actId: ORGANIZER.act_id, actSlug: ORGANIZER.act_slug, amountCents: 120000, description: "Kick drum head, Gutter Hymns, Fall run", patronEmail: "owner@kettle.example", returnUrl: "https://x.example/gutter-hymns/support-fall-run?paid={CHECKOUT_SESSION_ID}" });
  const { params } = created[0];
  const expected = { purchase_id: "p1", lot_id: LOT_A, run_id: A, act_id: ORGANIZER.act_id, act_slug: ORGANIZER.act_slug, kind: "lot" };
  assert.deepEqual(params.metadata, expected);
  assert.deepEqual((params.payment_intent_data as { metadata: Meta }).metadata, expected, "the intent carries it too, so a refund or a dispute can be traced to one fundraiser");
  assert.equal(params.return_url, "https://x.example/gutter-hymns/support-fall-run?paid={CHECKOUT_SESSION_ID}");
});

test("the charge model is untouched: no application fee, no transfer data, the amount as given", async () => {
  reset();
  await createLotCheckoutSession({ purchaseId: "p1", lotId: LOT_A, runId: A, actId: ORGANIZER.act_id, actSlug: ORGANIZER.act_slug, amountCents: 120000, description: "d", patronEmail: "a@b.example", returnUrl: "https://x.example/?paid={CHECKOUT_SESSION_ID}" });
  await createBackingIntent({ backingId: "b1", runId: A, actId: ORGANIZER.act_id, actSlug: ORGANIZER.act_slug, tier: "thank_you", amountCents: 2500, description: "d", fanEmail: "a@b.example" });
  const text = JSON.stringify(created);
  assert.doesNotMatch(text, /application_fee|transfer_data|on_behalf_of/, "Door Money's share is still the part never transferred");
  const line = (created[0].params.line_items as { price_data: { unit_amount: number; currency: string } }[])[0];
  assert.deepEqual([line.price_data.unit_amount, line.price_data.currency], [120000, "usd"]);
  assert.deepEqual([created[1].params.amount, created[1].params.currency], [2500, "usd"]);
  assert.equal((created[1].params.metadata as Meta).run_id, A, "a backing has always named its fundraiser, and still does");
});

test("a won bid charged off-session names its fundraiser, and keeps the idempotency key that stops a double charge", async () => {
  reset();
  await chargeSavedCard({ purchaseId: "p9", lotId: LOT_B, runId: B, actId: ORGANIZER.act_id, actSlug: ORGANIZER.act_slug, customerId: "cus_1", paymentMethodId: "pm_1", amountCents: 45000, description: "d", patronEmail: "a@b.example" });
  assert.equal((created[0].params.metadata as Meta).run_id, B);
  assert.equal((created[0].params.metadata as Meta).purchase_id, "p9");
  assert.deepEqual(created[0].options, { idempotencyKey: "bid-charge-p9" });
});
