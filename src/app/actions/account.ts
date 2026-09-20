"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { NAME_MAX, SIGNUP_MESSAGES } from "@/lib/signup";
import {
  ACCOUNT_PHOTO_BUCKET,
  ACCOUNT_PHOTO_MAX,
  ACCOUNT_PHOTO_MESSAGES,
  accountPhotoPath,
  ownsPhotoPath,
  sniffPhoto,
} from "@/lib/accountPhoto";
import { accountPhotoPathFor } from "@/lib/accountPhotoUrl";

/*
  The account holder's own details: the writes.

  Each one authenticates first and touches only the row the session owns. Nothing here is public:
  the name is the person behind the account (a band's name is on the musician page, a business's
  name on the patron row), and the photo is shown to the account holder alone. A patron's public page has its
  own name and its own photo, in src/app/actions/profile.ts.
*/

export type AccountNameField = "first_name" | "last_name" | "form";
export type AccountNameState = { ok: boolean; message?: string; errors?: Partial<Record<AccountNameField, string>> };
export type AccountPhotoState = { ok: boolean; message?: string; error?: string };

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

// ---------------------------------------------------------------
// The name
// ---------------------------------------------------------------

// The same limits and the same words as sign-up, so an account can never save a name here that
// it could not have signed up with.
const AccountName = z.object({
  first_name: z.string().trim().min(1, SIGNUP_MESSAGES.first_name_missing).max(NAME_MAX, SIGNUP_MESSAGES.first_name_long),
  last_name: z.string().trim().min(1, SIGNUP_MESSAGES.last_name_missing).max(NAME_MAX, SIGNUP_MESSAGES.last_name_long),
});

/**
 * Saves the first and last name.
 *
 * Written under the account's own session: first_name and last_name are in the authenticated
 * update grant (migration 0027) and row level security scopes the write to one row, so this needs
 * no more privilege than the browser already holds.
 */
export async function saveAccountName(_prev: AccountNameState, form: FormData): Promise<AccountNameState> {
  const user = await requireUser("/dashboard/account");

  const parsed = AccountName.safeParse({ first_name: str(form, "first_name"), last_name: str(form, "last_name") });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return { ok: false, errors: { first_name: fields.first_name?.[0], last_name: fields.last_name?.[0] } };
  }

  const sb = await supabaseServer();
  const { data, error } = await sb.from("profiles").update(parsed.data).eq("id", user.id).select("id").maybeSingle();
  // A write that row level security filters to nothing is not an error in Postgres, so the row
  // coming back is what says it happened.
  if (error || !data) {
    console.error("account name save failed:", error?.message ?? "no row updated");
    return { ok: false, errors: { form: "That did not save. Try once more." } };
  }

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard/profile");
  revalidatePath("/patron");
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------
// The photo
// ---------------------------------------------------------------

/**
 * Puts a new photo on the account, still or animated.
 *
 * The file's kind comes from its bytes (sniffPhoto), not from the type the browser declared. The
 * photo goes up before the row is written, so a failed upload never leaves a row pointing at
 * nothing, and the old one is only dropped once the new one is on the row.
 */
export async function saveAccountPhoto(_prev: AccountPhotoState, form: FormData): Promise<AccountPhotoState> {
  const user = await requireUser("/dashboard/account");

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, error: ACCOUNT_PHOTO_MESSAGES.missing };
  if (photo.size > ACCOUNT_PHOTO_MAX) return { ok: false, error: ACCOUNT_PHOTO_MESSAGES.size };

  const bytes = await photo.arrayBuffer();
  const kind = sniffPhoto(new Uint8Array(bytes));
  if (!kind) return { ok: false, error: ACCOUNT_PHOTO_MESSAGES.type };

  // Service role from here: the bucket has no storage policy and photo_path is in no browser
  // grant (migration 0042). user.id comes from the verified session and is the only filter.
  const admin = supabaseAdmin();
  const previous = await accountPhotoPathFor(user.id);

  const path = accountPhotoPath(user.id, randomUUID(), kind.ext);
  const { error: uploadError } = await admin.storage.from(ACCOUNT_PHOTO_BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false });
  if (uploadError) {
    console.error("account photo upload failed:", uploadError.message);
    return { ok: false, error: ACCOUNT_PHOTO_MESSAGES.upload };
  }

  const { error } = await admin.from("profiles").update({ photo_path: path }).eq("id", user.id);
  if (error) {
    console.error("account photo save failed:", error.message);
    // The row never took the new path, so the new object is the orphan. Take it back down.
    await admin.storage.from(ACCOUNT_PHOTO_BUCKET).remove([path]);
    return { ok: false, error: ACCOUNT_PHOTO_MESSAGES.save };
  }

  if (ownsPhotoPath(user.id, previous) && previous !== path) {
    const { error: removeError } = await admin.storage.from(ACCOUNT_PHOTO_BUCKET).remove([previous]);
    if (removeError) console.error("old account photo not removed:", removeError.message);
  }

  revalidatePath("/dashboard/account");
  return { ok: true, message: "Saved." };
}

/** Takes the photo off the account. The row is cleared first, so nothing ever points at a missing file. */
export async function removeAccountPhoto(): Promise<AccountPhotoState> {
  const user = await requireUser("/dashboard/account");
  const admin = supabaseAdmin();
  const previous = await accountPhotoPathFor(user.id);
  if (!previous) return { ok: true, message: "There is no photo on the account." };

  const { error } = await admin.from("profiles").update({ photo_path: null }).eq("id", user.id);
  if (error) {
    console.error("account photo removal failed:", error.message);
    return { ok: false, error: ACCOUNT_PHOTO_MESSAGES.save };
  }

  const { error: removeError } = await admin.storage.from(ACCOUNT_PHOTO_BUCKET).remove([previous]);
  if (removeError) console.error("old account photo not removed:", removeError.message);

  revalidatePath("/dashboard/account");
  return { ok: true, message: "The photo is off the account." };
}
