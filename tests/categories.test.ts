/*
  The words each category uses, and the line between them and the database.

  src/lib/categories.ts must never become the list of categories the product supports. The registry
  in migration 0038 decides that, and this file only names things. So the tests below check two
  directions at once: every detail key the launch categories declare has real words written for it,
  and a category this file has never heard of still draws a usable form.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { detailFields, detailValueErrors, organizerNoun, titleLabel } from "@/lib/categories";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The categories and detail keys the migration actually inserts, read from the migration. */
function registry(): { key: string; detailKeys: string[] }[] {
  const sql = readFileSync(path.join(ROOT, "supabase/migrations/0038_expansion_foundation.sql"), "utf8");
  const rows = [...sql.matchAll(/\('([a-z_]+)',\s*'[^']*',\s*array\[([^\]]*)\]\)/g)];
  return rows.map(([, key, keys]) => ({ key, detailKeys: [...keys.matchAll(/'([^']+)'/g)].map((m) => m[1]) }));
}

test("the migration is the source of the categories this test reads", () => {
  const keys = registry().map((c) => c.key);
  assert.deepEqual(keys, ["music", "sports", "film", "theater"]);
});

test("every detail key a launch category declares has words written for it", () => {
  for (const { key, detailKeys } of registry()) {
    const fields = detailFields(key, detailKeys);
    assert.deepEqual(fields.map((f) => f.key), detailKeys, `${key} asks its keys in the registry's order`);
    for (const field of fields) {
      assert.ok(field.label.length > 0, `${key}.${field.key} has a label`);
      assert.ok(
        field.help || field.options || field.placeholder,
        `${key}.${field.key} is still the bare fallback: give it help, options or an example`,
      );
    }
  }
});

test("a category added in SQL alone still draws a form", () => {
  const fields = detailFields("community", ["project", "meeting_place"]);
  assert.deepEqual(fields.map((f) => f.label), ["Project", "Meeting place"]);
  assert.equal(fields[0].options, undefined, "an unknown key is free text, not a guessed list");
  assert.equal(organizerNoun("community"), "organizer");
  assert.equal(titleLabel("community"), "Fundraiser name");
  assert.deepEqual(detailValueErrors("community", { project: "Public garden" }, ["project"]), []);
});

test("each launch category names its own organizer without inventing a music one", () => {
  assert.deepEqual(
    registry().map((c) => organizerNoun(c.key)),
    ["musician", "team", "filmmaker", "theater company"],
  );
  assert.equal(organizerNoun(null), "organizer");
});

test("a closed list refuses a value it does not offer, and says which field", () => {
  assert.deepEqual(detailValueErrors("sports", { level: "youth" }, ["sport", "level"]), []);
  const errors = detailValueErrors("sports", { level: "olympic" }, ["sport", "level"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /level of play/);
  assert.deepEqual(detailValueErrors("film", { production_stage: "post_production" }, ["format", "production_stage"]), []);
  assert.equal(detailValueErrors("film", { production_stage: "someday" }, ["format", "production_stage"]).length, 1);
});

test("free text and an unanswered list are not errors", () => {
  assert.deepEqual(detailValueErrors("sports", { sport: "Roller derby" }, ["sport", "level"]), []);
  assert.deepEqual(detailValueErrors("sports", { level: "" }, ["sport", "level"]), []);
  assert.deepEqual(detailValueErrors("sports", {}, ["sport", "level"]), []);
});

test("a key the category does not allow is left to the registry check", () => {
  // categoryErrors in src/lib/fundraiser-drafts.ts owns that refusal. Checking it twice, in two
  // places, is how the two answers drift apart.
  assert.deepEqual(detailValueErrors("sports", { level: "olympic" }, ["sport"]), []);
});
