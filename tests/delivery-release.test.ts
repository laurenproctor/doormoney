/*
  A test-mode theater purchase, from payment through delivery to release, refund, or exception.

  The real src/lib/purchases.ts and src/lib/delivery.ts run here against a stand-in database that
  records every write. Two purchases sit side by side: a music one sold on its calendar and a
  theater one sold on evidence. The music one has to behave exactly as it always has.

  Nothing talks to Postgres or Stripe. The database's own rules (one payout row per deliverable,
  the materials gate, immutability, evidence privacy) are tested where they run, in
  supabase/tests/delivery_policy_test.sql.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refundDue } from "@/lib/refunds";

const ACT = { id: "ac000000-0000-4000-8000-000000000001", name: "Second Stage", slug: "second-stage", owner_id: null };
const MUSIC = "9a000000-0000-4000-8000-00000000000a";
const THEATER = "9b000000-0000-4000-8000-00000000000b";
const D1 = "d1000000-0000-4000-8000-000000000001";
const D2 = "d2000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-12-01T12:00:00Z");

type Row = Record<string, unknown>;
let purchases: Row[] = [];
let snapshots: Record<string, unknown> | "missing-table" = {};
let deliverables: Row[] = [];
let evidence: Row[] = [];
let payouts: Row[] = [];
let youth = false;

const reset = () => {
  youth = false;
  const lot = (runs: Row) => ({ id: "lot", label: null, surface_key: "playbill_credit", mode: "fixed", winner_bid_id: null, buy_now_cents: null, runs });
  purchases = [
    { id: MUSIC, amount_cents: 120000, fee_cents: 18000, payment_status: "requires_payment", lot_id: "lot-m", bid_id: null, patrons: null, lots: lot({ id: "run-m", slug: "fall-run", title: "Fall run", starts_on: "2026-10-02", ends_on: "2026-10-30", act_id: ACT.id, acts: ACT }) },
    { id: THEATER, amount_cents: 50000, fee_cents: 7500, payment_status: "requires_payment", lot_id: "lot-t", bid_id: null, patrons: null, lots: lot({ id: "run-t", slug: "winter", title: "Winter production", starts_on: null, ends_on: null, act_id: ACT.id, acts: ACT }) },
  ];
  snapshots = { [MUSIC]: { policy: { release_rule: "calendar" } }, [THEATER]: { policy: { release_rule: "evidence" } } };
  deliverables = [{ id: D1, purchase_id: THEATER, position: 1, status: "pending" }];
  evidence = []; payouts = [];
};

function from(table: string) {
  const s: { verb: string; payload?: unknown; filters: Record<string, unknown> } = { verb: "select", filters: {} };
  const match = (rows: Row[]) => rows.filter((r) => Object.entries(s.filters).every(([k, v]) => r[k] === v));
  const settle = (): { data: unknown; error: { code?: string; message: string } | null; count?: number } => {
    if (table === "purchase_snapshots") {
      if (snapshots === "missing-table") return { data: null, error: { message: 'relation "purchase_snapshots" does not exist' } };
      const snap = snapshots[s.filters.purchase_id as string];
      return { data: snap ? [{ snapshot: snap }] : [], error: null };
    }
    if (table === "payout_schedule") {
      if (s.verb === "insert") {
        const rows = (Array.isArray(s.payload) ? s.payload : [s.payload]) as Row[];
        // The unique index on deliverable_id (migration 0045).
        if (rows.some((r) => r.deliverable_id && payouts.some((p) => p.deliverable_id === r.deliverable_id))) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint payout_deliverable_once" } };
        payouts.push(...rows.map((r) => ({ status: "scheduled", ...r })));
        return { data: null, error: null };
      }
      return { data: match(payouts), error: null, count: match(payouts).length };
    }
    if (table === "deliverables") {
      if (s.verb === "update") { for (const d of match(deliverables)) Object.assign(d, s.payload); return { data: null, error: null }; }
      return { data: match(deliverables).map((d) => { const p = purchases.find((x) => x.id === d.purchase_id)!; return { ...d, purchases: { ...p, lots: { runs: { act_id: ACT.id, category_details: youth ? { level: "youth" } : {} } } } }; }), error: null };
    }
    if (table === "evidence") { const row = { id: `ev-${evidence.length + 1}`, ...(s.payload as Row) }; evidence.push(row); return { data: [row], error: null }; }
    if (table === "purchases") return { data: match(purchases), error: null };
    return { data: [], error: null };
  };
  const b = {
    select() { return b; },
    insert(payload: unknown) { s.verb = "insert"; s.payload = payload; return b; },
    update(payload: unknown) { s.verb = "update"; s.payload = payload; return b; },
    eq(k: string, v: unknown) { s.filters[k] = v; return b; },
    in() { return b; }, is() { return b; }, order() { return b; },
    maybeSingle: async () => { const r = settle(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error }; },
    single: async () => { const r = settle(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error }; },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(settle()).then(resolve, reject); },
  };
  return b;
}
const sb = {
  from,
  rpc: async (_fn: string, args: Row) => {
    const p = purchases.find((r) => r.id === args.p_purchase_id);
    if (!p) return { data: "missing", error: null };
    if (p.payment_status !== "requires_payment") return { data: "already", error: null };
    p.payment_status = "held";
    return { data: "sold", error: null };
  },
} as unknown as SupabaseClient;

const { stripe } = await import("@/lib/stripe");
mock.method(stripe.paymentIntents, "retrieve", async (id: string) => ({ id, latest_charge: `ch_${id}` }));
mock.method(console, "error", () => {});

const { holdPurchase } = await import("@/lib/purchases");
const { submitEvidence, releaseRuleForPurchase } = await import("@/lib/delivery");

const organizerDocuments = (deliverableId: string, over: Record<string, unknown> = {}) =>
  submitEvidence(sb, { deliverableId, submittedBy: "organizer", now: NOW, evidence: { kind: "photo", url: "https://secondstage.example/program.jpg", ...over } });
const total = (rows: Row[]) => rows.reduce((n, r) => n + (r.amount_cents as number), 0);

// ---------------------------------------------------------------
// Payment
// ---------------------------------------------------------------

test("a music purchase is scheduled on its calendar, exactly as before", async () => {
  reset();
  await holdPurchase(sb, { purchaseId: MUSIC, paymentIntentId: "pi_m" });
  const slices = payouts.filter((p) => p.purchase_id === MUSIC);
  assert.equal(slices.length, 5, "five Fridays between 2 and 30 October");
  assert.equal(total(slices), 120000 - 18000);
  assert.ok(slices.every((p) => !p.deliverable_id));
});

test("a theater purchase is held with nothing scheduled, and no slice dated 1970", async () => {
  reset();
  const r = await holdPurchase(sb, { purchaseId: THEATER, paymentIntentId: "pi_t" });
  assert.equal(r.ok, true);
  assert.equal(purchases.find((p) => p.id === THEATER)!.payment_status, "held");
  assert.deepEqual(payouts, [], "its dates are null, and a calendar built from them was one slice due on 1 January 1970");
});

test("with no snapshot to read, a purchase behaves as purchases always have", async () => {
  reset();
  snapshots = "missing-table"; // this code deployed before migration 0045 is applied
  assert.equal(await releaseRuleForPurchase(sb, MUSIC), "calendar");
  await holdPurchase(sb, { purchaseId: MUSIC, paymentIntentId: "pi_m" });
  assert.equal(payouts.length, 5);
  snapshots = {};
  assert.equal(await releaseRuleForPurchase(sb, MUSIC), "calendar", "and so does one made before snapshots existed");
});

// ---------------------------------------------------------------
// Delivery and release
// ---------------------------------------------------------------

test("documenting the deliverable lays the organizer's whole share for the next Friday", async () => {
  reset();
  await holdPurchase(sb, { purchaseId: THEATER, paymentIntentId: "pi_t" });
  const r = await organizerDocuments(D1);
  assert.deepEqual(r, { ok: true, evidenceId: "ev-1", released: true, releaseCents: 42500 });
  assert.deepEqual(payouts, [{ status: "scheduled", act_id: ACT.id, purchase_id: THEATER, deliverable_id: D1, due_on: "2026-12-04", amount_cents: 42500 }]);
  assert.equal(deliverables[0].status, "delivered");
  assert.equal(evidence[0].visibility, "private", "and the evidence is private");
  assert.equal(50000 - 42500, 7500, "Door Money's fifteen percent is still the part never transferred");
});

test("a retry, a double click or a second item never lays the share twice", async () => {
  reset();
  await holdPurchase(sb, { purchaseId: THEATER, paymentIntentId: "pi_t" });
  await organizerDocuments(D1);
  const again = await organizerDocuments(D1, { url: "https://secondstage.example/page-4.jpg" });
  assert.equal(again.ok, true);
  assert.equal((again as { released: boolean }).released, false);
  assert.equal(payouts.length, 1);
  assert.equal(evidence.length, 2, "though more evidence may always be added");
});

test("partial delivery releases pro rata, and the parts add up to the net", async () => {
  reset();
  deliverables.push({ id: D2, purchase_id: THEATER, position: 2, status: "pending" });
  await holdPurchase(sb, { purchaseId: THEATER, paymentIntentId: "pi_t" });
  await organizerDocuments(D1);
  assert.equal(total(payouts), 21250, "one of two delivered releases half");
  // The rest is still unreleased, so it is still the sponsor's to get back.
  assert.equal(refundDue({ amount_cents: 50000, fee_cents: 7500 }, 21250), 25000);
  await organizerDocuments(D2);
  assert.equal(total(payouts), 42500);
});

// ---------------------------------------------------------------
// Refund and exception
// ---------------------------------------------------------------

test("a refund before delivery gives everything back, because nothing was ever released", async () => {
  reset();
  await holdPurchase(sb, { purchaseId: THEATER, paymentIntentId: "pi_t" });
  assert.equal(refundDue({ amount_cents: 50000, fee_cents: 7500 }, total(payouts.filter((p) => p.status === "paid"))), 50000);
});

test("a sponsorship that was refunded or cancelled cannot be delivered against", async () => {
  reset();
  await holdPurchase(sb, { purchaseId: THEATER, paymentIntentId: "pi_t" });
  purchases.find((p) => p.id === THEATER)!.payment_status = "refunded";
  const r = await organizerDocuments(D1);
  assert.equal(r.ok, false);
  assert.deepEqual(payouts, [], "no share is laid for money that already went back");
  assert.deepEqual(evidence, []);
});

test("evidence that could not be public is refused before anything is written", async () => {
  reset();
  await holdPurchase(sb, { purchaseId: THEATER, paymentIntentId: "pi_t" });
  assert.equal((await organizerDocuments(D1, { visibility: "public", showsMinor: true })).ok, false);
  youth = true;
  assert.equal((await organizerDocuments(D1, { visibility: "public" })).ok, false);
  assert.deepEqual(evidence, []);
  assert.deepEqual(payouts, []);
  assert.equal((await organizerDocuments(D1)).ok, true, "a youth team still documents delivery, in private, and is still paid");
});

test("a deliverable that is not there is an answer, not a crash", async () => {
  reset();
  const r = await organizerDocuments("d9000000-0000-4000-8000-000000000009");
  assert.deepEqual(r, { ok: false, error: "That deliverable is not on this account." });
});
