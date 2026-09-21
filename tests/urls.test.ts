/*
  The public address of an act and of a run.

  A run hangs off the act and always carries the "support-" prefix, which belongs to Door Money
  rather than to the musician: they name a fundraiser, the site builds the path.

  What keeps a musician from claiming a path the site already serves is RESERVED_SLUGS, tested in
  tests/slug.test.ts alongside the rest of @/lib/slug.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RUN_PREFIX, actPath, runPath, runSlugFromSegment, signInPath } from "@/lib/urls";

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

test("signing in comes back to the whole address, so a link to a starter kit survives it", () => {
  const to = signInPath("/dashboard/runs/new", "?template=fund_tour");
  assert.equal(to, "/login?next=%2Fdashboard%2Fruns%2Fnew%3Ftemplate%3Dfund_tour");
  assert.equal(new URL(to, "https://doormoney.test").searchParams.get("next"), "/dashboard/runs/new?template=fund_tour");
  assert.equal(signInPath("/dashboard"), "/login?next=%2Fdashboard", "no query, no change");
  assert.equal(signInPath("/dashboard", ""), "/login?next=%2Fdashboard");
  // One parameter, whatever the query held: a second next, or a way out of the site, stays inside it.
  const hostile = new URL(signInPath("/dashboard", "?next=//evil.example&x=1"), "https://doormoney.test");
  assert.deepEqual([...hostile.searchParams.keys()], ["next"]);
  assert.equal(hostile.searchParams.get("next"), "/dashboard?next=//evil.example&x=1", "which safeNext accepts as a path inside the site");
  // The proxy is what redirects a signed-out dashboard request, before any page runs, so it has to be the one that uses this.
  const proxy = readFileSync(path.join(import.meta.dirname, "..", "src/proxy.ts"), "utf8");
  assert.match(proxy, /signInPath\(path, request\.nextUrl\.search\)/);
  assert.doesNotMatch(proxy, /encodeURIComponent\(path\)/, "the path alone is what dropped the kit");
});
