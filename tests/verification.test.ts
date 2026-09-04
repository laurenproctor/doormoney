/*
  Placement verification, the part with no database in it: what parses, what does not, and what
  reaches the public board. The board component renders exactly verificationItems(), so an empty
  result here is the case where the section does not appear at all.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OTHER_KEY,
  OTHER_MAX,
  OTHER_MIN,
  VERIFICATION_METHODS,
  hasVerification,
  isVerificationKey,
  parseVerification,
  verificationItems,
} from "@/lib/verification";

const ANSWER = "Rosie photographs the marked music stand at selected dates, with the room beside each image.";

test("the seven methods are the ones the product asked for, and their keys are stable", () => {
  assert.deepEqual(
    VERIFICATION_METHODS.map((m) => m.key),
    ["selected_show_photos", "venue_date_record", "attendance_estimates", "social_post_links", "short_video", "end_of_run_record", "other"],
  );
  assert.deepEqual(
    VERIFICATION_METHODS.map((m) => m.label),
    [
      "Dated photos from selected shows",
      "Venue and performance-date list",
      "Attendance estimates",
      "Links to placement-related posts",
      "Short performance or backstage video",
      "End-of-run placement record",
      "Another verification method",
    ],
  );
  assert.equal(isVerificationKey("venue_date_record"), true);
  assert.equal(isVerificationKey("nightly_photos"), false);
});

test("a predefined method saves, and comes back in catalogue order", () => {
  const r = parseVerification({ methods: ["end_of_run_record", "selected_show_photos"], other: "" });
  assert.equal(r.ok, true);
  assert.ok(r.ok);
  assert.deepEqual(r.value.methods, ["selected_show_photos", "end_of_run_record"]);
  assert.equal(r.value.other, null);
});

test("a custom method saves, trimmed", () => {
  const r = parseVerification({ methods: [OTHER_KEY], other: `   ${ANSWER}   ` });
  assert.ok(r.ok);
  assert.deepEqual(r.value.methods, [OTHER_KEY]);
  assert.equal(r.value.other, ANSWER);
});

test("other with nothing written in is refused, with a line a musician can act on", () => {
  const r = parseVerification({ methods: [OTHER_KEY], other: "   " });
  assert.equal(r.ok, false);
  assert.ok(!r.ok);
  assert.match(r.errors.other ?? "", /Describe the other verification method/);
});

test("other with too little written in is refused and says how much is needed", () => {
  const r = parseVerification({ methods: [OTHER_KEY], other: "photos" });
  assert.ok(!r.ok);
  assert.match(r.errors.other ?? "", new RegExp(`at least ${OTHER_MIN} characters`));
});

test("other longer than the cap is refused", () => {
  const r = parseVerification({ methods: [OTHER_KEY], other: "x".repeat(OTHER_MAX + 1) });
  assert.ok(!r.ok);
  assert.match(r.errors.other ?? "", /under 500 characters/);
});

test("deselecting other clears the custom answer, whatever the form still carried", () => {
  const r = parseVerification({ methods: ["short_video"], other: ANSWER });
  assert.ok(r.ok);
  assert.deepEqual(r.value.methods, ["short_video"]);
  assert.equal(r.value.other, null);
});

test("a draft may save nothing at all", () => {
  const r = parseVerification({ methods: [], other: "" });
  assert.ok(r.ok);
  assert.deepEqual(r.value.methods, []);
  assert.equal(r.value.other, null);
});

test("a key the app does not know is refused rather than quietly dropped", () => {
  const r = parseVerification({ methods: ["nightly_photos"], other: "" });
  assert.ok(!r.ok);
  assert.match(r.errors.methods ?? "", /not one of the methods/);
});

test("the same method twice is refused", () => {
  const r = parseVerification({ methods: ["short_video", "short_video"], other: "" });
  assert.ok(!r.ok);
  assert.match(r.errors.methods ?? "", /sent twice/);
});

test("the board shows only what was chosen, in catalogue order", () => {
  const items = verificationItems({ methods: ["social_post_links", "venue_date_record"], other: null });
  assert.deepEqual(items.map((i) => i.label), ["Venue and performance-date list", "Links to placement-related posts"]);
  assert.equal(items.some((i) => i.label === "Attendance estimates"), false);
  assert.equal(items.every((i) => i.detail === undefined), true);
});

test("the write-in answer rides along with its own tick", () => {
  const items = verificationItems({ methods: ["venue_date_record", OTHER_KEY], other: ANSWER });
  assert.equal(items.length, 2);
  assert.equal(items[1].label, "Another verification method");
  assert.equal(items[1].detail, ANSWER);
});

test("a run from before this existed renders no section at all", () => {
  for (const empty of [null, undefined, {}, { methods: [], other: null }, { methods: undefined, other: "left over" }]) {
    assert.deepEqual(verificationItems(empty), []);
    assert.equal(hasVerification(empty), false);
  }
});

test("other ticked with no answer stored says nothing on the board rather than an empty promise", () => {
  assert.deepEqual(verificationItems({ methods: [OTHER_KEY], other: "  " }), []);
  assert.equal(hasVerification({ methods: [OTHER_KEY], other: null }), false);
});

test("an unknown key stored by some older write is dropped on the way out", () => {
  const items = verificationItems({ methods: ["nightly_photos", "short_video"], other: null });
  assert.deepEqual(items.map((i) => i.key), ["short_video"]);
});
