"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, currentProfile } from "@/lib/auth";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { normalizeUsername, usernameProblem } from "@/lib/username";
import { ProfileDetails, parseInterests, type ProfileField } from "@/lib/profile";
import { eligibleActivity, patronSinceFor, linkPatronRows } from "@/lib/patronprofile";

/*
  A patron's public profile: the writes.

  Every one of these authenticates first, and every one authorises the row it touches against the
  signed-in account rather than against anything the form said. The publication flag and the
  per-activity ticks are separate on purpose: publishing a profile shows nothing that was not
  already ticked, and ticking one placement says nothing about the next.

  See docs/DECISIONS.md, decision 11, and src/lib/profile.ts for the limits themselves.
*/

export type ProfileState = { ok: boolean; message?: string; errors?: Partial<Record<ProfileField, string>> };
export type UsernameState = { ok: boolean; message?: string; error?: string };

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PHOTO_MAX = 5 * 1024 * 1024;
const PHOTO_BUCKET = "patron-photos";

/** The verified address on the session, or null. A typed address never counts. */
function verifiedEmail(user: { email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null }) {
  const confirmed = user.email_confirmed_at ?? user.confirmed_at ?? null;
  return confirmed && user.email ? user.email.trim().toLowerCase() : null;
}

// ---------------------------------------------------------------
// The profile itself
// ---------------------------------------------------------------

/**
 * Writes the profile's public fields, creating the row on the first save.
 *
 * A new row is private. Nothing here publishes anything, so somebody filling the form in over
 * three sittings is never briefly public.
 */
export async function saveProfileDetails(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser("/dashboard/profile");
  const email = verifiedEmail(user);

  const parsed = ProfileDetails.safeParse({
    display_name: str(form, "display_name"),
    bio: str(form, "bio"),
    location: str(form, "location"),
    website: str(form, "website"),
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors as Partial<Record<ProfileField, string[]>>;
    const errors: ProfileState["errors"] = {};
    for (const k of Object.keys(fields) as ProfileField[]) errors[k] = fields[k]?.[0];
    return { ok: false, errors };
  }

  const interests = parseInterests(str(form, "interests"));
  if (interests.error) return { ok: false, errors: { interests: interests.error } };

  const photo = form.get("photo");
  let upload: { bytes: ArrayBuffer; ext: string; type: string } | null = null;
  if (photo instanceof File && photo.size > 0) {
    const ext = PHOTO_TYPES[photo.type];
    if (!ext) return { ok: false, errors: { photo: "Use a JPG, PNG or WebP." } };
    if (photo.size > PHOTO_MAX) return { ok: false, errors: { photo: "Keep the photo under 5MB." } };
    upload = { bytes: await photo.arrayBuffer(), ext, type: photo.type };
  }

  const sb = await supabaseServer();
  const { data: existing } = await sb.from("patron_profiles").select("photo_path").eq("profile_id", user.id).maybeSingle();
  const previousPhoto = (existing as { photo_path: string | null } | null)?.photo_path ?? null;

  // The photograph goes up before the row is written, so a failed upload never leaves a row
  // pointing at nothing. The bucket is private: nothing here is readable without a signed link.
  let photoPath = previousPhoto;
  if (upload) {
    const path = `${user.id}/${randomUUID()}.${upload.ext}`;
    const admin = supabaseAdmin();
    const { error } = await admin.storage.from(PHOTO_BUCKET).upload(path, upload.bytes, { contentType: upload.type, upsert: false });
    if (error) {
      console.error("patron photo upload failed:", error.message);
      return { ok: false, errors: { photo: "The photo did not upload. Try once more." } };
    }
    photoPath = path;
  }

  const row = {
    display_name: parsed.data.display_name,
    bio: parsed.data.bio,
    location: parsed.data.location,
    website: parsed.data.website,
    interests: interests.items,
    photo_path: photoPath,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await sb.from("patron_profiles").update(row).eq("profile_id", user.id);
    if (error) {
      console.error("patron profile save failed:", error.message);
      return { ok: false, errors: { form: "That did not save. Try once more." } };
    }
  } else {
    // A first profile carries the day this account started backing musicians, which is the first
    // thing it paid for, or the day it opened. Only the year is ever shown.
    await linkPatronRows(user.id, email);
    const since = await patronSinceFor(user.id, email, user.created_at ?? new Date().toISOString());
    const { error } = await sb.from("patron_profiles").insert({ profile_id: user.id, ...row, published: false, patron_since: since });
    if (error) {
      console.error("patron profile create failed:", error.message);
      return { ok: false, errors: { form: "That did not save. Try once more." } };
    }
    await addPatronRole(user.id);
  }

  // The old photograph is only dropped once the new one is on the row, so nothing is ever lost
  // between two writes. Only this account's own object is touched.
  if (upload && previousPhoto && previousPhoto !== photoPath && previousPhoto.startsWith(`${user.id}/`)) {
    const { error } = await supabaseAdmin().storage.from(PHOTO_BUCKET).remove([previousPhoto]);
    if (error) console.error("old patron photo not removed:", error.message);
  }

  revalidatePath("/dashboard/profile");
  const profile = await currentProfile(user.id);
  if (profile?.username) revalidatePath(`/patron/${profile.username}`);
  return { ok: true, message: "Saved." };
}

/** Keeping a role is doing the thing. Making a profile makes this account a patron, and nothing is taken away. */
async function addPatronRole(userId: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("roles").eq("id", userId).maybeSingle();
  const roles: string[] = (data as { roles?: string[] } | null)?.roles ?? [];
  if (!roles.includes("patron")) await sb.from("profiles").update({ roles: [...roles, "patron"] }).eq("id", userId);
}

// ---------------------------------------------------------------
// Published or private
// ---------------------------------------------------------------

const Publish = z.object({ publish: z.enum(["yes", "no"]) });

/**
 * Puts the profile up, or takes it down.
 *
 * Publishing needs a username, because the username is the address. It shows the name, the words
 * and the ticked activity, and nothing that was not already ticked.
 */
export async function setProfileVisibility(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser("/dashboard/profile");
  const parsed = Publish.safeParse({ publish: str(form, "publish") });
  if (!parsed.success) return { ok: false, errors: { form: "That did not save. Try once more." } };
  const publish = parsed.data.publish === "yes";

  const sb = await supabaseServer();
  const { data: existing } = await sb.from("patron_profiles").select("profile_id").eq("profile_id", user.id).maybeSingle();
  if (!existing) return { ok: false, errors: { form: "Fill the profile in first, then publish it." } };

  const profile = await currentProfile(user.id);
  if (publish && !profile?.username) {
    return { ok: false, errors: { form: "Claim a username first. It is the address of the page." } };
  }

  const { error } = await sb
    .from("patron_profiles")
    .update(publish ? { published: true, published_at: new Date().toISOString() } : { published: false })
    .eq("profile_id", user.id);
  if (error) {
    console.error("patron profile publish failed:", error.message);
    return { ok: false, errors: { form: "That did not save. Try once more." } };
  }

  revalidatePath("/dashboard/profile");
  if (profile?.username) revalidatePath(`/patron/${profile.username}`);
  return { ok: true, message: publish ? "The profile is public." : "The profile is private again." };
}

// ---------------------------------------------------------------
// One placement, one backing, one tick at a time
// ---------------------------------------------------------------

const Visibility = z.object({
  kind: z.enum(["placement", "backing"]),
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  show: z.enum(["yes", "no"]),
});

/**
 * Shows one placement or one backing on the public page, or takes it off again.
 *
 * The id in the form proves nothing. What may be published is worked out again from the session:
 * the row has to belong to a patron row this account owns, has to be paid, and must not have been
 * won through an anonymous bid. Anything else is refused, whatever the form said.
 */
export async function setActivityShown(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser("/dashboard/profile");
  const parsed = Visibility.safeParse({ kind: str(form, "kind"), id: str(form, "id"), show: str(form, "show") });
  if (!parsed.success) return { ok: false, errors: { form: "That did not save. Try once more." } };
  const { kind, id, show } = parsed.data;

  const eligible = await eligibleActivity(user.id, verifiedEmail(user));
  const item = eligible.find((e) => e.kind === kind && e.id === id);
  if (!item) return { ok: false, errors: { form: "That is not on this account." } };
  if (item.anonymous) return { ok: false, errors: { form: "That spot was won anonymously, so it stays off the page." } };

  const sb = await supabaseServer();
  const column = kind === "placement" ? "purchase_id" : "backing_id";
  if (show === "yes") {
    const { error } = await sb.from("patron_profile_items").insert({ profile_id: user.id, [column]: id });
    // Already there: two clicks on the same row is not an error.
    if (error && error.code !== "23505") {
      console.error("showing an activity failed:", error.message);
      return { ok: false, errors: { form: "That did not save. Try once more." } };
    }
  } else {
    const { error } = await sb.from("patron_profile_items").delete().eq("profile_id", user.id).eq(column, id);
    if (error) {
      console.error("hiding an activity failed:", error.message);
      return { ok: false, errors: { form: "That did not save. Try once more." } };
    }
  }

  revalidatePath("/dashboard/profile");
  const profile = await currentProfile(user.id);
  if (profile?.username) revalidatePath(`/patron/${profile.username}`);
  return {
    ok: true,
    message: show === "yes" ? `${item.actName} is on the profile.` : `${item.actName} is off the profile.`,
  };
}

// ---------------------------------------------------------------
// The username
// ---------------------------------------------------------------

/**
 * Claims the word, or moves it.
 *
 * Every rule that matters is in claim_username (migration 0022) rather than here: one word across
 * profiles and acts, one change every twelve months, retired words never reissued, and a
 * musician's board address moving in the same transaction. This checks the shape and the reserved
 * list first so the common mistakes come back in words, then lets the database decide.
 */
export async function changeUsername(_prev: UsernameState, form: FormData): Promise<UsernameState> {
  const user = await requireUser("/dashboard/profile");
  const wanted = normalizeUsername(str(form, "username"));
  if (!wanted) return { ok: false, error: "Enter a username." };
  const problem = usernameProblem(wanted);
  if (problem) return { ok: false, error: problem };

  const before = await currentProfile(user.id);
  const { data, error } = await supabaseAdmin().rpc("claim_username", { p_user_id: user.id, p_username: wanted });
  if (error) {
    console.error("username claim failed:", error.message);
    return { ok: false, error: "That did not save. Try once more." };
  }

  switch (data as string) {
    case "ok":
      break;
    case "too_soon":
      return { ok: false, error: "The username can move once every twelve months. The date is above." };
    case "taken":
      return { ok: false, error: "That username is taken. Pick another." };
    case "invalid":
      return { ok: false, error: "Letters, digits and hyphens only, starting and ending with a letter or digit." };
    default:
      return { ok: false, error: "That did not save. Try once more." };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/account");
  revalidatePath(`/patron/${wanted}`);
  revalidatePath(`/board/${wanted}`);
  if (before?.username && before.username !== wanted) {
    revalidatePath(`/patron/${before.username}`);
    revalidatePath(`/board/${before.username}`);
  }
  return { ok: true, message: `The address is now /patron/${wanted}.` };
}
