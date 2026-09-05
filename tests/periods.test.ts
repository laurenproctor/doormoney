/*
  The words a fundraiser's period goes by.

  Decision 14 retired "run" from copy and asked for the actual period by name. The point of these
  is the last one: a kind nobody planned for still must not fall back to the retired word.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { periodOf } from "@/lib/periods";

test("a tour is a tour, and its shows are shows", () => {
  const p = periodOf("tour");
  assert.deepEqual(p, { noun: "tour", units: "shows", unit: "show", counted: "shows on the tour" });
});

test("a season counts gigs", () => {
  const p = periodOf("season");
  assert.equal(p.noun, "season");
  assert.equal(p.units, "gigs");
  assert.equal(p.counted, "gigs a season");
});

test("a residency counts nights", () => {
  const p = periodOf("residency");
  assert.equal(p.noun, "residency");
  assert.equal(p.unit, "night");
  assert.equal(p.counted, "nights of the residency");
});

test("an unknown kind falls back to the tour wording, never to the retired word", () => {
  for (const kind of ["", "residency-2", "campaign", null, undefined]) {
    const p = periodOf(kind);
    assert.equal(p.noun, "tour", `${String(kind)} should fall back`);
  }
});

test("no word this module hands out is one the site retired", () => {
  const retired = /\b(run|runs|board|boards|campaign)\b/i;
  for (const kind of ["tour", "season", "residency", "anything else"]) {
    for (const word of Object.values(periodOf(kind))) {
      assert.equal(retired.test(word), false, `"${word}" is a retired word`);
    }
  }
});
