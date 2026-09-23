"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { actPath, runPath } from "@/lib/urls";

export type ShowState = { ok: boolean; error?: string };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const Uuid = z.string().uuid();
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

async function ownRun(runId: string) {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("runs").select("id,slug").eq("id", runId).eq("act_id", act.id).maybeSingle();
  return data ? { sb, act, runId, runSlug: (data as { slug: string }).slug } : null;
}

/**
 * The show's owner, proven the way src/app/actions/run.ts proves a run's owner.
 *
 * shows is readable by anybody (0001, "public read shows"), so finding the row says nothing about
 * who is asking: every show on the site comes back. The row is read for one thing, the run it
 * belongs to, and the answer comes from the run instead, filtered on the act this account owns.
 * No act id ever comes from the client, and a run belonging to somebody else matches no row.
 */
async function ownShow(showId: string) {
  if (!Uuid.safeParse(showId).success) return null;
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return null;
  const sb = await supabaseServer();
  const { data: show } = (await sb.from("shows").select("id,run_id").eq("id", showId).maybeSingle()) as {
    data: { id: string; run_id: string } | null;
  };
  if (!show) return null;
  const { data: run } = (await sb.from("runs").select("id,slug").eq("id", show.run_id).eq("act_id", act.id).maybeSingle()) as {
    data: { id: string; slug: string } | null;
  };
  return run ? { sb, act, showId, runId: run.id, runSlug: run.slug } : null;
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

/**
 * What one tap on a show may change, and the whole of it.
 *
 * The patch is an argument from the browser, so it went to .update() as it arrived: any column the
 * row has could be written by hand, the run it belongs to included. These two keys are the offer,
 * and z.strictObject refuses the rest rather than quietly dropping it.
 */
export type ShowPatch = { played?: boolean; attendance?: number | null };

const MarkInput = z.strictObject({
  played: z.boolean({ error: "Say whether it was played." }).optional(),
  attendance: z
    .number({ error: "Attendance is a whole number." })
    .int("Attendance is a whole number.")
    .min(0, "Attendance cannot be negative.")
    .max(1_000_000, "That is a lot of people. Check the number.")
    .nullable()
    .optional(),
});

/** The one-tap "played" toggle, and attendance when the act has a number. */
export async function markShow(showId: string, patch: ShowPatch): Promise<ShowState> {
  const parsed = MarkInput.safeParse(patch);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: !issue || issue.code === "unrecognized_keys" ? "That change is not allowed." : issue.message };
  }
  const next: ShowPatch = {};
  if (parsed.data.played !== undefined) next.played = parsed.data.played;
  if (parsed.data.attendance !== undefined) next.attendance = parsed.data.attendance;
  if (!Object.keys(next).length) return { ok: false, error: "There is nothing to change." };

  const own = await ownShow(showId);
  if (!own) return { ok: false, error: "That show is not on this account." };
  const { error } = await own.sb.from("shows").update(next).eq("id", own.showId);
  if (error) return { ok: false, error: "That did not save. Try once more." };
  touch(own.runId, own.act.slug, own.runSlug);
  return { ok: true };
}

export async function removeShow(showId: string): Promise<ShowState> {
  const own = await ownShow(showId);
  if (!own) return { ok: false, error: "That show is not on this account." };
  const { error } = await own.sb.from("shows").delete().eq("id", own.showId);
  if (error) return { ok: false, error: "That did not save. Try once more." };
  touch(own.runId, own.act.slug, own.runSlug);
  return { ok: true };
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PHOTO_MAX = 8 * 1024 * 1024;

/**
 * One photo per show. Replacing it keeps the old file out of the way by writing a new path.
 *
 * Ownership is settled before the service role is anywhere near the bucket. The upload runs with
 * the service role, which row level security does not apply to, so the only thing standing between
 * a stranger and a file in the public shows bucket is this check.
 */
export async function uploadShowPhoto(_prev: ShowState, form: FormData): Promise<ShowState> {
  const own = await ownShow(str(form, "show_id"));
  if (!own) return { ok: false, error: "That show is not on this account." };

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, error: "Pick a photo first." };
  const ext = PHOTO_TYPES[photo.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP." };
  if (photo.size > PHOTO_MAX) return { ok: false, error: "Keep the photo under 8MB." };

  const admin = supabaseAdmin();
  const path = `${own.runId}/${own.showId}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage.from("shows").upload(path, await photo.arrayBuffer(), { contentType: photo.type });
  if (upErr) {
    console.error("show photo upload failed:", upErr.message);
    return { ok: false, error: "The photo did not upload. Try once more." };
  }
  const { data: pub } = admin.storage.from("shows").getPublicUrl(path);
  const { error } = await own.sb.from("shows").update({ photo_url: pub.publicUrl }).eq("id", own.showId);
  if (error) return { ok: false, error: "That did not save. Try once more." };
  touch(own.runId, own.act.slug, own.runSlug);
  return { ok: true };
}
