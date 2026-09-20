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
  methodLabel,
  verificationItems,
  verificationMethods,
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

test("a predefined method saves, and comes back in catalog order", () => {
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

test("the board shows only what was chosen, in catalog order", () => {
  const items = verificationItems({ methods: ["social_post_links", "venue_date_record"], other: null }, "music");
  assert.deepEqual(items.map((i) => i.label), ["Venue and performance-date list", "Links to placement-related posts"]);
  assert.equal(items.some((i) => i.label === "Attendance estimates"), false);
  assert.equal(items.every((i) => i.detail === undefined), true);
});

test("the write-in answer rides along with its own tick", () => {
  const items = verificationItems({ methods: ["venue_date_record", OTHER_KEY], other: ANSWER }, "music");
  assert.equal(items.length, 2);
  assert.equal(items[1].label, "Another verification method");
  assert.equal(items[1].detail, ANSWER);
});

test("a run from before this existed renders no section at all", () => {
  for (const empty of [null, undefined, {}, { methods: [], other: null }, { methods: undefined, other: "left over" }]) {
    assert.deepEqual(verificationItems(empty, "music"), []);
    assert.equal(hasVerification(empty), false);
  }
});

test("other ticked with no answer stored says nothing on the board rather than an empty promise", () => {
  assert.deepEqual(verificationItems({ methods: [OTHER_KEY], other: "  " }, "music"), []);
  assert.equal(hasVerification({ methods: [OTHER_KEY], other: null }), false);
});

test("an unknown key stored by some older write is dropped on the way out", () => {
  const items = verificationItems({ methods: ["nightly_photos", "short_video"], other: null }, "music");
  assert.deepEqual(items.map((i) => i.key), ["short_video"]);
});

/*
  The same promise in each category's words. The keys are what is stored, so they never move; a
  method a musician ticked means exactly what it meant before any of this.
*/

test("every category offers the same methods, in the same order, under the same keys", () => {
  for (const category of ["music", "sports", "film", "theater", "community"]) {
    assert.deepEqual(
      verificationMethods(category).map((m) => m.key),
      VERIFICATION_METHODS.map((m) => m.key),
      category,
    );
  }
});

test("a category nobody has written words for falls back to music's, not to blanks", () => {
  assert.deepEqual(verificationMethods("community"), VERIFICATION_METHODS);
});

test("the words follow the category, so nobody is asked to photograph a show they do not play", () => {
  assert.match(methodLabel("selected_show_photos", "music")!, /shows/);
  assert.match(methodLabel("selected_show_photos", "sports")!, /fixtures/);
  assert.match(methodLabel("selected_show_photos", "theater")!, /performances/);
  assert.match(methodLabel("selected_show_photos", "film")!, /shoot days/);
  assert.match(methodLabel("short_video", "sports")!, /matchday/);
  assert.equal(methodLabel("attendance_estimates", "film"), "Attendance estimates", "a label that already travels is left alone");
});

test("a board renders the category's words for what the organizer ticked", () => {
  const choice = { methods: ["selected_show_photos", "end_of_run_record"], other: null };
  assert.deepEqual(verificationItems(choice, "theater").map((i) => i.label), [
    "Dated photos from selected performances",
    "End-of-fundraiser placement record",
  ]);
  assert.deepEqual(verificationItems(choice, "music").map((i) => i.label), [
    "Dated photos from selected shows",
    "End-of-run placement record",
  ]);
});

test("no category's wording quietly changes what was stored", () => {
  // The constraint in migration 0020 lists the keys. A reworded method that shipped a new key would
  // fail that constraint on the first save, which is the failure this catches at the words instead.
  for (const category of ["sports", "film", "theater"]) {
    for (const method of verificationMethods(category)) assert.equal(isVerificationKey(method.key), true, `${category}.${method.key}`);
  }
});
