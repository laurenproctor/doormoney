"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { RESERVED_SLUGS, SLUG_RE, slugify } from "@/lib/slug";
import { actPath } from "@/lib/urls";

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

  // The board address and the sign-in username are one word, so claiming either claims both.
  // claim_username (migration 0024) does it in one transaction: it checks the whole namespace,
  // refuses a word somebody has retired, holds the twelve-month rule, and moves the act's slug
  // with the handle. The old word goes to the history, which is what makes the old board URL
  // redirect rather than break. See docs/DECISIONS.md, decision 12.
  const slug = parsed.data.slug;
  const previousSlug = existing?.slug ?? null;
  const { data: claim, error: claimError } = await supabaseAdmin().rpc("claim_username", { p_user_id: user.id, p_username: slug });
  if (claimError) {
    console.error("board address claim failed:", claimError.message);
    return { ok: false, errors: { slug: "That did not save. Try once more." } };
  }
  if (claim !== "ok") return { ok: false, errors: { slug: claimMessage(claim as string) } };

  // Listing an act makes this account a musician, whatever it ticked at sign-up. A role is only
  // ever added: somebody who came here to back musicians and then started a band is both.
  // Through the service role: 0022 leaves the browser no write on profiles beyond the handle,
  // and a role is not something an account should be able to hand itself through PostgREST.
  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("roles").eq("id", user.id).maybeSingle();
  const roles: string[] = (profile as { roles?: string[] } | null)?.roles ?? [];
  if (!roles.includes("musician")) {
    await admin.from("profiles").update({ roles: [...roles, "musician"] }).eq("id", user.id);
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
  revalidatePath(actPath(parsed.data.slug));
  if (previousSlug && previousSlug !== slug) revalidatePath(actPath(previousSlug));
  if (!existing) redirect("/dashboard");
  return { ok: true };
}

function dbMessage(code?: string) {
  if (code === "23505") return "That board address is taken. Pick another.";
  return "That did not save. Try once more.";
}

/** What claim_username said, in words a musician can act on. */
function claimMessage(code: string) {
  if (code === "too_soon") return "A board address can move once every twelve months. The date it next can is on the profile page.";
  if (code === "taken") return "That board address is taken. Pick another.";
  if (code === "invalid") return "Letters, digits and hyphens only, starting and ending with a letter or digit.";
  return "That did not save. Try once more.";
}
