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
