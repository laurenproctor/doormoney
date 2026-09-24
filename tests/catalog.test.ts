/*
  The sponsorship options, and the two places they are written down.

  src/lib/catalog.ts is what the app draws. The surfaces table is what lots.surface_key points at,
  so an option that exists only in TypeScript cannot be priced and an option that exists only in SQL
  is invisible. "Keep them in sync" has been a comment at the top of both files since migration
  0001. This is the same instruction, held by CI.

  seen_by is deliberately not compared. The column is not read by the app, which takes those words
  from catalog.ts, and the music rows have already drifted apart there.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CATALOG, GROUPS, musicSurfaces, surfacesForCategory } from "@/lib/catalog";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

type Row = Record<string, string | number | string[] | null>;

/** One SQL literal: a quoted string, a '{a,b}' array, an integer, or null. */
function value(raw: string): string | number | string[] | null {
  const text = raw.trim();
  if (/^null$/i.test(text)) return null;
  if (!text.startsWith("'")) return Number(text);
  const unquoted = text.slice(1, -1).replace(/''/g, "'");
  if (unquoted.startsWith("{") && unquoted.endsWith("}")) {
    const inner = unquoted.slice(1, -1);
    return inner ? inner.split(",") : [];
  }
  return unquoted;
}

/** Split on commas that are not inside quotes or braces. */
function fields(tuple: string): string[] {
  const out: string[] = [];
  let current = "", quoted = false;
  for (let i = 0; i < tuple.length; i++) {
    const char = tuple[i];
    if (char === "'") { quoted = tuple[i + 1] === "'" && quoted ? (current += "''", i++, quoted) : !quoted; if (tuple[i] === "'") current += char; continue; }
    if (char === "," && !quoted) { out.push(current); current = ""; continue; }
    current += char;
  }
  return [...out, current];
}

/** Every surfaces row an `insert into surfaces (...) values (...)` statement writes. */
function surfaceRows(sql: string): Row[] {
  const rows: Row[] = [];
  for (const match of sql.matchAll(/insert into (?:public\.)?surfaces \(([^)]+)\) values\s*([\s\S]*?);/g)) {
    const columns = match[1].split(",").map((c) => c.trim());
    for (const tuple of match[2].matchAll(/^\s*\(([\s\S]*?)\)(?:,|\s*$|\s*on conflict)/gm)) {
      const parts = fields(tuple[1]);
      assert.equal(parts.length, columns.length, `a surfaces row has ${parts.length} values for ${columns.length} columns`);
      rows.push(Object.fromEntries(columns.map((c, i) => [c, value(parts[i])])));
    }
  }
  return rows;
}

const sqlRows = [
  ...surfaceRows(read("supabase/seed.sql")),
  ...surfaceRows(read("supabase/migrations/0040_category_sponsorship_options.sql")),
  ...surfaceRows(read("supabase/migrations/0047_hospitality_draft_category.sql")),
  ...surfaceRows(read("supabase/migrations/20260924162520_digital_workers_category.sql")),
];

test("the parser found both sets of rows, not one of them", () => {
  assert.equal(sqlRows.length, CATALOG.length, "every option is written down once in SQL");
  assert.ok(sqlRows.some((r) => r.key === "kick_head"), "the music rows, from the seed");
  assert.ok(sqlRows.some((r) => r.key === "foyer_banner"), "the new rows, from migration 0040");
  assert.equal(sqlRows.filter((r) => r.category_key === "hospitality").length, 6, "hospitality's six, from migration 0047");
  assert.equal(new Set(sqlRows.map((r) => r.key)).size, sqlRows.length, "no key is written twice");
});

test("catalog.ts and the surfaces table agree on every option", () => {
  for (const surface of CATALOG) {
    const row = sqlRows.find((r) => r.key === surface.key);
    assert.ok(row, `${surface.key} is in catalog.ts but not in any SQL`);
    assert.equal(row.name, surface.name, `${surface.key}: the name is read from the database on a patron's profile`);
    assert.equal(row.group_key, surface.group, `${surface.key}: group`);
    assert.equal(row.category_key ?? "music", surface.category, `${surface.key}: category`);
    assert.equal(row.default_price_cents, surface.defaultPriceCents, `${surface.key}: suggested price`);
    assert.equal(row.default_period, surface.period, `${surface.key}: period`);
    assert.deepEqual(row.applies_to ?? null, surface.appliesTo, `${surface.key}: act types`);
  }
  for (const row of sqlRows) {
    assert.ok(CATALOG.some((s) => s.key === row.key), `${row.key} is in SQL but not in catalog.ts, so nothing can draw it`);
  }
});

test("act types and suggested prices belong to music, and only music", () => {
  // The database says the same thing in surfaces_applies_to_is_music. This is the half of it that
  // fails on the TypeScript side, where the value a form actually reads comes from.
  for (const surface of CATALOG) {
    if (surface.category === "music") {
      assert.ok(surface.appliesTo?.length, `${surface.key}: a music option says which acts it suits`);
      assert.ok(typeof surface.defaultPriceCents === "number", `${surface.key}: music's suggested prices are the ones Door Money has sold`);
    } else {
      assert.equal(surface.appliesTo, null, `${surface.key}: act type is a music idea`);
      assert.equal(surface.defaultPriceCents, null, `${surface.key}: no price has been set here yet, and null says so`);
    }
  }
  assert.equal(musicSurfaces().length, CATALOG.filter((s) => s.category === "music").length);
});

test("every launch category can offer something, and nothing borrows music's options", () => {
  const registry = [...read("supabase/migrations/0038_expansion_foundation.sql").matchAll(/\('([a-z_]+)',\s*'[^']*',\s*array\[/g)].map((m) => m[1]);
  for (const key of registry) {
    // Music is the one that narrows by act type, so it is asked the way its own page asks.
    const options = surfacesForCategory(key, key === "music" ? "touring_band" : null);
    assert.ok(options.length >= 3, `${key} has ${options.length} sponsorship options`);
    assert.ok(options.every((s) => s.category === key), `${key} draws only its own options`);
  }
  assert.deepEqual(surfacesForCategory("music", null), [], "music needs an act type before it can offer anything");
  assert.ok(surfacesForCategory("music", "touring_band").length > 0);
  assert.deepEqual(surfacesForCategory("community", null), [], "a category with no options yet offers none");
});

test("every option's section exists, and the online section is drawn last", () => {
  const order = Object.keys(GROUPS);
  for (const surface of CATALOG) assert.ok(order.includes(surface.group), `${surface.key}: the ${surface.group} section has no heading`);
  assert.equal(order.at(-1), "online", "online sits last, so it is last for every category");
});
