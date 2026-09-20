/*
  The account photo: what counts as one.

  The kind of file is read from its first bytes, because the type a browser declares is whatever the
  sender typed. An HTML page sent as image/gif has to be refused, and a real GIF sent as
  text/plain is still a GIF.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_PHOTO_ACCEPT, accountPhotoPath, ownsPhotoPath, sniffPhoto } from "@/lib/accountPhoto";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

test("the four kinds are told apart by signature", () => {
  assert.deepEqual(sniffPhoto(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF")), { type: "image/jpeg", ext: "jpg" });
  assert.deepEqual(sniffPhoto(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a])), { type: "image/png", ext: "png" });
  assert.deepEqual(sniffPhoto(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")), { type: "image/webp", ext: "webp" });
});

test("both GIF versions pass, so an animated one does", () => {
  assert.deepEqual(sniffPhoto(bytes("GIF89a", [1, 0, 1, 0])), { type: "image/gif", ext: "gif" });
  assert.deepEqual(sniffPhoto(bytes("GIF87a", [1, 0, 1, 0])), { type: "image/gif", ext: "gif" });
});

test("anything else is refused, whatever it calls itself", () => {
  assert.equal(sniffPhoto(bytes("<!doctype html><script>")), null);
  assert.equal(sniffPhoto(bytes("<svg xmlns='http://www.w3.org/2000/svg'>")), null);
  assert.equal(sniffPhoto(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ")), null, "a RIFF file that is not WebP");
  assert.equal(sniffPhoto(bytes("GIF")), null, "too short to be anything");
  assert.equal(sniffPhoto(new Uint8Array()), null);
});

test("the file picker offers exactly what the server takes", () => {
  assert.deepEqual(ACCOUNT_PHOTO_ACCEPT.split(",").sort(), ["image/gif", "image/jpeg", "image/png", "image/webp"]);
});

test("a path sits in the account's own folder, and only that folder counts as owned", () => {
  const path = accountPhotoPath("user-1", "abc", "gif");
  assert.equal(path, "user-1/abc.gif");
  assert.equal(ownsPhotoPath("user-1", path), true);
  assert.equal(ownsPhotoPath("user-2", path), false);
  assert.equal(ownsPhotoPath("user-1", "user-10/abc.gif"), false, "a longer id with the same start is somebody else");
  assert.equal(ownsPhotoPath("user-1", null), false);
});
