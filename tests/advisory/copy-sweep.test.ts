/*
  The copy sweep: the shared frontend read from source, looking for music or New York standing in
  for the product. Advisory, not a gate.

  These tests read page files as text and match phrases with regular expressions. They were the
  source-reading half of tests/category-neutral-copy.test.ts, and the half that failed most often on
  a wording change that was fine. The behavior half (the words a category's helpers choose, the
  email, the site strings, the addresses) stays in that file and in the gate.

  Run with `npm run test:copy`. CI does not run it. Run it after a copy pass over a shared page,
  and read a failure as a question, not a verdict: the scanner is a heuristic, and CLAUDE.md's
  voice rules and vocabulary section are the rule.

  Pages are read from source because a page pulls in next/link and the database, and neither
  renders under the test runner.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.join(import.meta.dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
/** Source with comments out, so a comment explaining a retired phrase does not trip the rule about it. */
const code = (file: string) => read(file).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------
// The two marketing pages that carry the starting categories
// ---------------------------------------------------------------

test("the homepage and how-sponsorship-works both mount the starting categories", () => {
  for (const file of ["src/app/page.tsx", "src/app/how-sponsorship-works/page.tsx"]) {
    assert.match(code(file), /<StartingCategories\b/, `${file} mounts the starting categories`);
  }
});

test("the homepage does not sell music's catalog as the product", () => {
  const home = code("src/app/page.tsx");
  assert.doesNotMatch(home, /musicSurfaces|@\/lib\/catalog|WIDGET_TIERS|defaultPriceCents/, "no music inventory, and no music price, on the shared homepage");
  for (const phrase of ["Find a sponsorship", "Create a fundraiser", "Organizers raising now", "Sponsors receive specified visibility in the places the work already reaches."]) {
    assert.ok(home.includes(phrase), phrase);
  }
  assert.match(home, /Put money behind work people/);
  assert.match(home, /<CategoryBadge\b/, "every fundraiser card names its own category");
});

test("how sponsorship works is five neutral steps, and leaves each fundraiser its own release terms", () => {
  const how = code("src/app/how-sponsorship-works/page.tsx");
  for (const step of ["An organizer opens a fundraiser", "A sponsor chooses a sponsorship option", "The organizer approves the sponsor's materials", "The organizer delivers the promised placement", "Door Money documents delivery and releases funds"]) {
    assert.ok(how.includes(step), step);
  }
  assert.match(how, /Each fundraiser states its own delivery and release\s+terms/);
  assert.doesNotMatch(how, /How music|every Friday|kick drum|merch table|musicSurfaces|@\/lib\/catalog|VERIFICATION_METHODS/i);
  // Music's options and suggested prices were moved, not deleted.
  const music = code("src/app/how-sponsorship-works/music/page.tsx");
  assert.match(music, /musicSurfaces\(\)/);
  assert.match(music, /StageSchematic/);
  assert.match(music, /VERIFICATION_METHODS/);
});

// ---------------------------------------------------------------
// Shared marketing and sign-in copy
// ---------------------------------------------------------------

const SHARED_SURFACES = [
  "src/lib/site.ts",
  "src/lib/starting-categories.ts",
  "src/lib/contact.ts",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/how-sponsorship-works/page.tsx",
  "src/app/fundraisers/page.tsx",
  "src/app/list/page.tsx",
  "src/app/signup/page.tsx",
  "src/app/login/page.tsx",
  "src/app/patron/signup/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/not-found.tsx",
  "src/app/dashboard/account/page.tsx",
  "src/components/Nav.tsx",
  "src/components/Footer.tsx",
  "src/components/Page.tsx",
  "src/components/AuthShell.tsx",
  "src/components/Newsletter.tsx",
  "src/components/NewsletterForm.tsx",
  "src/components/StartingCategories.tsx",
  "src/components/LotCheckout.tsx",
  "src/components/FundraiserDraftForm.tsx",
];

/**
 * Phrases, not words: "musician" is still right in a sentence that is about music, and the homepage
 * has one. What is wrong on a shared surface is music, or New York, standing in for the product.
 */
const MUSIC_AS_THE_PRODUCT: RegExp[] = [
  /behind the music/i,
  /back the music/i,
  /working musicians/i,
  /back a musician/i,
  /list an act/i,
  /musicians\. patrons\./i,
  /musicians and patrons/i,
  /musicians raising/i,
  /any musician/i,
  /(?:new|next) musicians?\b/i,
  /music sponsorship/i,
  /for musicians\b/i,
  /the musician (?:gets paid|always has|approves|makes the final)/i,
  /musicians get paid/i,
  /paid every Friday/i,
  /before the first show/i,
  /music is live/i,
  /track not found/i,
  /missed the set/i,
  /live boards/i,
];
const A_CITY_AS_THE_BOUNDARY: RegExp[] = [
  /\bSITE\.city\b/,
  /\bin NYC\b/i,
  /(?:runs|operates|happening|based|only) in (?:New York|NYC)/i,
  /New York(?: City)?(?:-based)? (?:musicians|organizers|fundraisers|teams|only)/i,
  /the city's/i,
];
const NOT_WHAT_THIS_IS: RegExp[] = [/\bdonat(?:e|ion)s?\b(?! or)(?!,)/i, /tax[- ]deductible/i, /\breturn on investment\b/i, /guaranteed (?:sales|customers|reach|results)/i, /verified by Door Money/i];

test("shared marketing and sign-in copy does not describe Door Money as music-only", () => {
  const found: string[] = [];
  for (const file of SHARED_SURFACES) {
    code(file).split("\n").forEach((line, i) => {
      // Decision 1's tagline is kept by name for music's own surfaces. It is the one exception, and it is a key, not a page.
      if (/^\s*musicTagline:/.test(line)) return;
      for (const phrase of MUSIC_AS_THE_PRODUCT) if (phrase.test(line)) found.push(`${file}:${i + 1} (${phrase.source}) ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(found, []);
});

test("no marketing page presents New York as an eligibility boundary", () => {
  const found: string[] = [];
  for (const file of SHARED_SURFACES.filter((f) => f !== "src/lib/site.ts")) {
    code(file).split("\n").forEach((line, i) => {
      for (const phrase of A_CITY_AS_THE_BOUNDARY) if (phrase.test(line)) found.push(`${file}:${i + 1} ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(found, []);
});

test("the shared pages promise no donation, investment or guaranteed result", () => {
  for (const file of SHARED_SURFACES) {
    for (const line of code(file).split("\n")) {
      // Saying what a sponsorship is not is the one place these words belong.
      if (/\bnot\b|\bno\b|never|nothing/i.test(line)) continue;
      for (const phrase of NOT_WHAT_THIS_IS) assert.doesNotMatch(line, phrase, `${file}: ${line.trim().slice(0, 100)}`);
    }
  }
});

// ---------------------------------------------------------------
// Pages where music's words are music's, and nobody else's
// ---------------------------------------------------------------

test("the organizer profile form offers music's subtypes as music's, never as kinds of organizer", () => {
  const form = code("src/components/ActForm.tsx");
  assert.match(form, /Music profile type, optional/);
  assert.match(form, /\["", "Not specified"\]/);
  assert.doesNotMatch(form, />Organizer type</);
  for (const value of ["touring_band", "house_act", "soloist"]) assert.ok(form.includes(`"${value}"`), `${value} is still the stored value`);
});

test("the widget page says it is music's, and the organizer page does not sell it to everyone", () => {
  assert.match(code("src/app/widget/page.tsx"), /Music fundraiser widget/);
  const list = code("src/app/list/page.tsx");
  assert.match(list, /For music fundraisers/);
  assert.match(list, /Other categories do not have a widget yet/);
  assert.doesNotMatch(list, /Kick drum head|Guitar straps|Amp grilles|Tip jar card/, "music's inventory is not everybody's");
});

test("with no category handed in, the checkout names nobody's terms", () => {
  const fallback = code("src/components/LotCheckout.tsx");
  assert.match(fallback, /releases it under the fundraiser's terms/);
  assert.doesNotMatch(fallback, /the musician|the mark\b|every Friday/);
});

test("the fundraiser workspace prices sponsorship options, not spots", () => {
  const editor = code("src/app/dashboard/runs/[id]/page.tsx");
  assert.match(editor, /Price the sponsorship options/);
  assert.doesNotMatch(editor, /Price the spots/);
});

test("public organizer and fundraiser pages name the category and never invent a count, a city or a date", () => {
  const organizer = code("src/app/[slug]/page.tsx");
  assert.match(organizer, /<CategoryBadge\b/);
  assert.doesNotMatch(organizer, /\{run\.showCount\} \{periodOf/, "a show count is music's, and only when there is one");
  assert.match(organizer, /act\.city &&/, "no city, no line");
  const fundraiser = code("src/app/[slug]/[run]/BoardView.tsx");
  assert.match(fundraiser, /<CategoryBadge\b/);
  for (const answer of ["FundingPurpose", "AudienceSummary", "SponsorPromise"]) assert.match(fundraiser, new RegExp(`<${answer}\\b`), answer);
  assert.match(fundraiser, /music && <div id="fans"/, "backings and the widget stay music's");
});
