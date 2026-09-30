import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const RUN = "11111111-1111-4111-8111-111111111111";
const UPDATE = "22222222-2222-4222-8222-222222222222";
const MEDIA = "33333333-3333-4333-8333-333333333333";
const PATH = `${RUN}/${UPDATE}/photo.png`;
let owner = true, youth = false, positions: number[] = [], storageError = false, deleteError = false;
let writes: { table: string; op: string; value: unknown }[] = [];
let signed: string[] = [], removed: string[] = [], revalidated: string[] = [];
mock.module("next/cache", { namedExports: { revalidatePath: (path: string) => revalidated.push(path) } });
mock.module("next/navigation", { namedExports: { redirect: (path: string) => { throw new Error(`redirect:${path}`); } } });
mock.module("@/lib/auth", { namedExports: { requireUser: async () => ({ id: "owner" }) } });
mock.module("@/lib/project-updates", { namedExports: {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
  projectUpdatesPath: (slug: string, run: string) => `/${slug}/${run}/updates`,
  projectById: async () => owner ? { id: RUN, slug: "project", status: "open", act: { slug: "organizer" } } : null,
} });
mock.module("@/lib/supabase/server", { namedExports: { supabaseAdmin: () => ({
  from(table: string) {
    let op = "select"; let columns = "";
    const query = {
      select(value: string) { columns = value; return query; },
      eq() { return query; },
      insert(value: unknown) { op = "insert"; writes.push({ table, op, value }); return query; },
      update(value: unknown) { op = "update"; writes.push({ table, op, value }); return query; },
      delete() { op = "delete"; writes.push({ table, op, value: null }); return query; },
      maybeSingle: async () => ({ data: table === "project_updates" ? { id: UPDATE, run_id: RUN, published_at: null }
        : table === "runs" ? { category_key: youth ? "sports" : "music", category_details: { level: "youth" } }
          : columns === "object_path" ? { object_path: PATH } : { id: MEDIA }, error: null }),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: positions.map(position => ({ position })),
        error: op === "delete" && deleteError ? { message: "database unavailable" } : null }).then(resolve); },
    };
    return query;
  },
  storage: { from: () => ({
    createSignedUploadUrl: async (path: string) => { signed.push(path); return { data: { token: "signed-token" }, error: null }; },
    info: async () => ({ error: storageError ? { message: "not uploaded" } : null }),
    remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; },
  }) },
}) } });
const { reserveProjectMedia, finishProjectMedia, removeProjectMedia, addVideoEmbed } = await import("@/app/actions/project-updates");
beforeEach(() => { owner = true; youth = false; positions = []; storageError = false; deleteError = false;
  writes = []; signed = []; removed = []; revalidated = []; });
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };

test("media reservation rejects nonowners before issuing a storage token", async () => {
  owner = false;
  assert.ok((await reserveProjectMedia(UPDATE, "image/png", "Poster", "")).error);
  assert.equal(signed.length, 0); assert.equal(writes.length, 0);
});
test("youth projects cannot reserve media", async () => {
  youth = true;
  assert.ok((await reserveProjectMedia(UPDATE, "image/png", "Poster", "")).error);
  assert.equal(signed.length, 0);
});
test("reservation rejects unsafe formats and missing or oversized descriptions", async () => {
  for (const [mime, alt, caption] of [["image/svg+xml", "Poster", ""], ["image/png", " ", ""],
    ["image/png", "x".repeat(301), ""], ["video/mp4", "", "x".repeat(501)]]) {
    assert.ok((await reserveProjectMedia(UPDATE, mime, alt, caption)).error);
  }
  assert.equal(signed.length, 0);
});
test("reservation is scoped to owner project/update and reuses the first vacant attachment slot", async () => {
  positions = [0, 2];
  const result = await reserveProjectMedia(UPDATE, "image/png", " Poster ", " Caption ");
  assert.equal(result.token, "signed-token");
  assert.match(result.path!, new RegExp(`^${RUN}/${UPDATE}/[a-f0-9-]+\\.png$`));
  assert.deepEqual(writes[0].value, { update_id: UPDATE, kind: "image", object_path: result.path, alt_text: "Poster", caption: "Caption", position: 1 });
});
test("the twelve attachment cap prevents another signed upload", async () => {
  positions = Array.from({ length: 12 }, (_, i) => i);
  assert.ok((await reserveProjectMedia(UPDATE, "video/mp4", "", "")).error);
  assert.equal(signed.length, 0);
});
test("finishing media rejects another project path without writing", async () => {
  assert.ok((await finishProjectMedia(UPDATE, `other/${UPDATE}/photo.png`)).error);
  assert.equal(writes.length, 0);
});
test("an incomplete storage upload never becomes readable", async () => {
  storageError = true;
  assert.ok((await finishProjectMedia(UPDATE, PATH)).error);
  assert.equal(writes.length, 0);
});
test("successful upload completion records readiness and revalidates its public entry", async () => {
  assert.deepEqual(await finishProjectMedia(UPDATE, PATH), { ok: true });
  assert.equal(writes[0].op, "update");
  assert.ok(revalidated.includes(`/organizer/project/updates/${UPDATE}`));
});
test("failed media row deletion preserves the storage object and reports failure", async () => {
  deleteError = true;
  await assert.rejects(removeProjectMedia(form({ id: UPDATE, media: MEDIA })), /error=save/);
  assert.deepEqual(removed, []);
});
test("successful media removal deletes the corresponding storage object", async () => {
  await assert.rejects(removeProjectMedia(form({ id: UPDATE, media: MEDIA })), /redirect:/);
  assert.deepEqual(removed, [PATH]);
});
test("embed validation rejects lookalike hosts and invalid video IDs", async () => {
  for (const url of ["https://youtube.com.evil.test/watch?v=abcdefghijk", "https://youtube.com/watch?v=bad", "https://vimeo.com/no-video"]) {
    await assert.rejects(addVideoEmbed(form({ id: UPDATE, url })), /error=embed/);
  }
  assert.equal(writes.length, 0);
});
test("valid YouTube embed stores only the validated provider and video ID", async () => {
  await assert.rejects(addVideoEmbed(form({ id: UPDATE, url: "https://youtu.be/abcdefghijk" })), /redirect:/);
  assert.deepEqual(writes[0].value, { update_id: UPDATE, kind: "embed", provider: "youtube", video_id: "abcdefghijk", caption: "", position: 0 });
});
