/*
  The words the site is allowed to use, held by CI rather than by memory.

  Decision 17 starts with four categories and keeps category and geography extensible.
  The contract checks below prevent reintroducing the old company-wide restriction.

  Decision 14 retired a handful of words and CLAUDE.md says to convert a page when you touch it,
  never in a repo-wide replace. That rule is right and it has one failure mode: a page nobody
  touches keeps the old words, and nobody notices until a reader does. Phase 2c converted eleven
  surfaces by hand, and the last thing found by hand was "Take a placement" on the widget, one
  button above a card field. This is what would have found it.

  It reads the source rather than the rendered page, so it is fast and needs no browser. It looks
  only at things a reader could see: JSX text and string literals that read like prose. Selectors,
  paths, class names and single-word identifiers are not prose and are skipped.

  Line comments and asterisk-led block comments are skipped; a plain block comment is not, and that
  is left as it is. A comment teaching the next person the retired word is worth catching too.

  When this fails, it is usually right. The fix is the word, not the test. Add to ALLOWED only for
  a value that is written to the database, sent to another system, or otherwise addressed rather
  than read.
*/
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where a reader's words live. src/lib is listed file by file: most of it is plumbing. */
const DIRECTORIES = ["src/app", "src/components"];
const FILES = [
  "src/lib/site.ts",
  "src/lib/catalog.ts",
  "src/lib/readiness.ts",
  "src/lib/roles.ts",
  "src/lib/profile.ts",
  "src/lib/periods.ts",
  "src/lib/categories.ts",
  "src/lib/verification.ts",
  "src/lib/marks.ts",
  "src/lib/contact.ts",
  "src/lib/category-words.ts",
  "src/lib/record-words.ts",
  "src/lib/starting-categories.ts",
];

/**
 * The four legal pages, deferred on purpose.
 *
 * They use "placement" and "run" in sentences that say what somebody is buying and what happens if
 * it does not run, so the swap is not only cosmetic there. A lawyer reviews these in Phase 7 and
 * will rewrite those sentences anyway; doing the words now means doing them twice. See
 * docs/ROADMAP.md, Phase 2c. Removing a line here is how that decision gets reversed.
 */
const DEFERRED = new Set([
  "src/app/terms/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/refunds/page.tsx",
  "src/app/accessibility/page.tsx",
]);

/**
 * Strings that look like prose and are not.
 *
 * Each one is a value that is written down rather than read: a column value, a channel name, a
 * stored kind. Changing any of them changes behaviour, which is the opposite of what this file is
 * for. Nothing goes here because a sentence was awkward to rewrite.
 */
const ALLOWED = new Set<string>([
  // backings.source, written on every fan payment (migration 0001).
  "widget | board",
  // The Supabase Realtime channel the board listens on.
  "board-bids",
  // runs.kind values, and the mail_runs kind the admin console reads back.
  "new_boards",
]);

/**
 * Words decision 14 retired.
 *
 * "Placement" is deliberately absent: it is still the right word for where a sponsor appears, and
 * only wrong for the thing being bought, which no regular expression can tell apart. "Run" is
 * caught only as a noun, because it is still an ordinary verb: a sponsorship that never runs is
 * correct, a patron backing the run is not.
 */
const RETIRED: [RegExp, string][] = [
  [/\bboards?\b/i, "board"],
  [/\bcampaigns?\b/i, "campaign"],
  [/\bsupporters?\b/i, "supporter"],
  [/\bstandard card\b/i, "standard card"],
  [/\bthe marks?\b/i, "the mark"],
  [/\b(?:the|a|this|each|every|per|one) run\b/i, "run, as a noun"],
  [/\bruns? (?:backed|open|live)\b/i, "run, as a noun"],
  [/\bthe act\b/i, "the act"],
];

const JSX_TEXT = />([^<>{}\n]+)</g;
const STRING = /"([^"\\\n]+)"|'([^'\\\n]+)'|`([^`\\$]+)`/g;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir))) {
      const rel = path.join(dir, entry);
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(rel)) out.push(rel);
    }
  };
  DIRECTORIES.forEach(walk);
  return [...out, ...FILES].filter((f) => !DEFERRED.has(f));
}

/** Everything on this line a reader could plausibly see. */
function prose(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.startsWith("import ") || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return [];
  const found: string[] = [];
  for (const m of line.matchAll(JSX_TEXT)) found.push(m[1]);
  for (const m of line.matchAll(STRING)) found.push(m[1] ?? m[2] ?? m[3]);
  return found
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && /[a-z]{3}/i.test(s) && /\s/.test(s) && !/^[\w.@/-]+$/.test(s) && !ALLOWED.has(s));
}

type Hit = { file: string; line: number; word: string; text: string };

function sweep(): Hit[] {
  const hits: Hit[] = [];
  for (const file of sourceFiles()) {
    readFileSync(path.join(ROOT, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const text of prose(line)) {
          for (const [re, word] of RETIRED) {
            if (re.test(text)) {
              hits.push({ file, line: i + 1, word, text });
              return;
            }
          }
        }
      });
  }
  return hits;
}

/*
  The sentence the sweep above cannot see.

  JSX_TEXT wants the ">" and the "<" on one line, so a paragraph wrapped across lines was never
  read: "The board is private until it is published" sat in the options editor, "Take the board
  down" and "Cancel the run" were buttons, and the widget page still said "the current run", all
  with this file green. This reads those lines: text standing alone between tags, outside a block
  comment, with nothing on it that makes it code.

  The two files behind /mark/<id> are left to the branch that rewrites them
  (feat/materials-not-logos, which replaces both with category-aware words). Remove them from
  BARE_LINE_PENDING when that lands; until then the rule still covers everything else.
*/
const BARE_LINE_PENDING = new Set(["src/app/mark/[id]/MarkForm.tsx", "src/app/mark/[id]/page.tsx"]);

function bareJsxLines(source: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  let inBlock = false;
  source.split("\n").forEach((raw, i) => {
    const t = raw.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      return;
    }
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      inBlock = !t.includes("*/");
      return;
    }
    if (!/^[A-Za-z][^=;{}()<>]*$/.test(t) || t.split(/\s+/).length < 4) return;
    if (/^(import|export|const|let|return|if|else|type|case|default)\b/.test(t)) return;
    found.push({ line: i + 1, text: t });
  });
  return found;
}

test("a sentence wrapped across lines is read too", () => {
  assert.deepEqual(bareJsxLines("<p>\n  The board is private until it is published.\n</p>").map((l) => l.text), ["The board is private until it is published."]);
  assert.deepEqual(bareJsxLines("/*\n  The board is private until it is published.\n*/"), [], "a block comment is not a page");
  assert.deepEqual(bareJsxLines("const a = the board is private"), [], "and neither is code");
  const hits: string[] = [];
  for (const file of sourceFiles().filter((f) => f.endsWith(".tsx") && !BARE_LINE_PENDING.has(f))) {
    for (const { line, text } of bareJsxLines(readFileSync(path.join(ROOT, file), "utf8"))) {
      const word = RETIRED.find(([re]) => re.test(text));
      if (word) hits.push(`  ${file}:${line}  (${word[1]})\n    ${text.slice(0, 100)}`);
    }
  }
  assert.equal(hits.length, 0, `${hits.length} retired word${hits.length === 1 ? "" : "s"} in wrapped copy:\n${hits.join("\n")}`);
});

test("the sweep looks at the pages it claims to", () => {
  const files = sourceFiles();
  assert.ok(files.length > 60, `expected the whole app, found ${files.length} files`);
  assert.ok(files.includes("src/app/page.tsx"), "home");
  assert.ok(files.includes("src/app/embed/[slug]/EmbedClient.tsx"), "the widget");
  assert.ok(files.includes("src/lib/catalog.ts"), "the sponsorship options");
  for (const deferred of DEFERRED) assert.ok(!files.includes(deferred), `${deferred} is deferred`);
});

test("it can still tell a retired word from an allowed one", () => {
  // Guards the detector itself: a sweep that finds nothing because it looks at nothing is worse
  // than no sweep, and these two lines are the shapes it has to keep apart.
  assert.deepEqual(prose('<span>Back the run</span>').length, 1);
  assert.equal(RETIRED.some(([re]) => re.test("Back the run")), true);
  assert.equal(RETIRED.some(([re]) => re.test("A sponsorship that never runs costs nothing")), false);
  assert.equal(RETIRED.some(([re]) => re.test("the dashboard")), false, "dashboard is not a board");
  assert.equal(prose('  source: "widget | board";').length, 0, "a column value is not prose");
});

test("no page a reader can reach uses a word the site retired", () => {
  const hits = sweep();
  const report = hits.map((h) => `  ${h.file}:${h.line}  (${h.word})\n    ${h.text.slice(0, 100)}`).join("\n");
  assert.equal(hits.length, 0, `${hits.length} retired word${hits.length === 1 ? "" : "s"} still on the site:\n${report}`);
});

// The expansion contract is authoritative; historical decisions and mockups are deliberately
// scoped by that contract rather than rewritten as though the music implementation never existed.
const CONTRACT_FILES = ["CLAUDE.md", "README.md", "docs/PRODUCT_CONTRACT.md"];

const RESTRICTED_CONTRACT = [
  /marketplace\s+for\s+working\s+musicians(?:\s+in\s+New\s+York)?/i,
  /patronage\s+market\s+for\s+working\s+musicians/i,
  /identity\s+words\s+carry\s+the\s+company\s+and\s+do\s+not\s+change/i,
  /sponsorship\s+is\s+the\s+mechanism,?\s+not\s+the\s+point/i,
  /(?:only|exclusively)\s+(?:serves?|supports?|for)\s+(?:working\s+)?musicians/i,
  /(?:every|all)\s+(?:organizers?|fundraisers?)\s+(?:is|are|must\s+be)\s+(?:a\s+)?musicians?/i,
  /(?:limited|restricted)\s+to\s+(?:these\s+)?(?:four|4)\s+categories/i,
  /only\s+(?:NYC|New\s+York)(?:-based)?\s+(?:organizers|fundraisers|teams)\s+(?:can|may)\s+(?:join|publish|participate)/i,
  /organizers\s+must\s+be\s+(?:based|located)\s+in\s+(?:NYC|New\s+York)/i,
];

function restrictedContract(text: string): boolean {
  return RESTRICTED_CONTRACT.some((rule) => rule.test(text));
}

test("shared vocabulary permits starting categories and geographic expansion", () => {
  for (const text of [
    "Organizers create fundraisers and offer sponsorships.",
    "Start with music, sports teams, film, and theater; add categories as the model proves itself.",
    "New York may supply early testers; organizers elsewhere are welcome.",
    "An online fundraiser can reach audiences across cities.",
    "Sponsors receive the visibility described in the purchased offer.",
    "A team offers approved signage for its season.",
    "A filmmaker offers a credit in the film.",
    "The theater company offers a program credit.",
    "Musicians set their own prices.",
    "A patron backs the tour.",
    "Evidence documents a deliverable; it does not certify audience reach.",
  ]) {
    assert.equal(RETIRED.some(([rule]) => rule.test(text)), false, text);
    assert.equal(restrictedContract(text), false, text);
  }
});

test("contract guard rejects closed category and city positioning, including multiline copy", () => {
  for (const text of [
    "Sponsorship marketplace for working musicians in New York.",
    "Door Money is a patronage market for working musicians.",
    "Identity words carry the company and do not change.",
    "Sponsorship is the mechanism, not the point.",
    "Door Money exclusively serves musicians.",
    "Every fundraiser must be a musician.",
    "Door Money is limited to four categories.",
    "Only NYC fundraisers can publish.",
    "Only New York-based teams may participate.",
    "Organizers must be based in NYC.",
    "Sponsorship marketplace\nfor working musicians.",
  ]) {
    assert.equal(restrictedContract(text), true, text);
  }
});

test("active product instructions preserve open category and geographic scope", () => {
  for (const file of CONTRACT_FILES) {
    assert.equal(restrictedContract(readFileSync(path.join(ROOT, file), "utf8")), false, file);
  }
  const decisions = readFileSync(path.join(ROOT, "docs/DECISIONS.md"), "utf8");
  const current = decisions.split("## 17. ")[1];
  assert.ok(current, "decision 17 must remain available");
  assert.equal(restrictedContract(current), false, "decision 17");
});

/*
  The patron and sponsor profile surfaces are shared: a person, a business or a nonprofit reaches
  them, supporting any category, so the category is never known there. Music wording stays valid
  where the fundraiser is music; these are the pages where it cannot be assumed. Phrases rather
  than words, because "musician" is still the right word beside a music fundraiser.
*/
const SHARED_PROFILE_SURFACES = [
  "src/components/ProfileForms.tsx",
  "src/app/dashboard/profile/page.tsx",
  "src/app/patron/[username]/page.tsx",
  "src/app/patron/page.tsx",
];
const ASSUMES_MUSIC_OR_A_CITY = [
  /music preferences/i,
  /musical interests/i,
  /musicians? supported/i,
  /back a musician/i,
  /behind (the music|musicians|working musicians)/i,
  /waiting on the musician/i,
  /the musician (page|address)/i,
  /listening for/i,
  /\b(brooklyn|new york|nyc)\b/i,
];

test("no shared profile surface assumes music or a city", () => {
  const found: string[] = [];
  for (const file of SHARED_PROFILE_SURFACES) {
    const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const phrase of ASSUMES_MUSIC_OR_A_CITY) if (phrase.test(line)) found.push(`${file}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(found, []);
});
