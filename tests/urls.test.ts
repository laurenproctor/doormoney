/*
  The public address of an act and of a run.

  An act's word sits at the root of the site, so RESERVED_SLUGS is what keeps a musician from
  claiming a path the site already serves. A run hangs off the act and always carries the
  "support-" prefix, which belongs to Door Money rather than to the musician: they name a
  fundraiser, the site builds the path.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { RESERVED_SLUGS } from "@/lib/slug";
import { RUN_PREFIX, actPath, runPath, runSlugFromSegment } from "@/lib/urls";

test("an act's page is its word at the root", () => {
  assert.equal(actPath("gutter-hymns"), "/gutter-hymns");
});

test("a run's board is the act, then support- and the run's word", () => {
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

test("every top-level route the site serves is reserved, so no act page can shadow one", () => {
  // The act page is the catch-all at the root: whatever the static routes do not claim lands there.
  for (const path of ["login", "signup", "dashboard", "auctions", "placements", "widget", "list", "contact", "patron", "embed", "board", "claim", "mark", "record"]) {
    assert.ok(RESERVED_SLUGS.has(path), `${path} is a route and has to be reserved`);
  }
});
