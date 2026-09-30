import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
const RUN = "11111111-1111-4111-8111-111111111111";
const UPDATE = "22222222-2222-4222-8222-222222222222";
let published = true, uploaded = true, approved = true, withdrawn = false;
let signed: { path: string; seconds: number }[] = [];
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test-only";
mock.module("@/lib/supabase/server", { namedExports: { supabaseAdmin: () => ({
  from(table: string) {
    const filters: [string, string, unknown][] = [];
    const result = () => {
      if (table === "runs") return filters.some(([op, key, value]) => op === "eq" && key === "acts.owner_id" && value === "owner")
        && filters.some(([op, key, value]) => op === "eq" && key === "id" && value === RUN) ? { id: RUN, slug: "project", title: "Project", status: "open", cancelled_at: null,
        acts: { id: "act", slug: "organizer", name: "Organizer", owner_id: "owner" } } : null;
      if (table === "project_updates") {
        if (filters.some(([op, key]) => op === "not" && key === "published_at") && !published) return null;
        if (filters.some(([op, key, value]) => op === "eq" && key === "run_id" && value !== RUN)) return null;
        return { id: UPDATE, run_id: RUN, title: "Update", excerpt: "Excerpt", body: "Private body", published_at: published ? "2026-09-28" : null, edited_at: null };
      }
      if (table === "project_update_media") return [{ id: "media", update_id: UPDATE, kind: "image", object_path: "private/photo.png", uploaded_at: uploaded ? "2026-09-28" : null }];
      if (table === "project_update_recognition") {
        if (filters.some(([op, key]) => op === "not" && key === "approved_at") && !approved) return [];
        if (filters.some(([op, key]) => op === "is" && key === "withdrawn_at") && withdrawn) return [];
        return [{ update_id: UPDATE, display_name: "Sponsor", logo_url: null }];
      }
      return [];
    };
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { filters.push(["eq", key, value]); return query; },
      not(key: string, _op: string, value: unknown) { filters.push(["not", key, value]); return query; },
      is(key: string, value: unknown) { filters.push(["is", key, value]); return query; },
      in() { return query; }, order() { return query; }, range() { return query; },
      maybeSingle: async () => ({ data: result(), error: null }),
      then(resolve: (value: unknown) => unknown) { const data = result(); return Promise.resolve({ data: table === "project_updates" ? (data ? [data] : []) : data, error: null }).then(resolve); },
    };
    return query;
  },
  storage: { from: () => ({ createSignedUrl: async (path: string, seconds: number) => {
    signed.push({ path, seconds }); return { data: { signedUrl: "https://example.invalid/signed" }, error: null };
  } }) },
}) } });
const { publishedUpdates, publishedUpdate, ownerUpdatePreview } = await import("@/lib/project-updates");
const project = { id: RUN, slug: "project", title: "Project", status: "open", cancelledAt: null,
  act: { id: "act", slug: "organizer", name: "Organizer", ownerId: "owner" } };
beforeEach(() => { published = true; uploaded = true; approved = true; withdrawn = false; signed = []; });
test("draft update is absent from both public list and individual lookup", async () => {
  published = false;
  assert.deepEqual(await publishedUpdates(RUN), []);
  assert.equal(await publishedUpdate(project, UPDATE), null);
  assert.deepEqual(signed, []);
});
test("individual lookup cannot cross the fundraiser boundary", async () => {
  assert.equal(await publishedUpdate({ ...project, id: "another-run" }, UPDATE), null);
  assert.deepEqual(signed, []);
});
test("only verified owner previews can sign draft media", async () => {
  published = false;
  assert.equal(await ownerUpdatePreview(RUN, UPDATE, "other-owner"), null);
  assert.deepEqual(signed, []);
  assert.ok((await ownerUpdatePreview(RUN, UPDATE, "owner"))?.media[0].url);
  assert.deepEqual(signed, [{ path: "private/photo.png", seconds: 600 }]);
});
test("pending media is never signed even on a published update", async () => {
  uploaded = false;
  assert.equal((await publishedUpdate(project, UPDATE))?.media[0].url, null);
  assert.deepEqual(signed, []);
});
test("public recognition requires approval and disappears on withdrawal", async () => {
  approved = false;
  assert.deepEqual((await publishedUpdate(project, UPDATE))?.recognition, []);
  approved = true;
  assert.deepEqual((await publishedUpdate(project, UPDATE))?.recognition, [{ name: "Sponsor", logoUrl: null }]);
  withdrawn = true;
  assert.deepEqual((await publishedUpdate(project, UPDATE))?.recognition, []);
});
