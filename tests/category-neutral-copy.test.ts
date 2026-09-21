/*
  The shared frontend stays category-neutral, and music keeps music's words.

  Decision 17 made Door Money a sponsorship product that starts with four categories and is not
  limited to them, in any city. tests/vocabulary.test.ts holds the retired words and
  tests/domain-components.test.ts holds the domain components. This file holds the rest of the
  shared frontend: the marketing pages, the sign-in pages, the shared strings, and the helpers that
  choose a category's words where money is concerned (the line beside the pay button, the dashboard's
  materials labels, the new-fundraisers email).

  Pages are read from source, the way the vocabulary sweep reads them: a page pulls in next/link and
  the database, and neither renders under the test runner. Components that can render do.

  When this fails, the fix is the copy. A phrase goes on a shared surface only if it is true of a
  team, a filmmaker and a theater company as well as a musician.
*/
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { StartingCategories } from "@/components/StartingCategories";
import { organizerLabel, organizerNoun } from "@/lib/categories";
import { categoryWords } from "@/lib/category-words";
import { materialsLabels, workAction, LOGO_LABELS, type WorkRow } from "@/lib/dashboardModel";
import { newBoardsEmail } from "@/lib/email";
import { checkoutTerms, materialsPrompt, recordWords, releaseSentence } from "@/lib/record-words";
import { HOUSE_RULES, NAV, SITE } from "@/lib/site";
import { AVAILABILITY_NOTE, CATEGORY_TEST, STARTING_CATEGORIES, STARTING_CATEGORIES_NOTE } from "@/lib/starting-categories";

const ROOT = path.join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
/** Source with comments out, so a comment explaining a retired phrase does not trip the rule about it. */
const code = (file: string) => read(file).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const NON_MUSIC = ["sports", "film", "theater"] as const;
/** Words that belong to music, or to music's release rule, and to nobody else. */
const MUSIC_ONLY = /musician|\bbands?\b|\bshows?\b|\btours?\b|\bmerch\b|\blogos?\b|\bgigs?\b|every Friday|weekly/i;

// ---------------------------------------------------------------
// The four starting categories, and the sentence that keeps them a start
// ---------------------------------------------------------------

test("the starting categories are the contract's six, by the registry's keys and names", () => {
  assert.deepEqual(STARTING_CATEGORIES.map((c) => c.key), ["music", "sports", "film", "theater", "hospitality", "other"]);
  assert.deepEqual(STARTING_CATEGORIES.map((c) => c.label), ["Music", "Sports teams", "Film", "Theater", "Restaurants & hospitality", "Other"]);
  for (const c of STARTING_CATEGORIES) {
    assert.match(c.placements, /^Possible placements include /, `${c.key}: an example is a possibility, never an included benefit`);
    assert.doesNotMatch(`${c.funds} ${c.placements}`, /guarantee|verified|certif|impressions/i, c.key);
  }
});

test("the section renders all six without counting them, says they are a start and not a limit, and says what is open today", () => {
  const out = text(renderToStaticMarkup(createElement(StartingCategories, { labels: {} })));
  for (const name of ["Music", "Sports teams", "Film", "Theater", "Restaurants & hospitality", "Other"]) assert.ok(out.includes(name), name);
  assert.doesNotMatch(out, /\b(?:four|five|six) categories\b/i, "the heading never counts a set that grows");
  assert.ok(out.includes(STARTING_CATEGORIES_NOTE));
  assert.match(out, /A start, not a limit/);
  for (const line of CATEGORY_TEST) assert.ok(out.includes(line), line);
  assert.ok(out.includes(AVAILABILITY_NOTE), "and it never implies every category can be sponsored already");
  assert.doesNotMatch(AVAILABILITY_NOTE, /hospitality|restaurant|\bOther\b/, "a draft-only category is never named as open");
  assert.match(AVAILABILITY_NOTE, /Music fundraisers are open/);
  assert.match(AVAILABILITY_NOTE, /private drafts/);
  // The registry's name wins over the fallback, so a renamed category is renamed here too.
  assert.match(text(renderToStaticMarkup(createElement(StartingCategories, { labels: { sports: "Teams and clubs" } }))), /Teams and clubs/);
});

test("the homepage and how-sponsorship-works both carry the four categories", () => {
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
  // The one line that names the city says where Door Money was built, and claims no reach it cannot support.
  assert.match(SITE.origin, /^Built in New York\./);
  assert.doesNotMatch(SITE.origin, /only|everywhere|every country|worldwide/i);
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

test("the site-wide strings and the house rules name no category, payout day or city", () => {
  assert.equal(SITE.tagline, "Put money behind work people care about.");
  assert.equal(SITE.strap, "Relevant audiences. Meaningful sponsorships.");
  assert.equal(SITE.taglineSecond, "Organizers fund work with a clear purpose. Sponsors receive the visibility described in the offer.");
  for (const line of [SITE.tagline, SITE.taglineSecond, SITE.strap, SITE.thesis, SITE.signoff, ...HOUSE_RULES]) {
    assert.doesNotMatch(line, MUSIC_ONLY, line);
    assert.doesNotMatch(line, /New York|NYC|—/, line);
  }
  assert.equal(HOUSE_RULES.length, 5);
  assert.match(HOUSE_RULES.join(" "), /organizer decides/);
  assert.match(HOUSE_RULES.join(" "), /materials/);
  assert.match(HOUSE_RULES.join(" "), /promises no sales, reach or results/);
  assert.equal(SITE.musicTagline, "Put money behind the music.", "decision 1's line survives, for music's own surfaces");
});

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

// ---------------------------------------------------------------
// Addresses outlive words
// ---------------------------------------------------------------

test("labels moved, and the one address that moved left its old one working", () => {
  // The index went to /fundraisers, the word the nav already used. /auctions redirects there
  // (tests/reserved-names.test.ts holds the redirect). Every other address is where it was.
  assert.deepEqual(NAV.map((n) => n.href), ["/how-sponsorship-works", "/fundraisers", "/list", "/contact"]);
  assert.match(read("next.config.ts"), /\{ source: "\/auctions", destination: "\/fundraisers", permanent: false \}/);
  assert.deepEqual(NAV.map((n) => n.label), ["How sponsorship works", "Fundraisers", "For organizers", "Contact"]);
  for (const route of ["src/app/fundraisers/page.tsx", "src/app/list/page.tsx", "src/app/board/[slug]/page.tsx", "src/app/mark/[id]/page.tsx", "src/app/embed/[slug]/page.tsx", "src/app/widget/page.tsx", "src/app/record/[id]/page.tsx", "src/app/claim/[token]/page.tsx", "src/app/patron/[username]/page.tsx"]) {
    assert.ok(existsSync(path.join(ROOT, route)), `${route} still answers`);
  }
  // The tables and columns the copy stopped naming are still what the code reads.
  const boards = read("src/lib/boards.ts");
  for (const table of ['from("acts")', 'from("runs")', 'from("lots")']) assert.ok(boards.includes(table), table);
  assert.match(read("src/lib/dashboard.ts"), /mark_status/);
  assert.match(read("src/lib/patrons.ts") + read("src/lib/patronprofile.ts"), /patrons/);
  // Stored values keep their keys even where the label a reader sees changed.
  assert.match(read("src/lib/contact.ts"), /\["list_an_act", "Create a fundraiser"\]/);
});

// ---------------------------------------------------------------
// Where a category's words decide what somebody is told about money
// ---------------------------------------------------------------

test("the line beside the pay button: music keeps Fridays and the logo, nobody else hears of either", () => {
  assert.equal(
    checkoutTerms(recordWords("music", "tour"), "Gutter Hymns"),
    "Door Money holds the money and pays Gutter Hymns every Friday through the tour. Gutter Hymns approves the logo before anything goes up.",
  );
  for (const key of [...NON_MUSIC, "community_dance"]) {
    const line = checkoutTerms(recordWords(key, null), "Fenland Rovers");
    assert.doesNotMatch(line, MUSIC_ONLY, key);
    assert.match(line, /documents each deliverable/, key);
    assert.match(line, /accepts the sponsor's materials/, key);
    assert.doesNotMatch(line, /verified|confirmed|certif|guarantee/i, key);
  }
  // With no category handed in, the checkout names nobody's.
  const fallback = code("src/components/LotCheckout.tsx");
  assert.match(fallback, /releases it under the fundraiser's terms/);
  assert.doesNotMatch(fallback, /the musician|the mark\b|every Friday/);
});

test("record and release words: neutral outside music, music's own inside it", () => {
  for (const key of NON_MUSIC) {
    const w = recordWords(key, null);
    const all = [w.periodNoun, w.organizer, w.materials, w.sendLabel, w.replaceLabel, releaseSentence(w, "X"), ...Object.values(materialsPrompt(w, { status: "none", organizerName: "X", what: "the program credit" })), ...Object.values(materialsPrompt(w, { status: "submitted", organizerName: "X", what: "the program credit" }))].join(" ");
    assert.doesNotMatch(all, MUSIC_ONLY, key);
    assert.match(all, /materials/, key);
  }
  const music = recordWords("music", "tour");
  assert.deepEqual([music.periodNoun, music.organizer, music.materials, music.sendLabel], ["tour", "musician", "logo", "Send the logo"]);
  assert.match(releaseSentence(music, "Gutter Hymns"), /pays Gutter Hymns weekly through the tour/);
});

test("an unknown or future category falls back to organizer, fundraiser and materials", () => {
  for (const key of ["community_dance", "", null, undefined]) {
    assert.equal(organizerNoun(key), "organizer", String(key));
  }
  const w = categoryWords("community_dance");
  assert.deepEqual([w.organizer, w.organizerTitle, w.fundraiser, w.materials, w.appearances], ["organizer", "Organizer", "fundraiser", "materials", "sponsors"]);
  const r = recordWords("community_dance", "tour");
  assert.deepEqual([r.music, r.periodNoun, r.organizer, r.materials], [false, "fundraiser", "organizer", "materials"], "a stored music kind does not make another category a tour");
  assert.equal(organizerLabel("community_dance", null, null), "Organizer", "and no city is invented for it");
  assert.equal(organizerLabel("sports", null, "Ely"), "Team, Ely");
});

test("the dashboard asks for a logo in music and for materials everywhere else", () => {
  const row = { id: "1", sponsor: "S", option: "O", amountCents: 100, logo: "review", paymentStatus: "held", markNote: null, markText: null, markUrl: null } as WorkRow;
  assert.deepEqual(workAction(row), { kind: "review", label: "Review logo" }, "music is the default, and is what it was");
  assert.deepEqual(materialsLabels("music"), LOGO_LABELS);
  for (const key of [...NON_MUSIC, "community_dance"]) {
    assert.deepEqual(workAction(row, key), { kind: "review", label: "Review materials" }, key);
    assert.equal(materialsLabels(key).waiting, "Waiting for materials", key);
    assert.doesNotMatch(Object.values(materialsLabels(key)).join(" "), /logo/i, key);
  }
  const editor = code("src/app/dashboard/runs/[id]/page.tsx");
  assert.match(editor, /Price the sponsorship options/);
  assert.doesNotMatch(editor, /Price the spots/);
});

test("the new-fundraisers email counts shows for music only, and prints nothing it was not given", () => {
  const base = { to: "a@example.test", firstName: "Dana", unsubscribeUrl: "https://example.test/u" };
  const music = newBoardsEmail({ ...base, boards: [{ actName: "Gutter Hymns", city: "Leeds", runTitle: "Fall tour", showCount: 12, dates: "Oct 3 to Nov 2", openSpots: 4, fromCents: 30000, boardUrl: "https://example.test/gutter-hymns" }] });
  assert.match(music.text, /Gutter Hymns, Leeds\. Fall tour, 12 shows, Oct 3 to Nov 2\. 4 sponsorships open, from \$300/);
  const theater = newBoardsEmail({ ...base, boards: [{ actName: "The Attic Company", city: null, runTitle: "A Number", showCount: null, dates: null, openSpots: 1, fromCents: null, boardUrl: "https://example.test/attic" }] });
  assert.match(theater.text, /The Attic Company\. A Number\. one sponsorship open\./);
  for (const out of [theater.text, theater.html]) assert.doesNotMatch(out, /null|undefined|\bshows?\b|musician|, \./, "no invented city, count or date");
  const two = newBoardsEmail({ ...base, boards: [{ actName: "A", city: null, runTitle: "T", showCount: null, dates: null, openSpots: 2, fromCents: null, boardUrl: "https://example.test/a" }, { actName: "B", city: null, runTitle: "U", showCount: null, dates: null, openSpots: 2, fromCents: null, boardUrl: "https://example.test/b" }] });
  assert.match(two.text, /2 organizers opened fundraisers/);
  assert.doesNotMatch(two.text + music.text, /musicians who are already playing|pays them weekly/);
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
