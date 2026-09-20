/*
  Which fundraiser a widget, a payment or a notice belongs to.

  One organizer, two fundraisers, is the case everything here is written against. A and B share an
  organizer address, an organizer id and a Stripe account, so none of those can tell them apart,
  and the only thing that can is the fundraiser's own id.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FUNDRAISER_ATTRIBUTE,
  FUNDRAISER_PARAM,
  embedPath,
  embedSnippet,
  fundraiserRequest,
  metadataFundraiser,
  parseFundraiserId,
  paymentBelongsToRow,
} from "@/lib/fundraiser-identity";
import { CATEGORY_PAYMENTS_CLOSED, categoryPaymentsOpen, stripeLiveMode } from "@/lib/payment-gate";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";

// ---------------------------------------------------------------
// The id
// ---------------------------------------------------------------

test("a fundraiser id is an id or nothing, never a guess", () => {
  assert.equal(parseFundraiserId(A), A);
  assert.equal(parseFundraiserId(`  ${A.toUpperCase()} `), A, "case and whitespace are not a different fundraiser");
  assert.equal(parseFundraiserId("22222222-2222-2222-2222-222222222222"), "22222222-2222-2222-2222-222222222222", "the seeded ids are not RFC 4122 and still count");
  for (const bad of ["", "fall-run", "gutter-hymns", `${A}x`, A.slice(1), `${A}?fundraiser=${B}`, "../../etc", null, undefined, 42, [A], { id: A }]) {
    assert.equal(parseFundraiserId(bad), null, `${JSON.stringify(bad)} is not an id`);
  }
});

test("a request names one fundraiser exactly, names none, or is refused", () => {
  assert.deepEqual(fundraiserRequest(A), { kind: "exact", id: A });
  assert.deepEqual(fundraiserRequest(undefined), { kind: "legacy" }, "no parameter at all is the old profile-based snippet");
  // A widget that tried to name a fundraiser and failed must not fall back to a different one.
  assert.deepEqual(fundraiserRequest(""), { kind: "invalid" });
  assert.deepEqual(fundraiserRequest("fall-run"), { kind: "invalid" });
  assert.deepEqual(fundraiserRequest([A, B]), { kind: "invalid" }, "two fundraisers in one address is not a choice between them");
});

// ---------------------------------------------------------------
// The address and the snippet
// ---------------------------------------------------------------

test("an exact widget address carries its fundraiser, and a legacy one carries none", () => {
  assert.equal(embedPath("gutter-hymns", A), `/embed/gutter-hymns?${FUNDRAISER_PARAM}=${A}`);
  assert.equal(embedPath("gutter-hymns", A, { source: "board", theme: "magenta" }), `/embed/gutter-hymns?fundraiser=${A}&source=board&theme=magenta`);
  assert.equal(embedPath("gutter-hymns"), "/embed/gutter-hymns");
  assert.equal(embedPath("gutter-hymns", null, { source: undefined }), "/embed/gutter-hymns");
  assert.equal(embedPath("gutter-hymns", "not-an-id"), "/embed/gutter-hymns", "a value that is not an id never reaches the address");
  assert.notEqual(embedPath("gutter-hymns", A), embedPath("gutter-hymns", B), "two fundraisers by one organizer have two addresses");
});

test("a new snippet always names one exact fundraiser", () => {
  const snippet = embedSnippet("https://doormoney.example", "gutter-hymns", A);
  assert.equal(snippet, `<script src="https://doormoney.example/embed.js" data-act="gutter-hymns" ${FUNDRAISER_ATTRIBUTE}="${A}"></script>`);
  assert.throws(() => embedSnippet("https://doormoney.example", "gutter-hymns", ""), /one exact fundraiser/);
  assert.throws(() => embedSnippet("https://doormoney.example", "gutter-hymns", "fall-run"), /one exact fundraiser/);
});

/** Runs embed.js the way a host page would, against the least of a DOM it needs. */
async function frameFor(attributes: Record<string, string>): Promise<{ src: string; allow: string | undefined }> {
  const { GET } = await import("@/app/embed.js/route");
  const js = await (await GET()).text();
  const frame: { src: string; title: string; style: { cssText: string }; attrs: Record<string, string>; setAttribute(k: string, v: string): void } = {
    src: "", title: "", style: { cssText: "" }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
  };
  const script = { getAttribute: (k: string) => attributes[k] ?? null, parentNode: { insertBefore() {} }, nextSibling: null };
  const document = { currentScript: script, createElement: () => frame };
  const window = { addEventListener() {} };
  new Function("document", "window", js)(document, window);
  return { src: frame.src, allow: frame.attrs.allow };
}

test("embed.js frames the exact fundraiser a snippet names", async () => {
  const exact = await frameFor({ "data-act": "gutter-hymns", "data-fundraiser": A });
  assert.ok(exact.src.endsWith(`/embed/gutter-hymns?fundraiser=${A}`), exact.src);
  assert.equal(exact.allow, "payment");
  const other = await frameFor({ "data-act": "gutter-hymns", "data-fundraiser": B });
  assert.ok(other.src.endsWith(`?fundraiser=${B}`), "a snippet for B frames B, under the same organizer address");
});

test("a snippet pasted before exact widgets existed still frames the organizer's widget", async () => {
  const legacy = await frameFor({ "data-act": "gutter-hymns" });
  assert.ok(legacy.src.endsWith("/embed/gutter-hymns"), legacy.src);
  assert.doesNotMatch(legacy.src, /fundraiser/);
});

test("embed.js passes a malformed fundraiser through for the page to refuse, and cannot be used to break out of the address", async () => {
  const bad = await frameFor({ "data-act": "gutter-hymns", "data-fundraiser": `x&source=board#"><script>` });
  assert.ok(bad.src.includes("?fundraiser=x%26source%3Dboard%23%22%3E%3Cscript%3E"), bad.src);
  assert.deepEqual(fundraiserRequest(new URL(bad.src).searchParams.get("fundraiser")), { kind: "invalid" }, "which the page answers with a 404");
});

// ---------------------------------------------------------------
// Does this payment belong to this fundraiser
// ---------------------------------------------------------------

test("a payment for A matches A and nothing else, whatever else the two share", () => {
  const paymentForA = { kind: "backing", run_id: A, act_id: "act-1", act_slug: "gutter-hymns" };
  assert.equal(metadataFundraiser(paymentForA, A), "match");
  // Same organizer id, same organizer address: the old check passed this. It is the whole bug.
  assert.equal(metadataFundraiser(paymentForA, B), "mismatch");
  assert.equal(metadataFundraiser(paymentForA, null), "mismatch", "a page that does not know its own fundraiser acknowledges nothing");
  assert.equal(metadataFundraiser({ ...paymentForA, run_id: A.toUpperCase() }, A), "match");
});

test("a payment that names no fundraiser is unnamed, never assumed to match", () => {
  assert.equal(metadataFundraiser({ kind: "lot", act_slug: "gutter-hymns" }, A), "unnamed");
  assert.equal(metadataFundraiser({ run_id: "" }, A), "unnamed");
  assert.equal(metadataFundraiser({ run_id: "fall-run" }, A), "unnamed", "a word is not an id");
  assert.equal(metadataFundraiser(null, A), "unnamed");
  assert.equal(metadataFundraiser(undefined, A), "unnamed");
});

test("at fulfillment the row decides, and metadata may agree or be silent but never disagree", () => {
  assert.equal(paymentBelongsToRow({ run_id: A }, A), true);
  assert.equal(paymentBelongsToRow({ run_id: A }, B), false, "payment A cannot fulfil fundraiser B");
  assert.equal(paymentBelongsToRow({}, B), true, "a payment started before run_id was carried is settled by its row");
  assert.equal(paymentBelongsToRow(null, B), true);
});

// ---------------------------------------------------------------
// Which categories may take real money
// ---------------------------------------------------------------

test("music is paid in either mode, and no other category takes a live payment", () => {
  assert.equal(stripeLiveMode("sk_live_abc"), true);
  assert.equal(stripeLiveMode("rk_live_abc"), true);
  assert.equal(stripeLiveMode("sk_test_abc"), false);
  assert.equal(stripeLiveMode(undefined), false);
  assert.equal(stripeLiveMode("sk_test_placeholder"), false);

  for (const live of [true, false]) assert.equal(categoryPaymentsOpen("music", live), true, "existing music payments are untouched");
  assert.equal(categoryPaymentsOpen(null, true), true, "a fundraiser from before categories existed is music");
  for (const category of ["sports", "film", "theater", "dance"]) {
    assert.equal(categoryPaymentsOpen(category, false), true, `${category} is verified in test mode`);
    assert.equal(categoryPaymentsOpen(category, true), false, `${category} takes no live payment before its delivery policy exists`);
  }
  assert.doesNotMatch(CATEGORY_PAYMENTS_CLOSED, /soon|shortly|by /i, "and the refusal promises no date");
});
