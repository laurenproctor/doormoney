/**
 * The rules for an account photo, in one place.
 *
 * Pure on purpose, like src/lib/names.ts: the server action and the form both read the limits and
 * the wording from here, and the test runner can load it without Next or Supabase.
 *
 * The kind of file is decided by its first bytes, never by the type the browser declared. A
 * declared type is whatever the sender typed; the bytes are what the bucket will actually hold.
 */

export const ACCOUNT_PHOTO_BUCKET = "account-photos";
export const ACCOUNT_PHOTO_MAX = 5 * 1024 * 1024;
export const ACCOUNT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const ACCOUNT_PHOTO_MESSAGES = {
  missing: "Choose a photo first.",
  type: "Use a JPG, PNG, WebP or GIF.",
  size: "Keep the photo under 5MB.",
  upload: "The photo did not upload. Try once more.",
  save: "That did not save. Try once more.",
} as const;

export type PhotoKind = { type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; ext: "jpg" | "png" | "webp" | "gif" };

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** What the file really is, read from its signature, or null when it is none of the four. */
export function sniffPhoto(bytes: Uint8Array): PhotoKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { type: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", ext: "png" };
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return { type: "image/gif", ext: "gif" };
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return { type: "image/webp", ext: "webp" };
  return null;
}

/** The object path for a new photo. Scoped to the account, with a name nobody can guess. */
export function accountPhotoPath(userId: string, name: string, ext: PhotoKind["ext"]): string {
  return `${userId}/${name}.${ext}`;
}

/** Whether a stored path sits in this account's own folder. Nothing outside it is ever removed. */
export function ownsPhotoPath(userId: string, path: string | null | undefined): path is string {
  return Boolean(path) && path!.startsWith(`${userId}/`);
}
