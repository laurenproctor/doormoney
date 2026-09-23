"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { RESERVED_SLUGS, SLUG_RE, slugify } from "@/lib/slug";
import { actPath } from "@/lib/urls";
import { newFundraiserPath } from "@/lib/organizer-examples";
import { starterKit } from "@/lib/starter-kits";
// A "use server" file may only export async functions, so the words live in their own module.
import { ENTITY_KINDS } from "@/lib/participation";

export type ActField =
  | "name" | "slug" | "type" | "entity_kind" | "city" | "region" | "country_code"
  | "bio" | "audience_description" | "instagram" | "website" | "photo";

export type ActState = { ok: boolean; errors?: Partial<Record<ActField | "form", string>> };

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+\.\S+$/.test(v), "Enter a full web address, starting with http.");

const Input = z.object({
  name: z.string().trim().min(2, "Enter the name.").max(80, "Keep the name under 80 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "The address needs at least 3 characters.")
    .max(40, "Keep the address under 40 characters.")
    .regex(SLUG_RE, "Letters, digits and hyphens only.")
    .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved. Pick another."),
  type: z.union([z.enum(["touring_band", "house_act", "soloist"]), z.literal("")]).transform((v) => v || null),
  entity_kind: z.union([z.enum(ENTITY_KINDS), z.literal("")]).transform((v) => v || null),
  city: z.string().trim().max(60).transform((v) => v || null),
  region: z.string().trim().max(100).transform((v) => v || null),
  country_code: z.string().trim().toUpperCase().refine((v) => !v || /^[A-Z]{2}$/.test(v), "Use a two-letter country code.").transform((v) => v || null),
  bio: z.string().trim().max(600, "Keep the bio under 600 characters.").optional().transform((v) => v || null),
  // The organizer's own audience, not a fundraiser's. runs.audience_description is what one
  // sponsorship reaches; this is the room the organizer plays to, and neither fills the other in.
  audience_description: z
    .string()
    .trim()
    .max(600, "Keep the audience description under 600 characters.")
    .optional()
    .transform((v) => v || null),
  instagram: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "") : null)),
  website: optionalUrl,
});

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PHOTO_MAX = 5 * 1024 * 1024;

/** Creates the act on first save, updates it afterwards. One act per account. */
export async function saveAct(_prev: ActState, form: FormData): Promise<ActState> {
  const user = await requireUser("/dashboard/act");
  const parsed = Input.safeParse({
    name: str(form, "name"),
    slug: str(form, "slug") || slugify(str(form, "name")),
    type: str(form, "type"),
    entity_kind: str(form, "entity_kind"),
    city: str(form, "city"),
    region: str(form, "region"),
    country_code: str(form, "country_code"),
    bio: str(form, "bio"),
    audience_description: str(form, "audience_description"),
    instagram: str(form, "instagram"),
    website: str(form, "website"),
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors as Partial<Record<ActField, string[]>>;
    const errors: ActState["errors"] = {};
    for (const k of Object.keys(f) as ActField[]) errors[k] = f[k]?.[0];
    return { ok: false, errors };
  }

  const photo = form.get("photo");
  let photoUpload: { bytes: ArrayBuffer; ext: string; type: string } | null = null;
  if (photo instanceof File && photo.size > 0) {
    const ext = PHOTO_TYPES[photo.type];
    if (!ext) return { ok: false, errors: { photo: "Use a JPG, PNG or WebP." } };
    if (photo.size > PHOTO_MAX) return { ok: false, errors: { photo: "Keep the photo under 5MB." } };
    photoUpload = { bytes: await photo.arrayBuffer(), ext, type: photo.type };
  }

  const sb = await supabaseServer();
  const existing = await ownedAct(user.id);
  const row = parsed.data;

  // Whose word is this?
  //
  // For an organizer whose address *is* the account's handle, the two are one word and claiming
  // either claims both. claim_username (migration 0024) does it in one transaction: it checks the
  // whole namespace, refuses a word somebody has retired, holds the twelve-month rule, and moves
  // the slug with the handle. The old word goes to the history, which is what makes the old URL
  // redirect rather than break. See docs/DECISIONS.md, decision 12. Every organizer made before
  // migration 0058 is this case, so nothing about it changes.
  //
  // An organizer holding a word of its own, which is what setting up an organization makes, moves
  // alone through claim_act_slug (migration 0058). Renaming a business must never rename the word
  // its owner signs in with, and before 0058 this line would have.
  const slug = parsed.data.slug;
  const previousSlug = existing?.slug ?? null;
  const admin = supabaseAdmin();
  // Which of the two it is, is the database's answer rather than a guess made here: claim_act_slug
  // says 'is_handle' when the organizer is holding the account's own word, and then the pair moves
  // together as it always has. A first organizer takes the handle's word, which is decision 8.
  let claim: { data: unknown; error: { message: string } | null } = existing
    ? await admin.rpc("claim_act_slug", { p_user_id: user.id, p_slug: slug, p_name: parsed.data.name })
    : await admin.rpc("claim_username", { p_user_id: user.id, p_username: slug });
  if (!claim.error && claim.data === "is_handle") {
    claim = await admin.rpc("claim_username", { p_user_id: user.id, p_username: slug });
  }
  if (claim.error) {
    console.error("address claim failed:", claim.error.message);
    return { ok: false, errors: { slug: "That did not save. Try once more." } };
  }
  if (claim.data !== "ok") return { ok: false, errors: { slug: claimMessage(claim.data as string) } };

  // The ownership trigger adds organizer atomically without replacing any existing roles.

  let actId = existing?.id ?? null;
  if (existing) {
    const { error } = await sb.from("acts").update(row).eq("id", existing.id);
    if (error) return { ok: false, errors: { form: dbMessage(error.code) } };
  } else {
    const { data, error } = await sb.from("acts").insert({ ...row, owner_id: user.id }).select("id").single();
    if (error || !data) return { ok: false, errors: { form: dbMessage(error?.code) } };
    actId = data.id;
  }

  if (photoUpload && actId) {
    // The bucket is public-read; writes go through the service role so no storage policy opens up.
    const path = `${actId}/${Date.now()}.${photoUpload.ext}`;
    const admin = supabaseAdmin();
    const { error: upErr } = await admin.storage.from("acts").upload(path, photoUpload.bytes, { contentType: photoUpload.type, upsert: false });
    if (upErr) {
      console.error("act photo upload failed:", upErr.message);
      return { ok: false, errors: { photo: "The photo did not upload. Try once more." } };
    }
    const { data: pub } = admin.storage.from("acts").getPublicUrl(path);
    await sb.from("acts").update({ photo_url: pub.publicUrl }).eq("id", actId);
  }

  revalidatePath("/dashboard");
  // The unified profile reads the organizer's own details, so it changes when they do.
  revalidatePath("/dashboard/profile");
  revalidatePath(actPath(parsed.data.slug));
  if (previousSlug && previousSlug !== slug) revalidatePath(actPath(previousSlug));
  if (!existing) {
    // A new organizer who came in on a starter kit goes on to the fundraiser form, on that kit.
    // The key is looked up in the kit registry and is not saved with the profile.
    const template = form.get("template");
    const kit = typeof template === "string" ? starterKit(template) : null;
    redirect(kit ? newFundraiserPath(kit.key) : "/dashboard");
  }
  return { ok: true };
}

function dbMessage(code?: string) {
  if (code === "23505") return "That address is taken. Pick another.";
  return "That did not save. Try once more.";
}

/** What claim_username said, in words a musician can act on. */
function claimMessage(code: string) {
  if (code === "too_soon") return "An address can move once every twelve months. The date it next can is on the profile page.";
  if (code === "taken") return "That address is taken. Pick another.";
  if (code === "reserved") return "That address is reserved. Pick another.";
  if (code === "invalid") return "Letters, digits and hyphens only, starting and ending with a letter or digit.";
  if (code === "invalid_name") return "Enter the name before changing the address.";
  return "That did not save. Try once more.";
}

