/*
  The organizer's delivery panel: what it is given, what it says, and who may use it.

  The rows are shaped from what the organizer's own session can read (row level security decides
  that, and supabase/tests/delivery_policy_test.sql holds it). The actions prove ownership again on
  the server before writing anything, because a deliverable id in a form proves nothing.
*/
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mock, test } from "node:test";
import { deliveryStatusLine, loadRunDelivery, shapeDelivery, type RawDeliverable } from "@/lib/delivery-dashboard";

const MINE = "d1000000-0000-4000-8000-000000000001";
const THEIRS = "d2000000-0000-4000-8000-000000000002";
const EVIDENCE = "e1000000-0000-4000-8000-000000000001";

let ownerOf: Record<string, string> = { [MINE]: "act-mine", [THEIRS]: "act-theirs" };
let submitted: Record<string, unknown>[] = [];
let visibility: unknown[][] = [];
let visibilityResult: { ok: boolean; error?: string } = { ok: true };

mock.module("next/cache", { namedExports: { revalidatePath() {} } });
// The panel borrows input styles from DashboardShell, whose own imports reach the rest of this module.
mock.module("@/lib/auth", { namedExports: {
  requireUser: async () => ({ id: "user-1" }),
  ownedAct: async () => ({ id: "act-mine" }),
  currentUser: async () => null,
  currentProfile: async () => null,
  safeNext: (next: string | null | undefined, fallback = "/dashboard") => next ?? fallback,
} });
mock.module("@/lib/supabase/server", { namedExports: { supabaseServer: async () => ({}), supabaseAdmin: () => ({
  from: (table: string) => {
    let id = "";
    const b = { select: () => b, eq: (_k: string, v: string) => { id = v; return b; }, maybeSingle: async () => {
      if (table === "evidence") return { data: id === EVIDENCE ? { deliverable_id: MINE } : id ? { deliverable_id: THEIRS } : null, error: null };
      return { data: ownerOf[id] ? { id, purchases: { lots: { runs: { act_id: ownerOf[id] } } } } : null, error: null };
    } };
    return b;
  },
}) } });
// The panel offers the organizer's yes or no, whose action reaches Stripe, email and the refund queue.
mock.module("@/app/actions/marks", { namedExports: { decideMark: async () => ({ ok: true }), submitMark: async () => ({ ok: true }) } });
mock.module("@/lib/delivery", { namedExports: {
  submitEvidence: async (_sb: unknown, params: Record<string, unknown>) => { submitted.push(params); return { ok: true, evidenceId: "ev", released: true, releaseCents: 42500 }; },
  setEvidenceVisibility: async (...args: unknown[]) => { visibility.push(args.slice(1)); return visibilityResult; },
} });

const { submitEvidenceAction, setEvidenceVisibilityAction } = await import("@/app/actions/delivery");
const { DeliveryPanel } = await import("@/components/DeliveryPanel");

const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const reset = () => { submitted = []; visibility = []; visibilityResult = { ok: true }; ownerOf = { [MINE]: "act-mine", [THEIRS]: "act-theirs" }; };

const raw = (over: Partial<RawDeliverable> = {}): RawDeliverable => ({
  id: MINE, title: "Program credit", status: "pending", due_at: "2026-12-20T20:00:00Z", position: 1,
  purchases: { id: "p1", lot_id: "lot-1", mark_status: "approved", payment_status: "held" }, evidence: [], ...over,
});

// ---------------------------------------------------------------
// The rows
// ---------------------------------------------------------------

test("a row carries what the organizer needs, and nothing about money", () => {
  const [row] = shapeDelivery([raw({ evidence: [
    { id: "b", kind: "link", url: "https://x.example/b", note: null, visibility: "public", shows_minor: false, created_at: "2026-12-02T00:00:00Z" },
    { id: "a", kind: "note", url: null, note: "Page 3.", visibility: "private", shows_minor: true, created_at: "2026-12-01T00:00:00Z" },
    { id: "gone", kind: "note", url: null, note: "x", visibility: "private", shows_minor: false, created_at: "2026-12-03T00:00:00Z", removed_at: "2026-12-04T00:00:00Z" },
  ] })], [{ lot_id: "lot-1", name: "Kettle St. Coffee" }]);
  assert.equal(row.sponsorName, "Kettle St. Coffee");
  assert.deepEqual(row.evidence.map((e) => [e.id, e.isPublic, e.showsMinor]), [["a", false, true], ["b", true, false]], "oldest first, and a removed item is gone");
  // Keys, not prose: the sponsor here is a coffee shop, and "coffee" has a fee in it.
  assert.doesNotMatch(Object.keys(row).concat(Object.keys(row.evidence[0])).join(","), /amount|fee|cents|email|stripe|patron|profile/i);
  assert.equal(shapeDelivery([raw()], [])[0].sponsorName, null, "a sponsor with no public name is not given one");
});

test("the status line says what is true and what to do, to the organizer", () => {
  assert.match(deliveryStatusLine({ open: true, delivered: false, materials: "approved" }), /Document this when it has been delivered/);
  assert.match(deliveryStatusLine({ open: true, delivered: false, materials: "submitted" }), /waiting for your answer/);
  assert.match(deliveryStatusLine({ open: true, delivered: false, materials: "none" }), /You can still document delivery now/);
  assert.match(deliveryStatusLine({ open: true, delivered: true, materials: "approved" }), /set for the next Friday/);
  assert.match(deliveryStatusLine({ open: true, delivered: true, materials: "none" }), /once you accept the sponsor's materials/, "documented is not paid: the materials gate still stands");
  assert.match(deliveryStatusLine({ open: false, delivered: false, materials: "approved" }), /no longer held/);
  for (const m of ["none", "submitted", "approved", "declined"] as const) assert.doesNotMatch(deliveryStatusLine({ open: true, delivered: false, materials: m }), /logo|musician|verified|—/i);
});

test("a fundraiser with no lots, a music fundraiser, and a database without the tables all read as nothing owed", async () => {
  const never = { from: () => { throw new Error("no read should happen"); } } as never;
  assert.deepEqual(await loadRunDelivery(never, []), []);
  const erroring = { from: () => ({ select: () => ({ in: () => ({ order: async () => ({ data: null, error: { message: 'relation "deliverables" does not exist' } }) }) }) }) } as never;
  assert.deepEqual(await loadRunDelivery(erroring, ["lot-1"]), [], "before migration 0045 the page simply has no delivery card");
  const empty = { from: () => ({ select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) }) } as never;
  assert.deepEqual(await loadRunDelivery(empty, ["lot-1"]), []);
});

// ---------------------------------------------------------------
// The actions
// ---------------------------------------------------------------

test("documenting your own deliverable stores it private, whatever the form says about visibility", async () => {
  reset();
  const r = await submitEvidenceAction({ ok: false }, form({ deliverable_id: MINE, kind: "photo", url: "https://secondstage.example/program.jpg", note: "Page 3.", visibility: "public" }));
  assert.equal(r.ok, true);
  assert.match(r.message ?? "", /next Friday/);
  assert.equal(submitted.length, 1);
  const sent = submitted[0] as { deliverableId: string; submittedBy: string; evidence: Record<string, unknown> };
  assert.equal(sent.deliverableId, MINE);
  assert.equal(sent.submittedBy, "user-1");
  assert.equal(sent.evidence.visibility, "private", "publishing is a separate step, on one item");
  assert.equal(sent.evidence.showsMinor, false);
});

test("somebody else's deliverable is refused before anything is written", async () => {
  reset();
  const r = await submitEvidenceAction({ ok: false }, form({ deliverable_id: THEIRS, kind: "note", note: "Mine now." }));
  assert.deepEqual(r, { ok: false, error: "That deliverable is not on this account." });
  assert.deepEqual(submitted, []);
  const missing = await submitEvidenceAction({ ok: false }, form({ deliverable_id: "d9000000-0000-4000-8000-000000000009", kind: "note", note: "x" }));
  assert.equal(missing.ok, false);
  assert.equal((await submitEvidenceAction({ ok: false }, form({ deliverable_id: "not-an-id", kind: "note", note: "x" }))).ok, false);
  assert.equal((await submitEvidenceAction({ ok: false }, form({ deliverable_id: MINE, kind: "video", note: "x" }))).ok, false, "a kind that is not on the list is refused");
  assert.deepEqual(submitted, []);
});

test("the minor box is carried through, so that item can never be published", async () => {
  reset();
  await submitEvidenceAction({ ok: false }, form({ deliverable_id: MINE, kind: "photo", url: "https://x.example/a.jpg", shows_minor: "1" }));
  assert.equal((submitted[0] as { evidence: { showsMinor: boolean } }).evidence.showsMinor, true);
});

test("publishing is one item at a time, only your own, and the database's refusal is said in words", async () => {
  reset();
  const ok = await setEvidenceVisibilityAction({ ok: false }, form({ evidence_id: EVIDENCE, visibility: "public" }));
  assert.equal(ok.ok, true);
  assert.match(ok.message ?? "", /Nothing else on the record is/);
  assert.deepEqual(visibility, [[EVIDENCE, "public"]]);

  const theirs = await setEvidenceVisibilityAction({ ok: false }, form({ evidence_id: "e2000000-0000-4000-8000-000000000002", visibility: "public" }));
  assert.deepEqual(theirs, { ok: false, error: "That item is not on this account." });
  assert.equal(visibility.length, 1, "nothing was changed on somebody else's item");

  visibilityResult = { ok: false, error: "Evidence from a youth team is never published." };
  assert.equal((await setEvidenceVisibilityAction({ ok: false }, form({ evidence_id: EVIDENCE, visibility: "public" }))).error, "Evidence from a youth team is never published.");
  assert.equal((await setEvidenceVisibilityAction({ ok: false }, form({ evidence_id: EVIDENCE, visibility: "everyone" }))).ok, false);
});

// ---------------------------------------------------------------
// The panel
// ---------------------------------------------------------------

/** What a reader sees. React adds a script beside a form with an action; nobody reads that. */
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

test("the panel draws a form for an open deliverable and offers to publish one item at a time", () => {
  const rows = shapeDelivery([raw({ status: "delivered", evidence: [{ id: EVIDENCE, kind: "link", url: "https://x.example/post", note: null, visibility: "private", shows_minor: false, created_at: "2026-12-01T00:00:00Z" }] })], [{ lot_id: "lot-1", name: "Kettle St. Coffee" }]);
  const html = renderToStaticMarkup(createElement(DeliveryPanel, { rows, youth: false, categoryKey: "theater" }));
  const page = text(html);
  assert.match(page, /Program credit/);
  assert.match(page, /Kettle St\. Coffee, due Dec 20, 2026/);
  assert.match(page, /Documented/);
  assert.match(page, /Make public : https:\/\/x\.example\/post/, "the button names the item it publishes, for a screen reader");
  assert.match(page, /stored private: only you, the sponsor and Door Money can see it/);
  for (const name of ["deliverable_id", "kind", "url", "note", "shows_minor", "evidence_id", "visibility"]) assert.ok(html.includes(`name="${name}"`), name);
  assert.doesNotMatch(page, /logo|musician|verified|certif|\$\d/i, "no music words, no claim that anybody checked, and no amount");
});

test("a youth team, and an item showing a minor, are offered no publish button at all", () => {
  const item = (shows_minor: boolean) => [{ id: EVIDENCE, kind: "photo" as const, url: "https://x.example/a.jpg", note: null, visibility: "private", shows_minor, created_at: "2026-12-01T00:00:00Z" }];
  const youth = text(renderToStaticMarkup(createElement(DeliveryPanel, { rows: shapeDelivery([raw({ evidence: item(false) })], []), youth: true, categoryKey: "sports" })));
  assert.match(youth, /Youth team: stays private/);
  assert.doesNotMatch(youth, /Make public/);
  const minor = text(renderToStaticMarkup(createElement(DeliveryPanel, { rows: shapeDelivery([raw({ evidence: item(true) })], []), youth: false, categoryKey: "theater" })));
  assert.match(minor, /Shows a minor: stays private/);
  assert.doesNotMatch(minor, /Make public/);
  assert.match(youth, /Document this/, "a youth team still documents delivery, in private, and is still paid");
});

test("a sponsorship that is no longer held shows its history and no form", () => {
  const closed = renderToStaticMarkup(createElement(DeliveryPanel, { rows: shapeDelivery([raw({ purchases: { id: "p1", lot_id: "lot-1", mark_status: "approved", payment_status: "refunded" } })], []), youth: false, categoryKey: "theater" }));
  assert.match(text(closed), /no longer held/);
  assert.doesNotMatch(closed, /name="deliverable_id"/);
});

// ---------------------------------------------------------------
// The organizer's answer on what a sponsor sent
// ---------------------------------------------------------------

const waiting = () => raw({ purchases: { id: "p1", lot_id: "lot-1", mark_status: "submitted", payment_status: "held" } });

test("what a sponsor sent is shown only while it is waiting, and only what was read for that purchase", () => {
  const sent = new Map([["p1", { text: "Kettle St. Coffee", note: "Said as three words.", fileUrl: null }]]);
  const [row] = shapeDelivery([waiting()], [], sent);
  assert.equal(row.purchaseId, "p1");
  assert.deepEqual(row.submitted, { text: "Kettle St. Coffee", note: "Said as three words.", fileUrl: null });
  assert.equal(shapeDelivery([raw()], [], sent)[0].submitted, null, "once accepted it is on the record, not on a to-do list");
  assert.deepEqual(shapeDelivery([waiting()], [])[0].submitted, { text: null, note: null, fileUrl: null }, "waiting with nothing readable still offers the decision");
});

test("the materials are read with the service role only for purchases the organizer's own session returned", async () => {
  const asked: unknown[] = [];
  const session = { from: (table: string) => table === "deliverables"
    ? { select: () => ({ in: () => ({ order: async () => ({ data: [waiting()], error: null }) }) }) }
    : { select: () => ({ in: async () => ({ data: [], error: null }) }) } } as never;
  const admin = { from: () => ({ select: () => ({ in: (_c: string, ids: unknown) => { asked.push(ids); return { eq: async () => ({ data: [{ id: "p1", mark_text: "Kettle St. Coffee", mark_note: null, mark_url: "http://plain.example/logo.png" }], error: null }) }; } }) }) } as never;
  const rows = await loadRunDelivery(session, ["lot-1"], admin);
  assert.deepEqual(asked, [["p1"]], "asked for exactly the purchase row level security let through");
  assert.deepEqual(rows[0].submitted, { text: "Kettle St. Coffee", note: null, fileUrl: null }, "and a file address that is not https never becomes a link");
  const none = await loadRunDelivery(session, ["lot-1"]);
  assert.deepEqual(none[0].submitted, { text: null, note: null, fileUrl: null }, "with no service client nothing private is read at all");
});

test("an organizer outside music can accept or decline, in words with no logo in them", () => {
  const rows = shapeDelivery([waiting()], [{ lot_id: "lot-1", name: "Kettle St. Coffee" }], new Map([["p1", { text: "Kettle St. Coffee", note: "Said as three words.", fileUrl: "https://files.example/kettle.png" }]]));
  const page = text(renderToStaticMarkup(createElement(DeliveryPanel, { rows, youth: false, categoryKey: "theater" })));
  assert.match(page, /The sponsor's materials are waiting for your answer/);
  assert.match(page, /“Kettle St\. Coffee”/);
  assert.match(page, /Said as three words\./);
  assert.match(page, /Accepting says you can deliver this\. Declining refunds the sponsor in full/);
  assert.match(page, /Accept Decline/);
  assert.doesNotMatch(page, /logo|Approve|musician/i);
});

test("music keeps its own words on the same panel", () => {
  const rows = shapeDelivery([waiting()], [], new Map([["p1", { text: null, note: null, fileUrl: "https://files.example/logo.png" }]]));
  const page = text(renderToStaticMarkup(createElement(DeliveryPanel, { rows, youth: false, categoryKey: "music" })));
  assert.match(page, /The sponsor's logo is waiting for your answer/);
  assert.match(page, /A logo file was sent\./);
  assert.match(page, /Approve Decline/);
});
