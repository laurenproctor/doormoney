/*
  The musician types these, so the board has to survive whatever arrives. Anything that does not
  come out of here as a value is not rendered at all.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { instagramHandle, instagramUrl, safeWebsite, websiteLabel } from "@/lib/links";

test("a plain address is kept", () => {
  assert.equal(safeWebsite("https://gutterhymns.com/tour"), "https://gutterhymns.com/tour");
});

test("a missing scheme becomes https", () => {
  assert.equal(safeWebsite("gutterhymns.com"), "https://gutterhymns.com/");
  assert.equal(safeWebsite("  www.gutterhymns.com/live  "), "https://www.gutterhymns.com/live");
});

test("nothing but http and https reaches an href", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "mailto:someone@example.com",
  ]) {
    assert.equal(safeWebsite(bad), null, bad);
  }
});

test("empty, blank and hostless values render nothing", () => {
  for (const bad of [null, undefined, "", "   ", "not a url", "https://localhost", "http://"]) {
    assert.equal(safeWebsite(bad), null, String(bad));
  }
});

test("a userinfo trick is refused", () => {
  assert.equal(safeWebsite("https://doormoney.co@evil.example/"), null);
});

test("the link says the address, without the scheme or the www", () => {
  assert.equal(websiteLabel("https://www.gutterhymns.com/tour/"), "gutterhymns.com/tour");
  assert.equal(websiteLabel("https://gutterhymns.com/"), "gutterhymns.com");
});

test("an Instagram handle is normalised from every shape a musician types", () => {
  for (const raw of [
    "gutterhymns",
    "@gutterhymns",
    "instagram.com/gutterhymns",
    "https://instagram.com/gutterhymns/",
    "https://www.instagram.com/gutterhymns?hl=en",
    "  @gutterhymns  ",
  ]) {
    assert.equal(instagramHandle(raw), "gutterhymns", raw);
  }
  assert.equal(instagramUrl("gutterhymns"), "https://www.instagram.com/gutterhymns/");
});

test("anything that is not a handle renders nothing", () => {
  for (const bad of [null, "", "   ", "@", "a/b", "has space", "x".repeat(31), "javascript:alert(1)", "https://evil.example/gutterhymns"]) {
    assert.equal(instagramHandle(bad), null, String(bad));
  }
});
