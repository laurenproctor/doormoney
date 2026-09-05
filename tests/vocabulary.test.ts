/*
  The words the site is allowed to use, held by CI rather than by memory.

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
  "src/lib/verification.ts",
  "src/lib/marks.ts",
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
