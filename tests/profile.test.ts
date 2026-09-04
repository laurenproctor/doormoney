/*
  The optional patron profile, in the parts that have no database in them: what the fields will
  take, what a music preference may be, and when the username is allowed to move.

  The database repeats every one of these as a constraint (migration 0023). The last test in this
  file reads that migration and checks the two public views select nothing private, because that is
  the one rule where being wrong is not a bug in a form but a leak.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { normalizeUsername, usernameProblem } from "@/lib/username";

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

test("a username has to pass the same rules a board address does, and patron is reserved", () => {
  assert.equal(usernameProblem("lauren"), null);
  assert.match(usernameProblem("ab") ?? "", /3 characters/);
  assert.match(usernameProblem("x".repeat(41)) ?? "", /under 40/);
  assert.match(usernameProblem("-lauren") ?? "", /Letters, digits and hyphens/);
  assert.match(usernameProblem("Lauren Proctor") ?? "", /Letters, digits and hyphens/);
  for (const reserved of ["patron", "patrons", "signup", "dashboard", "board", "admin"]) {
    assert.match(usernameProblem(reserved) ?? "", /reserved/, `${reserved} should be reserved`);
  }
});

test("a username is normalised before any of that is asked", () => {
  assert.equal(normalizeUsername("  Lauren  "), "lauren");
});

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
  assert.deepEqual(impactTotals(activity), ["3 runs backed", "2 musicians supported"]);
  assert.deepEqual(impactTotals(activity.slice(0, 1)), ["1 run backed", "1 musician supported"]);
});

// ---------------------------------------------------------------
// The one rule that has to hold in SQL
// ---------------------------------------------------------------

const migration = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations", "0023_patron_profiles.sql"),
  "utf8",
);

/** The text of one `create view ... as ... ;` statement. */
function viewBody(name: string) {
  const start = migration.indexOf(`create view ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const end = migration.indexOf("grant select on", start);
  assert.notEqual(end, -1, `${name} should be granted`);
  return migration.slice(start, end);
}

test("the public views select nothing private", () => {
  const forbidden = [
    "amount_cents",
    "fee_cents",
    "refunded_cents",
    "refunded_at",
    "email",
    "stripe_",
    "mark_",
    "profile_id,",
    "payment_intent",
    "funding_token",
  ];
  for (const view of ["public_patron_profiles", "public_patron_activity"]) {
    const body = viewBody(view);
    for (const word of forbidden) {
      assert.equal(body.includes(word), false, `${view} must not select ${word}`);
    }
  }
});

test("the public views only show what was published, twice over", () => {
  for (const view of ["public_patron_profiles", "public_patron_activity"]) {
    assert.match(viewBody(view), /pp\.published/, `${view} must require a published profile`);
  }
  // Activity has to be ticked (a patron_profile_items row) and paid before it is public.
  const activity = viewBody("public_patron_activity");
  assert.match(activity, /from patron_profile_items i/);
  assert.equal((activity.match(/payment_status in \('held', 'released', 'partially_refunded'\)/g) ?? []).length, 2);
});

test("an anonymous bid keeps a placement off the public view", () => {
  assert.match(viewBody("public_patron_activity"), /b\.anonymous/);
  assert.match(viewBody("public_patron_activity"), /not exists/);
});

test("the profile and the ticks are private by default, and the photo bucket is not public", () => {
  assert.match(migration, /published boolean not null default false/);
  assert.match(migration, /'patron-photos', 'patron-photos', false/);
  // No storage policy is added at all, so nothing in the bucket is readable without a signed link.
  assert.equal(/on storage\.objects/.test(migration), false);
});
