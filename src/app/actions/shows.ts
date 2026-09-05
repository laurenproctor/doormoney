"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { actPath, runPath } from "@/lib/urls";

export type ShowState = { ok: boolean; error?: string };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const AddInput = z.object({
  run_id: z.string().uuid(),
  played_on: dateStr,
  venue: z.string().trim().max(120, "Keep the venue under 120 characters.").optional().transform((v) => v || null),
  city: z.string().trim().max(60, "Keep the city under 60 characters.").optional().transform((v) => v || null),
});

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** A show, with the word its run answers to, so a change can stale the right board. */
type ShowRow = { id: string; run_id: string; runs: { slug: string } };

async function ownRun(runId: string) {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("runs").select("id,slug").eq("id", runId).eq("act_id", act.id).maybeSingle();
  return data ? { sb, act, runId, runSlug: (data as { slug: string }).slug } : null;
}

const touch = (runId: string, slug: string, runSlug: string) => {
  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath("/dashboard");
  revalidatePath(actPath(slug));
  revalidatePath(runPath(slug, runSlug));
};

/** One more date on the run. */
export async function addShow(_prev: ShowState, form: FormData): Promise<ShowState> {
  const parsed = AddInput.safeParse({ run_id: str(form, "run_id"), played_on: str(form, "played_on"), venue: str(form, "venue"), city: str(form, "city") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the date." };
  const own = await ownRun(parsed.data.run_id);
  if (!own) return { ok: false, error: "That run is not on this account." };
  const { error } = await own.sb.from("shows").insert(parsed.data);
  if (error) return { ok: false, error: "That show did not save. Try once more." };
  touch(own.runId, own.act.slug, own.runSlug);
  return { ok: true };
}

/** The one-tap "played" toggle, and attendance when the act has a number. */
export async function markShow(showId: string, patch: { played?: boolean; attendance?: number | null }): Promise<ShowState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };
  if (patch.attendance !== undefined && patch.attendance !== null && (!Number.isInteger(patch.attendance) || patch.attendance < 0 || patch.attendance > 1_000_000)) {
    return { ok: false, error: "Attendance is a whole number." };
  }
  const sb = await supabaseServer();
  const { data: show } = (await sb.from("shows").select("id,run_id,runs!inner(slug)").eq("id", showId).maybeSingle()) as { data: ShowRow | null };
  if (!show) return { ok: false, error: "That show is not on this account." };
  const { error } = await sb.from("shows").update(patch).eq("id", showId);
  if (error) return { ok: false, error: "That did not save. Try once more." };
  touch(show.run_id, act.slug, show.runs.slug);
  return { ok: true };
}

export async function removeShow(showId: string): Promise<ShowState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };
  const sb = await supabaseServer();
  const { data: show } = (await sb.from("shows").select("id,run_id,runs!inner(slug)").eq("id", showId).maybeSingle()) as { data: ShowRow | null };
  if (!show) return { ok: false, error: "That show is not on this account." };
  const { error } = await sb.from("shows").delete().eq("id", showId);
  if (error) return { ok: false, error: "That did not save. Try once more." };
  touch(show.run_id, act.slug, show.runs.slug);
  return { ok: true };
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PHOTO_MAX = 8 * 1024 * 1024;

/** One photo per show. Replacing it keeps the old file out of the way by writing a new path. */
export async function uploadShowPhoto(_prev: ShowState, form: FormData): Promise<ShowState> {
  const showId = str(form, "show_id");
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, error: "Pick a photo first." };
  const ext = PHOTO_TYPES[photo.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP." };
  if (photo.size > PHOTO_MAX) return { ok: false, error: "Keep the photo under 8MB." };

  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };
  const sb = await supabaseServer();
  const { data: show } = (await sb.from("shows").select("id,run_id,runs!inner(slug)").eq("id", showId).maybeSingle()) as { data: ShowRow | null };
  if (!show) return { ok: false, error: "That show is not on this account." };

  const admin = supabaseAdmin();
  const path = `${show.run_id}/${showId}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage.from("shows").upload(path, await photo.arrayBuffer(), { contentType: photo.type });
  if (upErr) {
    console.error("show photo upload failed:", upErr.message);
    return { ok: false, error: "The photo did not upload. Try once more." };
  }
  const { data: pub } = admin.storage.from("shows").getPublicUrl(path);
  const { error } = await sb.from("shows").update({ photo_url: pub.publicUrl }).eq("id", showId);
  if (error) return { ok: false, error: "That did not save. Try once more." };
  touch(show.run_id, act.slug, show.runs.slug);
  return { ok: true };
}
