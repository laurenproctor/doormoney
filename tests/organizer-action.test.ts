import assert from "node:assert/strict";
import { mock, test } from "node:test";
let existing: { id: string; slug: string } | null = null;
let written: Record<string, unknown> = {};
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("next/navigation", { namedExports: { redirect(to: string) { throw new Error(`redirect:${to}`); } } });
mock.module("@/lib/auth", { namedExports: { requireUser: async () => ({ id: "owner" }), ownedAct: async () => existing } });
mock.module("@/lib/supabase/server", { namedExports: {
  supabaseAdmin: () => ({ rpc: async () => ({ data: "ok", error: null }) }),
  supabaseServer: async () => ({ from: () => ({
    insert(row: Record<string, unknown>) { written = row; return { select: () => ({ single: async () => ({ data: { id: "created" }, error: null }) }) }; },
    update(row: Record<string, unknown>) { written = row; return { eq: async () => ({ error: null }) }; },
  }) }),
} });
const { saveAct } = await import("@/app/actions/act");
test("a neutral organizer can save without a fake music type or city", async () => {
  const form = new FormData();
  form.set("name", "Community films");
  form.set("slug", "community-films");
  await assert.rejects(saveAct({ ok: false }, form), /redirect:\/dashboard/);
  assert.equal(written.type, null);
  assert.equal(written.city, null);
  assert.equal(written.owner_id, "owner");
  existing = { id: "created", slug: "community-films" };
  form.set("city", "Accra"); form.set("region", "Greater Accra"); form.set("country_code", "gh");
  assert.equal((await saveAct({ ok: false }, form)).ok, true);
  assert.equal(written.city, "Accra");
  assert.equal(written.region, "Greater Accra");
  assert.equal(written.country_code, "GH");
  assert.equal("owner_id" in written, false, "profile edits must not try to write the protected ownership column");
});

test("a new organizer who came in on a starter kit goes on to the fundraiser form, on that kit", async () => {
  const form = (template?: string) => {
    const f = new FormData();
    f.set("name", "Fenland Rovers");
    f.set("slug", "fenland-rovers");
    if (template !== undefined) f.set("template", template);
    return f;
  };
  existing = null;
  await assert.rejects(saveAct({ ok: false }, form("fund_season")), /^Error: redirect:\/dashboard\/runs\/new\?template=fund_season$/);
  for (const column of Object.keys(written)) assert.doesNotMatch(column, /template|kit/, `${column}: the kit is carried, never stored on the profile`);
  assert.doesNotMatch(JSON.stringify(written), /fund_season/);

  // No kit, an unknown kit, or something that is not a key at all: the dashboard, as before.
  for (const template of [undefined, "", "fund_everything", "//evil.example", "../admin"]) {
    await assert.rejects(saveAct({ ok: false }, form(template)), /^Error: redirect:\/dashboard$/, String(template));
  }
  // An edit to an existing profile never redirects, so it carries nothing either.
  existing = { id: "created", slug: "fenland-rovers" };
  assert.equal((await saveAct({ ok: false }, form("fund_season"))).ok, true);
});
