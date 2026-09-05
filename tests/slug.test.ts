/*
  One namespace does two jobs: a handle is the sign-in name and the board address at once. So the
  slug rules and the username rules have to agree, and both have to refuse the paths the site
  already uses.

  Phase 5 splits these two lifecycles apart. Until it does, these tests record the shared rules,
  including two quirks that are current behavior rather than intent: a two-character handle is
  rejected while a one-character one passes the pattern, and doubled hyphens are allowed.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { RESERVED_SLUGS, SLUG_RE, slugWhileTyping, slugify } from "@/lib/slug";
import { normalizeUsername, usernameProblem } from "@/lib/username";

test("slugify lowercases and joins words with single hyphens", () => {
  assert.equal(slugify("Gutter Hymns"), "gutter-hymns");
  assert.equal(slugify("The   Roosevelts"), "the-roosevelts");
  assert.equal(slugify("ALL CAPS BAND"), "all-caps-band");
});

test("slugify spells out an ampersand rather than dropping it", () => {
  assert.equal(slugify("Bar & Grill"), "bar-and-grill");
  assert.equal(slugify("Sam & Dave & Co"), "sam-and-dave-and-co");
});

test("slugify strips accents instead of losing the letter", () => {
  assert.equal(slugify("Café Tacvba"), "cafe-tacvba");
  assert.equal(slugify("Sigur Rós"), "sigur-ros");
});

test("slugify trims the hyphens off both ends", () => {
  assert.equal(slugify("  ---Hello---  "), "hello");
  assert.equal(slugify("!!!"), "");
  assert.equal(slugify(""), "");
});

test("slugify caps the result at 40 characters", () => {
  assert.equal(slugify("a".repeat(60)).length, 40);
  assert.ok(slugify("The Very Long Name Of A Band That Keeps Going And Going").length <= 40);
});

test("slugWhileTyping keeps the hyphen someone just typed", () => {
  // The difference from slugify: a trailing hyphen survives, so typing "my-band" is not fought.
  assert.equal(slugWhileTyping("My Band!!"), "my-band-");
  assert.equal(slugWhileTyping("gutter-"), "gutter-");
  assert.equal(slugWhileTyping("gutter--hymns"), "gutter-hymns");
  assert.equal(slugWhileTyping("---lead"), "lead");
});

test("the slug pattern accepts what slugify produces", () => {
  for (const name of ["Gutter Hymns", "Bar & Grill", "Café Tacvba", "The Roosevelts"]) {
    assert.ok(SLUG_RE.test(slugify(name)), `${name} produced a slug its own pattern rejects`);
  }
});

test("the slug pattern refuses leading and trailing hyphens", () => {
  assert.ok(!SLUG_RE.test("-abc"));
  assert.ok(!SLUG_RE.test("abc-"));
  assert.ok(!SLUG_RE.test("-"));
  assert.ok(!SLUG_RE.test(""));
});

test("the slug pattern refuses anything but lowercase letters, digits and hyphens", () => {
  assert.ok(!SLUG_RE.test("Gutter"));
  assert.ok(!SLUG_RE.test("gutter hymns"));
  assert.ok(!SLUG_RE.test("gutter_hymns"));
  assert.ok(!SLUG_RE.test("gutter.hymns"));
  assert.ok(!SLUG_RE.test("café"));
});

test("the slug pattern runs from 1 to 40 characters, with 2 an accident of the pattern", () => {
  assert.ok(SLUG_RE.test("a"));
  assert.ok(!SLUG_RE.test("ab"), "two characters cannot match: the optional tail needs at least two");
  assert.ok(SLUG_RE.test("abc"));
  assert.ok(SLUG_RE.test("a".repeat(40)));
  assert.ok(!SLUG_RE.test("a".repeat(41)));
});

test("the slug pattern currently allows doubled hyphens inside", () => {
  // Not intended, but real: slugify never emits this, yet a hand-typed handle passes.
  assert.ok(SLUG_RE.test("a--b"));
});

test("the reserved list covers the site's own paths", () => {
  for (const path of ["admin", "api", "dashboard", "board", "embed", "login", "signup", "terms", "contact"]) {
    assert.ok(RESERVED_SLUGS.has(path), `${path} is a real route but is not reserved`);
  }
});

test("normalizeUsername trims and lowercases, and nothing else", () => {
  assert.equal(normalizeUsername("  GutterHymns  "), "gutterhymns");
  assert.equal(normalizeUsername("GUTTER-HYMNS"), "gutter-hymns");
  assert.equal(normalizeUsername("\tgutter\n"), "gutter");
  // Inner spaces survive normalizing; usernameProblem is what rejects them.
  assert.equal(normalizeUsername(" Gutter Hymns "), "gutter hymns");
});

test("a good handle has no problem", () => {
  assert.equal(usernameProblem("gutter-hymns"), null);
  assert.equal(usernameProblem("abc"), null);
  assert.equal(usernameProblem("a".repeat(40)), null);
  assert.equal(usernameProblem("band99"), null);
});

test("a handle under three characters is refused by length first", () => {
  assert.match(usernameProblem("ab") ?? "", /at least 3 characters/);
  assert.match(usernameProblem("a") ?? "", /at least 3 characters/);
  assert.match(usernameProblem("") ?? "", /at least 3 characters/);
});

test("a handle over forty characters is refused by length", () => {
  assert.match(usernameProblem("a".repeat(41)) ?? "", /under 40 characters/);
});

test("a handle with anything but letters, digits and hyphens is refused by shape", () => {
  for (const bad of ["Gutter Hymns", "gutter_hymns", "gutter.hymns", "-gutter", "gutter-", "GUTTER"]) {
    assert.match(usernameProblem(bad) ?? "", /Letters, digits and hyphens only/, `${bad} was not refused`);
  }
});

test("a reserved path cannot be taken as a handle", () => {
  for (const reserved of ["admin", "dashboard", "signup", "terms"]) {
    assert.match(usernameProblem(reserved) ?? "", /reserved/, `${reserved} was allowed as a handle`);
  }
});

test("every reserved word is one a handle could otherwise have had", () => {
  // A reserved word that the pattern rejects anyway would be dead weight in the list.
  for (const reserved of RESERVED_SLUGS) {
    assert.ok(SLUG_RE.test(reserved), `${reserved} is reserved but could never be typed as a handle`);
  }
});

test("normalizing then checking is what the sign-up path must do", () => {
  // The handle a musician types with stray case or spaces has to survive the round trip.
  assert.equal(usernameProblem(normalizeUsername("  Gutter-Hymns  ")), null);
  assert.match(usernameProblem(normalizeUsername("  Admin  ")) ?? "", /reserved/);
});
