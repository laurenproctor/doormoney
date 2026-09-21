/*
  Where a sponsorship stands, in one vocabulary for every category.

  Each state the policy matrix names is reached here at least once, for a theater purchase released
  on evidence and for a music purchase released on its calendar, because the point of the
  vocabulary is that the two can be described the same way without being paid the same way.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverableShares, evidenceProblem, fridayOnOrAfter, mayViewEvidence, policyAllowsPayment, releaseRuleOf } from "@/lib/delivery-policy";
import { STATE_LABEL, deliveryStanding, type DeliveryFacts, type DeliveryState } from "@/lib/delivery-state";

const NOW = new Date("2026-12-01T12:00:00Z");
const theater = (over: Partial<DeliveryFacts> = {}): DeliveryFacts => ({
  releaseRule: "evidence", paymentStatus: "held", materialsStatus: "none", fundraiserStatus: "open", amountCents: 50000, refundedCents: 0,
  deliverables: [{ status: "pending", hasEvidence: false, dueAt: "2026-12-20T20:00:00Z" }], payouts: [], ...over,
});
const music = (over: Partial<DeliveryFacts> = {}): DeliveryFacts => ({
  releaseRule: "calendar", paymentStatus: "held", materialsStatus: "none", fundraiserStatus: "open", amountCents: 120000, refundedCents: 0,
  deliverables: [], payouts: [{ status: "scheduled", amountCents: 51000 }, { status: "scheduled", amountCents: 51000 }], ...over,
});
const all = (f: DeliveryFacts) => { const s = deliveryStanding(f, NOW); return [s.state, ...s.also]; };

test("a checkout nobody finished is not a sponsorship yet", () => {
  assert.equal(deliveryStanding(theater({ paymentStatus: "requires_payment" }), NOW).state, "unpaid");
});

test("paid, and waiting on the sponsor's materials, whatever those are", () => {
  assert.deepEqual(all(theater()), ["awaiting_materials", "paid"]);
  assert.deepEqual(all(music()), ["awaiting_materials", "paid"], "a logo is one kind of material, and the state does not say which");
  assert.doesNotMatch(STATE_LABEL.awaiting_materials, /logo/i);
});

test("materials sent, then approved, then awaiting delivery", () => {
  assert.equal(deliveryStanding(theater({ materialsStatus: "submitted" }), NOW).state, "materials_submitted");
  assert.deepEqual(all(theater({ materialsStatus: "approved" })), ["awaiting_delivery", "approved", "paid"]);
  assert.deepEqual(all(music({ materialsStatus: "approved" })), ["awaiting_delivery", "approved", "paid"]);
});

test("approved is not delivered: accepting the materials releases nothing on its own", () => {
  const s = deliveryStanding(theater({ materialsStatus: "approved" }), NOW);
  assert.equal(s.releasedCents, 0);
  assert.ok(!s.also.includes("evidence_submitted") && s.state !== "completed");
});

test("evidence submitted, then released, then completed", () => {
  const documented = theater({ materialsStatus: "approved", deliverables: [{ status: "delivered", hasEvidence: true }], payouts: [{ status: "scheduled", amountCents: 42500 }] });
  assert.equal(deliveryStanding(documented, NOW).state, "evidence_submitted");
  const paid = { ...documented, payouts: [{ status: "paid", amountCents: 42500 }] };
  const s = deliveryStanding(paid, NOW);
  assert.equal(s.state, "completed");
  assert.ok(s.also.includes("released"));
  assert.equal(s.releasedCents, 42500);
});

test("partial delivery: part released, part still owed, and it is not called complete", () => {
  const partial = theater({ materialsStatus: "approved",
    deliverables: [{ status: "delivered", hasEvidence: true }, { status: "pending", hasEvidence: false, dueAt: "2026-12-20T20:00:00Z" }],
    payouts: [{ status: "paid", amountCents: 21250 }] });
  const s = deliveryStanding(partial, NOW);
  assert.equal(s.state, "released");
  assert.ok(s.also.includes("awaiting_delivery"));
  assert.ok(!s.also.includes("completed"));
});

test("music completes on its calendar, with no deliverable rows at all", () => {
  const done = music({ materialsStatus: "approved", paymentStatus: "released", fundraiserStatus: "closed", payouts: [{ status: "paid", amountCents: 51000 }, { status: "paid", amountCents: 51000 }] });
  assert.equal(deliveryStanding(done, NOW).state, "completed");
  assert.equal(deliveryStanding(done, NOW).releasedCents, 102000);
});

test("cancelled and refunded lead, and say so together", () => {
  const s = deliveryStanding(theater({ fundraiserStatus: "cancelled", paymentStatus: "refunded", refundedCents: 50000, materialsStatus: "approved" }), NOW);
  assert.equal(s.state, "refunded");
  assert.ok(s.also.includes("cancelled"));
  assert.equal(deliveryStanding(music({ paymentStatus: "partially_refunded", refundedCents: 60000, payouts: [{ status: "paid", amountCents: 51000 }, { status: "skipped", amountCents: 51000 }] }), NOW).state, "refunded");
});

test("a dispute outranks everything, because it is the one state where Door Money's own money is at risk", () => {
  const s = deliveryStanding(theater({ disputeOpen: true, materialsStatus: "approved", deliverables: [{ status: "delivered", hasEvidence: true }], payouts: [{ status: "paid", amountCents: 42500 }] }), NOW);
  assert.equal(s.state, "disputed");
  assert.ok(s.also.includes("completed"), "and what was true before it is still said");
});

test("a missed deadline is visible and changes nothing about the money", () => {
  const late = theater({ materialsStatus: "approved", deliverables: [{ status: "pending", hasEvidence: false, dueAt: "2026-11-20T20:00:00Z" }] });
  const s = deliveryStanding(late, NOW);
  assert.equal(s.lateDeliverables, 1);
  assert.equal(s.state, "awaiting_delivery", "held and waiting: nothing is refunded or released on its own");
  assert.equal(deliveryStanding(theater({ materialsStatus: "approved" }), NOW).lateDeliverables, 0);
});

test("every state has words, and none of them is about a logo or a musician", () => {
  const states: DeliveryState[] = ["unpaid", "paid", "awaiting_materials", "materials_submitted", "approved", "awaiting_delivery", "evidence_submitted", "released", "completed", "cancelled", "refunded", "disputed"];
  for (const s of states) {
    assert.ok(STATE_LABEL[s].length > 0);
    assert.doesNotMatch(STATE_LABEL[s], /logo|musician|band|show|—/i, s);
  }
});

// ---------------------------------------------------------------
// The rules behind the states
// ---------------------------------------------------------------

test("only a policy the owner switched on takes live money", () => {
  assert.equal(policyAllowsPayment("active", true), true);
  assert.equal(policyAllowsPayment("active", false), true);
  assert.equal(policyAllowsPayment("proposed", false), true, "a proposed policy is verified in test mode");
  assert.equal(policyAllowsPayment("proposed", true), false, "and refused a live payment");
  for (const live of [true, false]) {
    assert.equal(policyAllowsPayment("retired", live), false);
    assert.equal(policyAllowsPayment(null, live), false, "a category with no policy cannot be paid at all");
  }
});

test("a purchase with no recorded policy is a calendar purchase, which is every purchase made before policies", () => {
  assert.equal(releaseRuleOf({ policy: { release_rule: "evidence" } }), "evidence");
  assert.equal(releaseRuleOf({ policy: { release_rule: "calendar" } }), "calendar");
  for (const odd of [null, undefined, {}, { policy: {} }, { policy: { release_rule: "whenever" } }, "evidence"]) assert.equal(releaseRuleOf(odd), "calendar");
});

test("the organizer's share divides across deliverables and always adds up to the net", () => {
  assert.deepEqual(deliverableShares(42500, 1), [42500]);
  assert.deepEqual(deliverableShares(42500, 3), [14166, 14166, 14168]);
  for (const [net, n] of [[1, 3], [99999, 7], [0, 2], [42500, 6]] as const) assert.equal(deliverableShares(net, n).reduce((a, b) => a + b, 0), net);
  assert.throws(() => deliverableShares(100, 0));
  assert.throws(() => deliverableShares(10.5, 2));
});

test("a release rides the next Friday, like everything else", () => {
  assert.equal(fridayOnOrAfter(new Date("2026-12-01T12:00:00Z")), "2026-12-04");
  assert.equal(fridayOnOrAfter(new Date("2026-12-04T23:59:00Z")), "2026-12-04", "a Friday is its own Friday");
  assert.equal(fridayOnOrAfter(new Date("2026-12-05T00:00:00Z")), "2026-12-11");
});

test("evidence is private unless one item is published, and some items never can be", () => {
  const item = { visibility: "private" as const, showsMinor: false, removed: false };
  assert.equal(mayViewEvidence(item, "public"), false, "a public fundraiser publishes nothing");
  for (const party of ["organizer", "sponsor", "door_money"] as const) assert.equal(mayViewEvidence(item, party), true);
  assert.equal(mayViewEvidence({ ...item, visibility: "public" }, "public"), true);
  assert.equal(mayViewEvidence({ ...item, visibility: "public", showsMinor: true }, "public"), false);
  assert.equal(mayViewEvidence({ ...item, visibility: "public", removed: true }, "public"), false);
  assert.equal(mayViewEvidence({ ...item, removed: true }, "sponsor"), false);

  assert.equal(evidenceProblem({ kind: "link", url: "https://example.org/post" }, { youth: false }), null);
  assert.equal(evidenceProblem({ kind: "note", note: "Read from the stage on 12 December." }, { youth: false }), null, "a spoken mention is documented in words: no recording is asked for");
  assert.match(evidenceProblem({ kind: "photo" }, { youth: false }) ?? "", /link or a note/);
  assert.match(evidenceProblem({ kind: "photo", url: "http://plain.example/x.jpg" }, { youth: false }) ?? "", /https/);
  assert.match(evidenceProblem({ kind: "photo", url: "https://a.example/x.jpg", visibility: "public", showsMinor: true }, { youth: false }) ?? "", /minor/);
  assert.match(evidenceProblem({ kind: "photo", url: "https://a.example/x.jpg", visibility: "public" }, { youth: true }) ?? "", /youth/);
  assert.equal(evidenceProblem({ kind: "photo", url: "https://a.example/x.jpg", visibility: "private" }, { youth: true }), null, "a youth team can still document delivery, in private");
});

test("the current policy is the newest one switched on, and only failing that a proposal", async () => {
  const { currentPolicy } = await import("@/lib/delivery-policy");
  const v = (version: number, status: string) => ({ version, status });
  assert.deepEqual(currentPolicy([v(1, "active")]), v(1, "active"));
  assert.deepEqual(currentPolicy([v(1, "active"), v(2, "proposed")]), v(1, "active"), "a draft of version 2 changes nothing until it is switched on");
  assert.deepEqual(currentPolicy([v(1, "active"), v(2, "active")]), v(2, "active"));
  assert.deepEqual(currentPolicy([v(1, "proposed"), v(2, "proposed")]), v(2, "proposed"), "with nothing switched on, the newest proposal is what test mode verifies");
  assert.deepEqual(currentPolicy([v(1, "retired"), v(2, "proposed")]), v(2, "proposed"));
  assert.equal(currentPolicy([v(1, "retired")]), null, "a retired policy sells nothing");
  assert.equal(currentPolicy([]), null);
  assert.equal(currentPolicy([v(3, "whatever")]), null, "an unknown status is not a usable policy");
});
