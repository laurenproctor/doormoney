/*
  The optional patron profile, in the parts that have no database in them: what the fields will
  take, what an interest may be, what kind of patron a profile may be for, and when the username
  is allowed to move.

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
  patronKindLabel,
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

test("the totals count fundraisers and the people behind them, and nothing else", () => {
  assert.deepEqual(impactTotals([]), []);
  const activity = [
    { actSlug: "gutter-hymns", actName: "Gutter Hymns", runTitle: "Fall run", categoryKey: "music" },
    { actSlug: "gutter-hymns", actName: "Gutter Hymns", runTitle: "Spring run", categoryKey: "music" },
    { actSlug: "rosie", actName: "Rosie", runTitle: "October", categoryKey: "music" },
  ];
  // A page of music still says musicians: the noun follows the fundraisers, and these are music.
  assert.deepEqual(impactTotals(activity), ["3 fundraisers backed", "2 musicians supported"]);
  assert.deepEqual(impactTotals(activity.slice(0, 1)), ["1 fundraiser backed", "1 musician supported"]);
});

test("the totals never call a team or a theater company a musician", () => {
  const season = { actSlug: "harbor-fc", actName: "Harbor FC", runTitle: "Spring season", categoryKey: "sports" };
  const play = { actSlug: "second-stage", actName: "Second Stage", runTitle: "A Number", categoryKey: "theater" };
  const tour = { actSlug: "gutter-hymns", actName: "Gutter Hymns", runTitle: "Fall run", categoryKey: "music" };
  assert.deepEqual(impactTotals([season]), ["1 fundraiser backed", "1 team supported"]);
  assert.deepEqual(impactTotals([play, { ...play, actSlug: "third-stage" }]), ["2 fundraisers backed", "2 theater companies supported"]);
  // Across categories there is no one noun, so the shared one is used.
  assert.deepEqual(impactTotals([season, play, tour]), ["3 fundraisers backed", "3 organizers supported"]);
  // A category this build has no words for, and a row with no category at all, are both organizers.
  assert.deepEqual(impactTotals([{ ...season, categoryKey: "dance" }]), ["1 fundraiser backed", "1 organizer supported"]);
  assert.deepEqual(impactTotals([{ actSlug: "x", actName: "X", runTitle: "Y" }]), ["1 fundraiser backed", "1 organizer supported"]);
});

test("a profile may be for a person or an organization, and may decline to say", () => {
  const base = { display_name: "Kettle St. Coffee" };
  assert.equal(ProfileDetails.parse(base).profile_kind, null, "nothing said stores nothing");
  assert.equal(ProfileDetails.parse({ ...base, profile_kind: "" }).profile_kind, null);
  assert.equal(ProfileDetails.parse({ ...base, profile_kind: "business" }).profile_kind, "business");
  assert.equal(ProfileDetails.safeParse({ ...base, profile_kind: "musician" }).success, false, "a category or a role is not a kind of patron");
  assert.equal(patronKindLabel("nonprofit"), "Nonprofit");
  assert.equal(patronKindLabel(null), null);
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

// ---------------------------------------------------------------
// The Other tag and the page color (migration 0050)
// ---------------------------------------------------------------

test("the Other tag is a few of the patron's own words, and nothing when Other is not ticked", async () => {
  const { CUSTOM_TAG_MAX, parseCustomTag } = await import("@/lib/profile");
  assert.deepEqual(parseCustomTag(false, "Community radio"), { value: null }, "unticked clears it");
  assert.deepEqual(parseCustomTag(true, "  Community \n radio "), { value: "Community radio" }, "one line, tidied");
  assert.ok(parseCustomTag(true, "").error, "ticked and empty says so instead of saving nothing quietly");
  assert.ok(parseCustomTag(true, "x".repeat(CUSTOM_TAG_MAX + 1)).error);
  assert.equal(parseCustomTag(true, "x".repeat(CUSTOM_TAG_MAX)).value?.length, CUSTOM_TAG_MAX);
  assert.ok(parseCustomTag(true, "www.spam.example").error, "a tag is not a link");
  // It stays text. Typing a real category's name does not become that category.
  assert.deepEqual(parseCustomTag(true, "Music"), { value: "Music" });
});

test("the page colors are the design system's themes, the same list the database checks, and mono is not one", async () => {
  const { DEFAULT_PROFILE_THEME, PROFILE_THEMES, isProfileTheme, profileTheme } = await import("@/lib/profile");
  const { THEMES } = await import("@/components/Theme");
  const { readFileSync } = await import("node:fs");
  const keys = PROFILE_THEMES.map((t) => t.key);
  for (const key of keys) assert.ok((THEMES as readonly string[]).includes(key), `${key} is a real theme with tokens in globals.css`);
  assert.equal(keys.includes("mono" as never), false, "mono is the legal pages' light");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  for (const key of keys) assert.match(css, new RegExp(`\\[data-theme="${key}"\\]`), `${key} has tokens`);
  const sql = readFileSync(new URL("../supabase/migrations/0050_patron_profile_customization.sql", import.meta.url), "utf8");
  const allowed = sql.match(/theme in \(([^)]*)\)/)![1].split(",").map((k) => k.trim().replace(/'/g, ""));
  assert.deepEqual([...allowed].sort(), [...keys].sort(), "the form and the constraint offer the same lights");

  assert.equal(DEFAULT_PROFILE_THEME, "blue", "a profile that never chose is lit as it always was");
  assert.equal(profileTheme(null), "blue");
  assert.equal(profileTheme("teal"), "teal");
  for (const bad of ["#ff00ff", "mono", "", "Teal", "red;"]) {
    assert.equal(profileTheme(bad), "blue", `${bad}: an unknown value never reaches a page`);
    assert.equal(isProfileTheme(bad), false, bad);
  }
});

test("the public page is lit by the profile and writes no color of its own", async () => {
  const { readFileSync } = await import("node:fs");
  // The page holds the light; the body it draws moved to the component the owner's preview shares.
  const page = readFileSync(new URL("../src/app/patron/[username]/page.tsx", import.meta.url), "utf8");
  const view = readFileSync(new URL("../src/components/PatronProfileView.tsx", import.meta.url), "utf8");
  assert.match(page, /<Theme name=\{profile\.theme\}>/);
  assert.match(view, /<HeroArt theme=\{profile\.theme\} src=\{header\} signed=\{Boolean\(header\)\} \/>/, "the header is a signed link from the private bucket, never a public address");
  for (const source of [page, view]) assert.doesNotMatch(source, /#[0-9a-f]{6}\b|style=\{\{[^}]*color/i, "no hex and no inline color");
});
