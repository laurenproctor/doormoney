/*
  The reserved handle list exists twice: once in TypeScript for the message a musician sees while
  typing, and once in Postgres (migration 0022) for the rule that actually holds. handle_new_user
  copies the username straight out of the auth user's metadata, which the client controls at signup,
  so the database list is the one that stops somebody claiming "admin". If the two drift, the UI
  promises one thing and the database enforces another.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RESERVED_SLUGS } from "@/lib/slug";

const migration = readFileSync(
  path.join(import.meta.dirname, "..", "supabase", "migrations", "0022_security_boundary.sql"),
  "utf8",
);

/** The names inside the reserved_handles seed block, in the order the migration lists them. */
function reservedInMigration(): string[] {
  const start = migration.indexOf("insert into public.reserved_handles");
  assert.notEqual(start, -1, "the migration no longer seeds reserved_handles");
  const end = migration.indexOf("on conflict", start);
  return [...migration.slice(start, end).matchAll(/\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
}

test("the database reserves exactly what TypeScript reserves", () => {
  const inDb = new Set(reservedInMigration());
  const inTs = RESERVED_SLUGS;
  const missingFromDb = [...inTs].filter((n) => !inDb.has(n));
  const missingFromTs = [...inDb].filter((n) => !inTs.has(n));
  assert.deepEqual(missingFromDb, [], "reserved in TypeScript but claimable in the database");
  assert.deepEqual(missingFromTs, [], "reserved in the database but not offered as a reason in the UI");
});

test("the reserved list has no duplicates and is all legal handles", () => {
  const names = reservedInMigration();
  assert.equal(new Set(names).size, names.length, "the migration lists a reserved name twice");
  for (const name of names) {
    assert.match(name, /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/, `${name} could never be typed as a handle anyway`);
  }
});

test("the migration is numbered past the branch that already used 0020 and 0021", () => {
  // A duplicate migration number is recorded as already applied and skipped in silence.
  assert.match(migration.slice(0, 600), /Numbered 0022, not 0020/);
});
