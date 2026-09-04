/*
  The reserved handle list exists twice: once in TypeScript for the message a musician sees while
  typing, and once in Postgres (migration 0022) for the rule that actually holds. handle_new_user
  copies the username straight out of the auth user's metadata, which the client controls at signup,
  so the database list is the one that stops somebody claiming "admin". If the two drift, the UI
  promises one thing and the database enforces another.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RESERVED_SLUGS } from "@/lib/slug";

const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");

/**
 * Every name any migration seeds into reserved_handles.
 *
 * Read across the whole directory rather than out of one file: 0022 creates the table and seeds
 * the routes that existed then, and a later migration seeds the routes it introduces itself
 * (0024 does, for /patron). What the database ends up reserving is the union of those, so the
 * union is what has to match RESERVED_SLUGS.
 */
function reservedInMigrations(): string[] {
  const names: string[] = [];
  let seeded = false;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    for (const m of sql.matchAll(/insert into public\.reserved_handles[\s\S]*?on conflict/g)) {
      seeded = true;
      for (const n of m[0].matchAll(/\('([a-z0-9-]+)'\)/g)) names.push(n[1]);
    }
  }
  assert.ok(seeded, "no migration seeds reserved_handles any more");
  return names;
}

test("the database reserves exactly what TypeScript reserves", () => {
  const inDb = new Set(reservedInMigrations());
  const inTs = RESERVED_SLUGS;
  const missingFromDb = [...inTs].filter((n) => !inDb.has(n));
  const missingFromTs = [...inDb].filter((n) => !inTs.has(n));
  assert.deepEqual(missingFromDb, [], "reserved in TypeScript but claimable in the database");
  assert.deepEqual(missingFromTs, [], "reserved in the database but not offered as a reason in the UI");
});

test("the reserved list has no duplicates and is all legal handles", () => {
  const names = reservedInMigrations();
  assert.equal(new Set(names).size, names.length, "the migration lists a reserved name twice");
  for (const name of names) {
    assert.match(name, /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/, `${name} could never be typed as a handle anyway`);
  }
});

test("the migration is numbered past the branch that already used 0020 and 0021", () => {
  // A duplicate migration number is recorded as already applied and skipped in silence.
  const boundary = readFileSync(path.join(dir, "0022_security_boundary.sql"), "utf8");
  assert.match(boundary.slice(0, 600), /Numbered 0022, not 0020/);
});

test("no two migrations share a number", () => {
  // The same trap from the other side. Two branches each writing an 0022 is how one of them
  // silently never runs; this repo has done it three times now.
  const seen = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const n = file.slice(0, 4);
    assert.ok(!seen.has(n), `two migrations are numbered ${n}`);
    seen.add(n);
  }
});
