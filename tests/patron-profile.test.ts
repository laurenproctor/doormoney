/*
  The category-neutral patron and sponsor profile, in the parts that have no database in them.

  Three things are held here. The kinds of patron offered in the form are the kinds the database
  will actually take, read out of migration 0043 rather than retyped. A link on a public profile is
  https, parsed rather than trusted, and checked again on the way back out. And the migration adds
  to what was there: it renames nothing, drops nothing, and turns no old interest into a category.

  What the public views show, and that anonymous and unpublished activity stays off them, is
  checked against a real Postgres in supabase/tests, where the views actually run.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { organizerNounCounted } from "@/lib/categories";
import { LINK_LABEL_MAX, PROFILE_LINKS_MAX, linkText, parseProfileLinks, readProfileLinks } from "@/lib/links";
import { PATRON_KINDS, ProfileDetails, SUPPORT_LABEL, interestsText, parseInterests, patronKindLabel } from "@/lib/profile";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = readFileSync(path.join(ROOT, "supabase/migrations/0043_neutral_profiles.sql"), "utf8");

/** The values inside `column text check (column in (...))`, as the migration spells them. */
function checkList(column: string): string[] {
  const match = MIGRATION.match(new RegExp(`${column} text check \\(${column} in\\s*\\(([^)]*)\\)\\)`));
  assert.ok(match, `migration 0043 constrains ${column}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------
// A person or an organization
// ---------------------------------------------------------------

test("the patron kinds offered are exactly the six the database takes", () => {
  assert.deepEqual(PATRON_KINDS.map((k) => k.key), ["individual", "business", "brand", "nonprofit", "community", "other"]);
  assert.deepEqual(PATRON_KINDS.map((k) => k.key), checkList("profile_kind"));
});

test("a kind of patron is never a category, a role or a payment identity", () => {
  const kinds = new Set<string>(PATRON_KINDS.map((k) => k.key));
  for (const word of ["music", "sports", "film", "theater", "musician", "organizer", "patron", "sponsor", "backer", "customer"]) {
    assert.equal(kinds.has(word), false, `${word} is not a kind of patron`);
  }
});

test("an individual is asked nothing a business would be", () => {
  // The whole form, as a person with nothing to say about an organization would send it.
  const parsed = ProfileDetails.safeParse({ display_name: "Dana Whitfield", profile_kind: "", bio: "", location: "", website: "" });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, { display_name: "Dana Whitfield", profile_kind: null, bio: null, location: null, website: null });
  assert.deepEqual(parseProfileLinks([]), { links: [] });
});

test("an organization says what it is, and the page has a word for it", () => {
  for (const kind of PATRON_KINDS) {
    assert.equal(ProfileDetails.parse({ display_name: "Kettle St. Coffee", profile_kind: kind.key }).profile_kind, kind.key);
    assert.equal(patronKindLabel(kind.key), kind.label);
  }
  assert.equal(patronKindLabel("customer"), null, "an unknown kind gets no label, not a guess");
});

test("a location may be a city, a region, a country or online, and is never required", () => {
  for (const location of ["Accra", "Greater Accra", "Ghana", "Online", "Hull, England"]) {
    assert.equal(ProfileDetails.parse({ display_name: "Kettle St.", location }).location, location);
  }
  assert.equal(ProfileDetails.parse({ display_name: "Kettle St." }).location, null);
});

// ---------------------------------------------------------------
// Interests stay what they were
// ---------------------------------------------------------------

test("interests saved as music preferences read back exactly as typed", () => {
  const stored = ["Jazz", "Chamber music", "New York indie", "Bassoon"];
  assert.deepEqual(parseInterests(interestsText(stored)), { items: stored });
});

test("an interest that happens to be a category name is still only an interest", () => {
  // parseInterests knows nothing about categories, and has to keep knowing nothing.
  const { items, error } = parseInterests("Music\nFilm\nTheater");
  assert.equal(error, undefined);
  assert.deepEqual(items, ["Music", "Film", "Theater"]);
  const statements = MIGRATION.replace(/--.*$/gm, "");
  assert.doesNotMatch(statements, /insert\s+into\s+public\.patron_profile_categories/i, "the migration turns no stored interest into a category");
});

// ---------------------------------------------------------------
// Sponsorships and backings, across categories
// ---------------------------------------------------------------

test("a sponsorship and a backing keep their own names", () => {
  assert.deepEqual(SUPPORT_LABEL, { placement: "Sponsorship", backing: "Backing" });
});

test("a count of who was supported uses the category's own word, and a shared one otherwise", () => {
  assert.equal(organizerNounCounted("music", 2), "musicians");
  assert.equal(organizerNounCounted("sports", 1), "team");
  assert.equal(organizerNounCounted("theater", 2), "theater companies");
  assert.equal(organizerNounCounted("film", 1), "filmmaker");
  assert.equal(organizerNounCounted("dance", 2), "organizers", "a category with no words here is not called music");
  assert.equal(organizerNounCounted(null, 1), "organizer");
});

// ---------------------------------------------------------------
// Links
// ---------------------------------------------------------------

test("an empty links editor saves an empty list", () => {
  const rows = Array.from({ length: PROFILE_LINKS_MAX }, () => ({ label: "", url: "" }));
  assert.deepEqual(parseProfileLinks(rows), { links: [] });
});

test("links are https, parsed rather than trusted, and kept in order", () => {
  const { links, error } = parseProfileLinks([
    { label: "  Our   menu ", url: "kettlest.example/menu" },
    { label: "", url: "https://instagram.com/kettlest" },
  ]);
  assert.equal(error, undefined);
  assert.deepEqual(links, [
    { label: "Our menu", url: "https://kettlest.example/menu" },
    { label: "", url: "https://instagram.com/kettlest" },
  ]);
  assert.equal(linkText(links[0]), "Our menu");
  assert.equal(linkText(links[1]), "instagram.com/kettlest", "a link with no label is called by its own address");
});

test("a link that would not be safe in an href is refused, not dropped", () => {
  for (const url of ["javascript:alert(1)", "http://plain.example", "data:text/html,x", "https://user:pw@evil.example", "https://localhost"]) {
    const result = parseProfileLinks([{ label: "x", url }]);
    assert.ok(result.error, `${url} is refused`);
    assert.deepEqual(result.links, []);
  }
  assert.match(parseProfileLinks([{ label: "Shop", url: "" }]).error ?? "", /needs an address/);
  assert.match(parseProfileLinks([{ label: "x".repeat(LINK_LABEL_MAX + 1), url: "https://a.example" }]).error ?? "", /label/);
  assert.match(parseProfileLinks([{ url: "https://a.example" }, { url: "a.example" }]).error ?? "", /twice/);
  const many = Array.from({ length: PROFILE_LINKS_MAX + 1 }, (_, i) => ({ url: `https://site${i}.example` }));
  assert.match(parseProfileLinks(many).error ?? "", /Up to 6/);
});

test("a stored link is checked again on the way out", () => {
  assert.deepEqual(readProfileLinks(null), []);
  assert.deepEqual(readProfileLinks("https://a.example"), []);
  assert.deepEqual(
    readProfileLinks([
      { label: "Fine", url: "https://a.example/" },
      { label: "Old scheme", url: "http://b.example" },
      { label: "Script", url: "javascript:alert(1)" },
      { url: "https://c.example/" },
      "https://d.example",
      null,
    ]),
    [
      { label: "Fine", url: "https://a.example/" },
      { label: "", url: "https://c.example/" },
    ],
  );
});

// ---------------------------------------------------------------
// The migration
// ---------------------------------------------------------------

test("the migration adds and never renames, drops or guesses", () => {
  const statements = MIGRATION.replace(/--.*$/gm, "");
  assert.doesNotMatch(statements, /\brename\b/i, "no table or column is renamed");
  assert.doesNotMatch(statements, /drop\s+(table|column|view|type)/i, "nothing is dropped, so the views are replaced in place");
  assert.doesNotMatch(statements, /\bupdate\s+public\./i, "no existing row is backfilled with a guess");
  assert.doesNotMatch(statements, /alter table public\.(acts|patron_profiles)[^;]*category/i, "a category is never written onto a profile");
});

test("category preferences are relational and tied to the registry, not a free-form blob", () => {
  assert.match(MIGRATION, /create table public\.patron_profile_categories/);
  assert.match(MIGRATION, /category_key text not null references public\.fundraiser_categories\(key\)/);
  assert.match(MIGRATION, /revoke all on public\.patron_profile_categories from public, anon, authenticated/);
});

test("neither public view selects a private column", () => {
  const views = MIGRATION.slice(MIGRATION.indexOf("create or replace view public.public_patron_profiles"), MIGRATION.indexOf("-- A view is a read path"));
  const selected = views.replace(/--.*$/gm, "").split(/\bfrom\b/i).filter((_, i) => i % 2 === 0).join("\n");
  assert.doesNotMatch(selected, /email|amount|fee_cents|stripe|payment_intent|funding_token|mark_|profile_id\s*,|evidence/i);
  // The anonymity rule survived the replace: the placement arm still refuses an anonymous bid.
  assert.match(views, /not exists \(\s*select 1 from public\.bids b\s+where b\.lot_id = l\.id and b\.patron_id = pu\.patron_id and b\.anonymous/);
  assert.match(views, /where pp\.published\s+and p\.username is not null/);
});
