"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { RESERVED_SLUGS, SLUG_RE, slugify } from "@/lib/slug";
import { usernameTaken } from "@/lib/username";

export type ActField = "name" | "slug" | "type" | "city" | "bio" | "instagram" | "website" | "photo";
export type ActState = { ok: boolean; errors?: Partial<Record<ActField | "form", string>> };

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+\.\S+$/.test(v), "Enter a full web address, starting with http.");

const Input = z.object({
  name: z.string().trim().min(2, "Enter the act's name.").max(80, "Keep the name under 80 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "The board address needs at least 3 characters.")
    .max(40, "Keep the board address under 40 characters.")
    .regex(SLUG_RE, "Letters, digits and hyphens only.")
    .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved. Pick another."),
  type: z.enum(["touring_band", "house_act", "soloist"], { error: "Pick an act type." }),
  city: z.string().trim().min(2, "Enter a city.").max(60, "Keep the city under 60 characters."),
  bio: z.string().trim().max(600, "Keep the bio under 600 characters.").optional().transform((v) => v || null),
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
    city: str(form, "city") || "New York",
    bio: str(form, "bio"),
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
  const row = { ...parsed.data, owner_id: user.id };

  // The board address and the sign-in username are one word. Whoever holds it holds both,
  // so check the whole namespace, then move the username first: the act's own trigger
  // then sees the name already belongs to this account and lets the slug through.
  const slug = parsed.data.slug;
  if (slug !== existing?.slug) {
    if (await usernameTaken(supabaseAdmin(), slug, user.id)) {
      return { ok: false, errors: { slug: "That board address is taken. Pick another." } };
    }
  }
  const { error: usernameError } = await sb.from("profiles").update({ username: slug }).eq("id", user.id);
  if (usernameError) return { ok: false, errors: { slug: dbMessage(usernameError.code) } };

  // Listing an act makes this account a musician, whatever it ticked at sign-up. A role is only
  // ever added: somebody who came here to back musicians and then started a band is both.
  const { data: profile } = await sb.from("profiles").select("roles").eq("id", user.id).maybeSingle();
  const roles: string[] = (profile as { roles?: string[] } | null)?.roles ?? [];
  if (!roles.includes("musician")) {
    await sb.from("profiles").update({ roles: [...roles, "musician"] }).eq("id", user.id);
  }

  let actId = existing?.id ?? null;
  if (existing) {
    const { error } = await sb.from("acts").update(row).eq("id", existing.id);
    if (error) return { ok: false, errors: { form: dbMessage(error.code) } };
  } else {
    const { data, error } = await sb.from("acts").insert(row).select("id").single();
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
  revalidatePath(`/board/${parsed.data.slug}`);
  if (!existing) redirect("/dashboard");
  return { ok: true };
}

function dbMessage(code?: string) {
  if (code === "23505") return "That board address is taken. Pick another.";
  return "That did not save. Try once more.";
}
