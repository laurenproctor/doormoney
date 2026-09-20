/*
  The account page's writes, against a stand-in Supabase.

  What matters here is the order of things: a refused file never reaches storage, a failed row
  write takes the new object back down, the old photo goes only after the new one is on the row,
  and nothing outside the account's own folder is ever removed.
*/
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const USER = "11111111-1111-4111-8111-111111111111";

let storedPath: string | null = null;
let nameRow: Record<string, unknown> | null = null;
let failRowWrite = false;
let sessionSeesRow = true;
let uploads: { path: string; contentType: string }[] = [];
let removals: string[] = [];

mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("@/lib/auth", { namedExports: { requireUser: async () => ({ id: USER }) } });
mock.module("@/lib/supabase/server", {
  namedExports: {
    supabaseAdmin: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { photo_path: storedPath }, error: null }) }) }),
        update: (row: { photo_path: string | null }) => ({
          eq: async () => {
            if (failRowWrite) return { error: { message: "refused" } };
            storedPath = row.photo_path;
            return { error: null };
          },
        }),
      }),
      storage: {
        from: () => ({
          upload: async (path: string, _bytes: ArrayBuffer, opts: { contentType: string }) => {
            uploads.push({ path, contentType: opts.contentType });
            return { error: null };
          },
          remove: async (paths: string[]) => {
            removals.push(...paths);
            return { error: null };
          },
        }),
      },
    }),
    supabaseServer: async () => ({
      from: () => ({
        update: (row: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => {
                if (!sessionSeesRow) return { data: null, error: null };
                nameRow = row;
                return { data: { id: USER }, error: null };
              },
            }),
          }),
        }),
      }),
    }),
  },
});

const { saveAccountName, saveAccountPhoto, removeAccountPhoto } = await import("@/app/actions/account");

const GIF = new Uint8Array([..."GIF89a"].map((c) => c.charCodeAt(0)).concat([1, 0, 1, 0, 0, 0, 0]));
const photoForm = (bytes: Uint8Array, type: string, name = "photo") => {
  const form = new FormData();
  form.set("photo", new File([bytes as BlobPart], name, { type }));
  return form;
};

beforeEach(() => {
  storedPath = null;
  nameRow = null;
  failRowWrite = false;
  sessionSeesRow = true;
  uploads = [];
  removals = [];
});

test("both names save, trimmed", async () => {
  const form = new FormData();
  form.set("first_name", "  Dana ");
  form.set("last_name", "Whitfield");
  const result = await saveAccountName({ ok: false }, form);
  assert.equal(result.ok, true);
  assert.deepEqual(nameRow, { first_name: "Dana", last_name: "Whitfield" });
});

test("a missing name comes back on its own field, in sign-up's words", async () => {
  const form = new FormData();
  form.set("first_name", "   ");
  form.set("last_name", "");
  const result = await saveAccountName({ ok: false }, form);
  assert.equal(result.ok, false);
  assert.equal(result.errors?.first_name, "Enter a first name.");
  assert.equal(result.errors?.last_name, "Enter a last name.");
  assert.equal(nameRow, null);
});

test("a name write that touched no row is a failure, not a silent success", async () => {
  sessionSeesRow = false;
  const form = new FormData();
  form.set("first_name", "Dana");
  form.set("last_name", "Whitfield");
  const result = await saveAccountName({ ok: false }, form);
  assert.equal(result.ok, false);
  assert.ok(result.errors?.form);
});

test("an animated GIF goes up as a GIF, into the account's own folder", async () => {
  const result = await saveAccountPhoto({ ok: false }, photoForm(GIF, "image/gif"));
  assert.equal(result.ok, true);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].contentType, "image/gif");
  assert.match(uploads[0].path, new RegExp(`^${USER}/[0-9a-f-]{36}\\.gif$`));
  assert.equal(storedPath, uploads[0].path);
});

test("the stored type comes from the bytes, not from what the browser said", async () => {
  await saveAccountPhoto({ ok: false }, photoForm(GIF, "text/plain"));
  assert.equal(uploads[0].contentType, "image/gif");
});

test("a page dressed as a GIF never reaches storage", async () => {
  const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
  const result = await saveAccountPhoto({ ok: false }, photoForm(html, "image/gif"));
  assert.equal(result.ok, false);
  assert.equal(result.error, "Use a JPG, PNG, WebP or GIF.");
  assert.equal(uploads.length, 0);
});

test("an oversized file and an empty form are both refused before storage", async () => {
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set(GIF);
  assert.equal((await saveAccountPhoto({ ok: false }, photoForm(big, "image/gif"))).error, "Keep the photo under 5MB.");
  assert.equal((await saveAccountPhoto({ ok: false }, new FormData())).error, "Choose a photo first.");
  assert.equal(uploads.length, 0);
});

test("the old photo goes only once the new one is on the row", async () => {
  storedPath = `${USER}/old.png`;
  await saveAccountPhoto({ ok: false }, photoForm(GIF, "image/gif"));
  assert.deepEqual(removals, [`${USER}/old.png`]);
  assert.notEqual(storedPath, `${USER}/old.png`);
});

test("when the row refuses the new path, the new object comes back down and the old one stays", async () => {
  storedPath = `${USER}/old.png`;
  failRowWrite = true;
  const result = await saveAccountPhoto({ ok: false }, photoForm(GIF, "image/gif"));
  assert.equal(result.ok, false);
  assert.deepEqual(removals, [uploads[0].path]);
  assert.equal(storedPath, `${USER}/old.png`);
});

test("a path outside the account's folder is never removed", async () => {
  storedPath = "somebody-else/photo.png";
  await saveAccountPhoto({ ok: false }, photoForm(GIF, "image/gif"));
  assert.deepEqual(removals, []);
});

test("removing clears the row and then the object", async () => {
  storedPath = `${USER}/old.png`;
  const result = await removeAccountPhoto();
  assert.equal(result.ok, true);
  assert.equal(storedPath, null);
  assert.deepEqual(removals, [`${USER}/old.png`]);
});

test("removing with nothing there is calm", async () => {
  const result = await removeAccountPhoto();
  assert.equal(result.ok, true);
  assert.deepEqual(removals, []);
});
