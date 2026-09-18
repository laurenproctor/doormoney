/*
  The public address of an act and of a run.

  A run hangs off the act and always carries the "support-" prefix, which belongs to Door Money
  rather than to the musician: they name a fundraiser, the site builds the path.

  What keeps a musician from claiming a path the site already serves is RESERVED_SLUGS, tested in
  tests/slug.test.ts alongside the rest of @/lib/slug.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { RUN_PREFIX, actPath, runPath, runSlugFromSegment } from "@/lib/urls";

test("an act's page is its word at the root", () => {
  assert.equal(actPath("gutter-hymns"), "/gutter-hymns");
});

test("a fundraiser's address is the act, then support- and the fundraiser's word", () => {
  assert.equal(runPath("gutter-hymns", "europe-tour"), "/gutter-hymns/support-europe-tour");
});

test("the run word comes back out of the segment the path put it in", () => {
  const segment = runPath("gutter-hymns", "europe-tour").split("/")[2];
  assert.equal(runSlugFromSegment(segment), "europe-tour");
});

test("a segment without the prefix is not a run address", () => {
  assert.equal(runSlugFromSegment("europe-tour"), null);
  assert.equal(runSlugFromSegment("supporteurope-tour"), null);
});

test("the prefix on its own names no run", () => {
  assert.equal(runSlugFromSegment(RUN_PREFIX), null);
});

test("a segment carrying something that is not a slug is refused", () => {
  assert.equal(runSlugFromSegment("support-Europe Tour"), null);
  assert.equal(runSlugFromSegment("support-../../etc"), null);
  assert.equal(runSlugFromSegment("support--leading-hyphen"), null);
});
