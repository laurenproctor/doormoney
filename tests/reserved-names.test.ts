/*
  The reserved handle list exists twice: once in TypeScript for the message a musician sees while
  typing, and once in Postgres (migration 0022) for the rule that actually holds. handle_new_user
  copies the username straight out of the auth user's metadata, which the client controls at signup,
  so the database list is the one that stops somebody claiming "admin". If the two drift, the UI
  promises one thing and the database enforces another.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RESERVED_SLUGS } from "@/lib/slug";
// Through the alias, because the test resolver only adds the ".ts" for "@/" paths.
import nextConfig from "@/../next.config";

const root = path.join(import.meta.dirname, "..");
const dir = path.join(root, "supabase", "migrations");

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

test("every address the site redirects from the root is a name nobody can claim", async () => {
  // A redirect is checked before any page. A musician holding a redirected name would have a page
  // that no visitor could reach, so the name has to be reserved before the redirect exists.
  const redirects = await nextConfig.redirects!();
  assert.ok(redirects.length > 0, "the redirects are gone, and so is what this test was guarding");
  for (const r of redirects) {
    const root = r.source.split("/")[1]!;
    assert.ok(RESERVED_SLUGS.has(root), `${r.source} redirects, but "${root}" can still be claimed as a handle`);
  }
});

test("the index lives at the word the nav uses, and its first address still arrives", async () => {
  const redirects = await nextConfig.redirects!();
  const to = (source: string) => redirects.find((r) => r.source === source);
  // /auctions is in sent email and in snippets pasted on other people's sites.
  assert.equal(to("/auctions")?.destination, "/fundraisers");
  assert.equal(to("/fundraiser")?.destination, "/fundraisers", "and the singular, which is what people type");
  // Temporary: a browser caches a permanent redirect for good. That is what made turning this one around safe.
  for (const r of redirects) assert.equal(r.permanent, false, r.source);
  // Nothing redirects away from the real address, or the two would chase each other.
  assert.equal(to("/fundraisers"), undefined);
  assert.ok(existsSync(path.join(root, "src/app/fundraisers/page.tsx")), "the page is where the redirect sends people");
  assert.equal(existsSync(path.join(root, "src/app/auctions")), false, "and there is one index, not two");
  // The five-minute worker is called by the database from a URL held in Vault. It is not a page and did not move.
  assert.ok(existsSync(path.join(root, "src/app/api/cron/auctions/route.ts")));
  assert.ok(redirects.every((r) => !r.source.startsWith("/api")), "no redirect touches an API route");
  // All three words stay unclaimable, the old one included: it is still an address of the site's.
  for (const name of ["fundraisers", "fundraiser", "auctions"]) assert.ok(RESERVED_SLUGS.has(name), name);
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
