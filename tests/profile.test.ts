/*
  The optional patron profile, in the parts that have no database in them: what the fields will
  take, what a music preference may be, and when the username is allowed to move.

  The database repeats every one of these as a constraint (migration 0024), and what the two
  public views will show is checked against a real Postgres in supabase/tests/permissions_test.sql
  rather than here: that is the one rule where being wrong is not a bug in a form but a leak, so
  it is tested where the views actually run.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BIO_MAX,
  INTERESTS_MAX,
  ProfileDetails,
  impactTotals,
  initialsFor,
  nextUsernameChange,
  parseInterests,
  profileLink,
  usernameChangeAllowed,
} from "@/lib/profile";

// ---------------------------------------------------------------
// Music preferences
// ---------------------------------------------------------------

test("preferences come off lines or commas, with the whitespace tidied", () => {
  assert.deepEqual(parseInterests("Jazz\nChamber  music, Punk").items, ["Jazz", "Chamber music", "Punk"]);
});

test("blank lines are not preferences, and nothing empty is ever stored", () => {
  const r = parseInterests("Jazz\n\n  \n, ,Punk\n");
  assert.deepEqual(r.items, ["Jazz", "Punk"]);
  assert.equal(r.error, undefined);
  assert.equal(r.items.every((i) => i.trim().length > 0), true);
});

test("anything flexible is allowed: a scene, an instrument, a tradition", () => {
  assert.deepEqual(parseInterests("New York indie\nBassoon\nLive electronic music\nExperimental").items, [
    "New York indie",
    "Bassoon",
    "Live electronic music",
    "Experimental",
  ]);
});

test("the same preference twice is refused rather than quietly dropped", () => {
  const r = parseInterests("Punk\npunk");
  assert.match(r.error ?? "", /twice/);
});

test("a preference longer than the limit is refused", () => {
  const r = parseInterests("x".repeat(41));
  assert.match(r.error ?? "", /under 40/);
});

test("more than eight is refused", () => {
  const nine = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
  const r = parseInterests(nine);
  assert.match(r.error ?? "", new RegExp(`${INTERESTS_MAX}`));
  assert.equal(parseInterests(["a", "b", "c", "d", "e", "f", "g", "h"].join("\n")).error, undefined);
});

test("nothing typed is an empty list, not an error", () => {
  assert.deepEqual(parseInterests("").items, []);
  assert.deepEqual(parseInterests(null).items, []);
});

// ---------------------------------------------------------------
// The fields themselves
// ---------------------------------------------------------------

test("a display name is between two and sixty characters", () => {
  assert.equal(ProfileDetails.safeParse({ display_name: "R" }).success, false);
  assert.equal(ProfileDetails.safeParse({ display_name: "x".repeat(61) }).success, false);
  assert.equal(ProfileDetails.safeParse({ display_name: "Rosie" }).success, true);
});

test("a bio stops at 240 characters and a region at 80", () => {
  assert.equal(ProfileDetails.safeParse({ display_name: "Rosie", bio: "x".repeat(BIO_MAX) }).success, true);
  assert.equal(ProfileDetails.safeParse({ display_name: "Rosie", bio: "x".repeat(BIO_MAX + 1) }).success, false);
  assert.equal(ProfileDetails.safeParse({ display_name: "Rosie", location: "x".repeat(81) }).success, false);
});

test("optional fields come back as null rather than as empty strings", () => {
  const parsed = ProfileDetails.parse({ display_name: "Rosie", bio: "", location: "  ", website: "" });
  assert.equal(parsed.bio, null);
  assert.equal(parsed.location, null);
  assert.equal(parsed.website, null);
});

test("a link is https or it is not a link", () => {
  assert.equal(profileLink("https://rosie.example.com"), "https://rosie.example.com/");
  assert.equal(profileLink("http://rosie.example.com"), null);
  assert.equal(profileLink("javascript:alert(1)"), null);
  assert.equal(profileLink("data:text/html,hi"), null);
  assert.equal(profileLink("rosie"), null);
  // A bare host is read as https, which is the only scheme this page will render.
  assert.equal(profileLink("rosie.example.com"), "https://rosie.example.com/");
  assert.equal(ProfileDetails.safeParse({ display_name: "Rosie", website: "http://rosie.example.com" }).success, false);
});

// ---------------------------------------------------------------
// One change a year
// ---------------------------------------------------------------

test("a word never claimed can be claimed now", () => {
  assert.equal(usernameChangeAllowed(null), true);
  assert.equal(nextUsernameChange(null), null);
});

test("the next change is twelve calendar months on", () => {
  const next = nextUsernameChange("2026-09-04T12:00:00.000Z");
  assert.equal(next?.toISOString(), "2027-09-04T12:00:00.000Z");
});

test("a change is blocked the day before and allowed on the day", () => {
  const claimed = "2026-09-04T12:00:00.000Z";
  assert.equal(usernameChangeAllowed(claimed, new Date("2027-09-03T12:00:00.000Z")), false);
  assert.equal(usernameChangeAllowed(claimed, new Date("2027-09-04T12:00:00.000Z")), true);
  assert.equal(usernameChangeAllowed(claimed, new Date("2027-12-01T00:00:00.000Z")), true);
});

test("a word claimed on a leap day lands on the last day of February, not on 1 March", () => {
  const next = nextUsernameChange("2028-02-29T00:00:00.000Z");
  assert.equal(next?.toISOString().slice(0, 10), "2029-02-28");
});

/*
  The username rules themselves are tested once, in tests/slug.test.ts: length, shape, the reserved
  list and the normalize-then-check round trip. This file used to repeat all of it. The one thing
  that repetition carried and the other file did not was that "patron" and "patrons" are reserved,
  which now lives in slug.test.ts with the rest of the route list.
*/

// ---------------------------------------------------------------
// What the page says about itself
// ---------------------------------------------------------------

test("initials fall back to at most two letters", () => {
  assert.equal(initialsFor("Lauren Proctor"), "LP");
  assert.equal(initialsFor("Rosie"), "RO");
  assert.equal(initialsFor("Kettle St. Coffee"), "KC");
  assert.equal(initialsFor("   "), "?");
});

test("the totals count runs and musicians, and nothing else", () => {
  assert.deepEqual(impactTotals([]), []);
  const activity = [
    { actSlug: "gutter-hymns", actName: "Gutter Hymns", runTitle: "Fall run" },
    { actSlug: "gutter-hymns", actName: "Gutter Hymns", runTitle: "Spring run" },
    { actSlug: "rosie", actName: "Rosie", runTitle: "October" },
  ];
  assert.deepEqual(impactTotals(activity), ["3 fundraisers backed", "2 musicians supported"]);
  assert.deepEqual(impactTotals(activity.slice(0, 1)), ["1 fundraiser backed", "1 musician supported"]);
});

/*
  The rules that have to hold in SQL are tested in SQL.

  Four tests used to sit here. They read supabase/migrations/0024_patron_profiles.sql as text and
  checked that the two public views did not mention amount_cents, email, stripe_ and so on, that
  they filtered on published, that an anonymous bid was excluded, and that the photo bucket was
  created private.

  They now live in supabase/tests/permissions_test.sql, which runs every migration against a real
  Postgres in CI and then asks the database what those views are and what they return. That is
  strictly stronger: the grep read one migration's text, so a later migration replacing a view
  would have left it passing while the view leaked. Each of the four was confirmed to fail against
  a deliberately broken view before the move.
*/
