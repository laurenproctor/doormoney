"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { accountDisplayName, isOrganizerChoice, SELF_ENTITY_KIND, slugAlternatives, suggestSlug } from "@/lib/organizer-setup";
import { isCountryCode } from "@/lib/countries";
import { ENTITY_KINDS } from "@/lib/participation";
import { RESERVED_SLUGS, SLUG_RE, slugify } from "@/lib/slug";
import { newFundraiserPath } from "@/lib/organizer-examples";
import { ownProfile } from "@/lib/patronprofile";

/*
  Setting up an organizer, and handing it to the sponsorship builder.

  One question, two answers. Somebody raising money as themselves already has a name on this
  account, so they are asked for nothing: the organizer record is made from what is there. Somebody
  raising money as a business, a team or a group is asked for its name, and for nothing else that
  can wait.

  Three things this is careful about.

  The address is the organizer's, not the account's. `claim_act_slug` (migration 0058) claims it
  without reading or writing profiles.username, so suggesting /harbor-house never renames the word
  somebody signs in with. saveAct's own path, where the organizer's address *is* the handle, is
  untouched and still goes through claim_username.

  Nothing here publishes anything. A new organizer has no music type and no fundraiser out of
  draft, and `getActProfile` answers 404 for exactly that, so completing this step puts no page on
  the internet and nothing in the sitemap. The visibility model is the one that was already here.

  Submitting twice creates one organizer. The account is re-read first, `claim_act_slug` says
  'ok' for a word this account already holds, and acts_one_per_owner (migration 0022) is behind
  both.
*/

export type SetupField =
  | "choice" | "name" | "slug" | "entity_kind" | "city" | "region" | "country_code"
  | "bio" | "website" | "instagram" | "photo" | "form";

export type SetupState = {
  errors?: Partial<Record<SetupField, string>>;
  /** A word that is free, offered when the one they asked for is not. */
  suggestedSlug?: string;
};

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+\.\S+$/.test(v), "Enter a full web address, starting with http.");

/** Only the name is required. Everything else can wait, and says so. */
const Input = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80, "Keep the name under 80 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "The link needs at least 3 characters.")
    .max(40, "Keep the link under 40 characters.")
    .regex(SLUG_RE, "Letters, digits and hyphens only.")
    .refine((s) => !RESERVED_SLUGS.has(s), "That link is reserved. Pick another."),
  entity_kind: z.union([z.enum(ENTITY_KINDS), z.literal("")]).transform((v) => v || null),
  city: z.string().trim().max(60, "Keep the city under 60 characters.").transform((v) => v || null),
  region: z.string().trim().max(100, "Keep the region under 100 characters.").transform((v) => v || null),
  country_code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || isCountryCode(v), "Pick a country from the list.")
    .transform((v) => v || null),
  bio: z.string().trim().max(600, "Keep the description under 600 characters.").optional().transform((v) => v || null),
  website: optionalUrl,
  instagram: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "") : null)),
});

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PHOTO_MAX = 5 * 1024 * 1024;

/** Where this step hands over, carrying the starter kit it came in on if there was one. */
function nextStep(form: FormData) {
  const template = form.get("template");
  return newFundraiserPath(typeof template === "string" ? template : null);
}

/**
 * A word close to the one they asked for that nobody holds.
 *
 * A read, so it is a suggestion rather than a reservation: the claim still decides, and a word
 * taken between the two comes back as taken again with the next one offered. Better than telling
 * somebody their name is unavailable and leaving them to guess.
 */
async function freeAlternative(base: string, userId: string): Promise<string | undefined> {
  const candidates = slugAlternatives(base).filter((s) => !RESERVED_SLUGS.has(s));
  if (candidates.length === 0) return undefined;
  const sb = supabaseAdmin();
  const [profiles, acts, retired] = await Promise.all([
    sb.from("profiles").select("username").in("username", candidates).neq("id", userId),
    sb.from("acts").select("slug").in("slug", candidates),
    sb.from("username_history").select("username").in("username", candidates).neq("profile_id", userId),
  ]);
  const taken = new Set<string>([
    ...((profiles.data ?? []) as { username: string | null }[]).map((r) => r.username ?? ""),
    ...((acts.data ?? []) as { slug: string }[]).map((r) => r.slug),
    ...((retired.data ?? []) as { username: string }[]).map((r) => r.username),
  ]);
  return candidates.find((c) => !taken.has(c));
}

/** What claim_act_slug said, in words the person can act on. */
function claimMessage(code: string) {
  if (code === "taken") return "That link is taken. Pick another.";
  if (code === "reserved") return "That link is reserved. Pick another.";
  if (code === "invalid") return "Letters, digits and hyphens only, starting and ending with a letter or digit.";
  return null;
}

/**
 * Saves the organizer if there is not one yet, then goes on to the sponsorship builder.
 *
 * Validates what the chosen answer needs and no more: Myself needs a name this account already
 * has, an organization needs the one it was given.
 */
export async function startOrganizer(_prev: SetupState, form: FormData): Promise<SetupState> {
  const user = await requireUser("/dashboard/act/new");
  const [profile, existing] = await Promise.all([currentProfile(user.id), ownedAct(user.id)]);

  // Already set up: this step is done, and doing it twice is the same as doing it once. Asked
  // before anything is read off the form, so a second submit of a form that has already saved
  // carries on to the next step rather than arguing with itself.
  if (existing) redirect(nextStep(form));

  const choiceRaw = str(form, "choice");
  const choice = isOrganizerChoice(choiceRaw) ? choiceRaw : null;
  if (!choice) return { errors: { choice: "Pick who is behind this." } };

  let fields: z.infer<typeof Input>;
  if (choice === "self") {
    const own = await ownProfile(user.id);
    const name = accountDisplayName({
      fullName: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null,
      patronDisplayName: own?.displayName ?? null,
      email: profile?.email ?? user.email ?? null,
    });
    if (!name) return { errors: { form: "Add your name on your profile first, so sponsors know who they are supporting." } };
    // The handle this account already signs in with is its address, so nothing moves. With no
    // handle yet, the name suggests one, and it is claimed for the organizer alone.
    const asked = str(form, "slug").trim().toLowerCase();
    const parsed = Input.safeParse({
      name,
      slug: asked || profile?.username || suggestSlug(name),
      entity_kind: SELF_ENTITY_KIND,
      city: "",
      region: "",
      country_code: "",
      bio: "",
      website: "",
      instagram: "",
    });
    if (!parsed.success) return { errors: fieldErrors(parsed.error) };
    fields = parsed.data;
  } else {
    const name = str(form, "name");
    const asked = str(form, "slug").trim().toLowerCase();
    const parsed = Input.safeParse({
      name,
      slug: asked || slugify(name),
      entity_kind: str(form, "entity_kind"),
      city: str(form, "city"),
      region: str(form, "region"),
      country_code: str(form, "country_code"),
      bio: str(form, "bio"),
      website: str(form, "website"),
      instagram: str(form, "instagram"),
    });
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error) ?? {};
      // The link is made from the name while nobody has edited it, so a missing name is one
      // problem to fix, not two.
      if (!asked && errors.name) delete errors.slug;
      return { errors };
    }
    fields = parsed.data;
  }

  const photo = form.get("photo");
  let photoUpload: { bytes: ArrayBuffer; ext: string; type: string } | null = null;
  if (photo instanceof File && photo.size > 0) {
    const ext = PHOTO_TYPES[photo.type];
    if (!ext) return { errors: { photo: "Use a JPG, PNG or WebP." } };
    if (photo.size > PHOTO_MAX) return { errors: { photo: "Keep the photo under 5MB." } };
    photoUpload = { bytes: await photo.arrayBuffer(), ext, type: photo.type };
  }

  // The word and the row arrive together, under the same lock claim_username takes, and without
  // profiles.username being read or written. See migration 0058.
  const { data: claim, error: claimError } = await supabaseAdmin().rpc("claim_act_slug", {
    p_user_id: user.id,
    p_slug: fields.slug,
    p_name: fields.name,
  });
  if (claimError) {
    console.error("organizer address claim failed:", claimError.message);
    return { errors: { form: "That did not save. Try once more." } };
  }
  if (claim === "taken" || claim === "reserved") {
    return { errors: { slug: claimMessage(claim as string) ?? "" }, suggestedSlug: await freeAlternative(fields.name, user.id) };
  }
  if (claim !== "ok") {
    const message = claimMessage(claim as string);
    if (message) return { errors: { slug: message } };
    console.error("organizer address claim refused:", claim);
    return { errors: { form: "That did not save. Try once more." } };
  }

  const act = await ownedAct(user.id);
  if (!act) return { errors: { form: "That did not save. Try once more." } };

  // Everything past the name and the address, written under this account's own session so row
  // level security decides. The address is not among them: it is the claim's to set.
  const sb = await supabaseServer();
  const { error } = await sb
    .from("acts")
    .update({
      name: fields.name,
      entity_kind: fields.entity_kind,
      city: fields.city,
      region: fields.region,
      country_code: fields.country_code,
      bio: fields.bio,
      website: fields.website,
      instagram: fields.instagram,
    })
    .eq("id", act.id);
  if (error) {
    console.error("organizer details failed to save:", error.message);
    return { errors: { form: "The name and link saved. The rest did not. Try once more." } };
  }

  if (photoUpload) {
    // The bucket is public-read; writes go through the service role so no storage policy opens up.
    const path = `${act.id}/${Date.now()}.${photoUpload.ext}`;
    const admin = supabaseAdmin();
    const { error: upErr } = await admin.storage.from("acts").upload(path, photoUpload.bytes, { contentType: photoUpload.type, upsert: false });
    if (upErr) {
      console.error("organizer photo upload failed:", upErr.message);
      return { errors: { photo: "The rest saved. The photo did not upload, and can be added later." } };
    }
    const { data: pub } = admin.storage.from("acts").getPublicUrl(path);
    await sb.from("acts").update({ photo_url: pub.publicUrl }).eq("id", act.id);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  redirect(nextStep(form));
}

function fieldErrors(error: z.ZodError): SetupState["errors"] {
  const flat = error.flatten().fieldErrors as Partial<Record<SetupField, string[]>>;
  const out: SetupState["errors"] = {};
  for (const key of Object.keys(flat) as SetupField[]) out[key] = flat[key]?.[0];
  return out;
}
