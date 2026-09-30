"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { projectById, projectUpdatesPath, UUID } from "@/lib/project-updates";
import { supabaseAdmin } from "@/lib/supabase/server";

const desk = (id: string) => `/dashboard/runs/${id}?tab=updates`;
const field = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").trim().slice(0, max + 1);

async function ownedUpdate(id: string, userId: string) {
  const sb = supabaseAdmin();
  const { data } = await sb.from("project_updates").select("id,run_id,published_at")
    .eq("id", id).maybeSingle();
  if (!data || !await projectById(data.run_id, userId)) return null;
  return data;
}

async function youthMediaBlocked(runId: string) {
  const { data } = await supabaseAdmin().from("runs").select("category_key,category_details").eq("id", runId).maybeSingle();
  return data?.category_key === "sports" && (data.category_details as Record<string, string> | null)?.level === "youth";
}

export async function saveProjectUpdate(form: FormData) {
  const runId = field(form, "run", 40);
  if (!UUID.test(runId)) redirect("/dashboard/runs");
  const user = await requireUser(desk(runId));
  const project = await projectById(runId, user.id);
  if (!project || project.status === "draft") redirect("/dashboard/runs");
  const id = field(form, "id", 40);
  const title = field(form, "title", 160), excerpt = field(form, "excerpt", 360), body = field(form, "body", 20000);
  if (!title || title.length > 160 || !excerpt || excerpt.length > 360 || !body || body.length > 20000)
    redirect(`${desk(runId)}&error=content${UUID.test(id) ? `&edit=${id}` : ""}`);
  const publish = field(form, "intent", 20) === "publish";
  const sb = supabaseAdmin();
  if (UUID.test(id)) {
    const existing = await ownedUpdate(id, user.id);
    if (!existing || existing.run_id !== runId) redirect(desk(runId));
    const { error } = await sb.from("project_updates").update({ title, excerpt, body,
      published_at: publish ? existing.published_at ?? new Date().toISOString() : null })
      .eq("id", id).eq("run_id", runId);
    if (error) redirect(`${desk(runId)}&error=save&edit=${id}`);
  } else {
    const { error } = await sb.from("project_updates").insert({ run_id: runId, author_id: user.id,
      title, excerpt, body, published_at: publish ? new Date().toISOString() : null });
    if (error) redirect(`${desk(runId)}&error=save`);
  }
  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath(`/${project.act.slug}`);
  revalidatePath(projectUpdatesPath(project.act.slug, project.slug));
  redirect(desk(runId));
}

export async function setProjectUpdatePublished(form: FormData) {
  const id = field(form, "id", 40);
  if (!UUID.test(id)) redirect("/dashboard/runs");
  const user = await requireUser("/dashboard/runs");
  const entry = await ownedUpdate(id, user.id);
  if (!entry) redirect("/dashboard/runs");
  const project = await projectById(entry.run_id, user.id);
  const publish = field(form, "intent", 20) === "publish";
  const { error } = await supabaseAdmin().from("project_updates").update({
    published_at: publish ? entry.published_at ?? new Date().toISOString() : null,
  }).eq("id", id).eq("run_id", entry.run_id);
  if (error) redirect(`${desk(entry.run_id)}&error=save`);
  revalidatePath(`/dashboard/runs/${entry.run_id}`);
  if (project) {
    revalidatePath(`/${project.act.slug}`);
    revalidatePath(projectUpdatesPath(project.act.slug, project.slug));
    revalidatePath(`${projectUpdatesPath(project.act.slug, project.slug)}/${id}`);
  }
  redirect(desk(entry.run_id));
}

export async function addVideoEmbed(form: FormData) {
  const id = field(form, "id", 40);
  const user = await requireUser("/dashboard/runs");
  const entry = UUID.test(id) ? await ownedUpdate(id, user.id) : null;
  if (!entry) redirect("/dashboard/runs");
  if (await youthMediaBlocked(entry.run_id)) redirect(`${desk(entry.run_id)}&edit=${id}&error=media`);
  let provider: "youtube" | "vimeo" | null = null, videoId: string | null = null;
  try {
    const url = new URL(field(form, "url", 300));
    const hostname = url.hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"].includes(hostname)) {
      provider = "youtube";
      videoId = hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1] ?? null;
      if (!videoId || !/^[\w-]{11}$/.test(videoId)) provider = null;
    } else if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(hostname)) {
      provider = "vimeo";
      videoId = url.pathname.match(/(?:\/video)?\/(\d{6,12})\/?$/)?.[1] ?? null;
      if (!videoId) provider = null;
    }
  } catch { /* Invalid links fail closed. */ }
  if (!provider || !videoId) redirect(`${desk(entry.run_id)}&edit=${id}&error=embed`);
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("project_update_media").select("position").eq("update_id", id);
  const position = Array.from({ length: 12 }, (_, i) => i).find((i) => !(existing ?? []).some((m) => m.position === i));
  if (position === undefined) redirect(`${desk(entry.run_id)}&edit=${id}&error=limit`);
  const { error } = await sb.from("project_update_media").insert({ update_id: id, kind: "embed", provider, video_id: videoId,
    caption: field(form, "caption", 500), position });
  if (error) redirect(`${desk(entry.run_id)}&edit=${id}&error=save`);
  const project = await projectById(entry.run_id, user.id);
  if (project) revalidatePath(`${projectUpdatesPath(project.act.slug, project.slug)}/${id}`);
  revalidatePath(`/dashboard/runs/${entry.run_id}`);
  redirect(`${desk(entry.run_id)}&edit=${id}`);
}

export async function removeProjectMedia(form: FormData) {
  const id = field(form, "id", 40), mediaId = field(form, "media", 40);
  const user = await requireUser("/dashboard/runs");
  const entry = UUID.test(id) ? await ownedUpdate(id, user.id) : null;
  if (!entry || !UUID.test(mediaId)) redirect("/dashboard/runs");
  const sb = supabaseAdmin();
  const { data } = await sb.from("project_update_media").select("object_path").eq("id", mediaId).eq("update_id", id).maybeSingle();
  if (data) {
    const { error } = await sb.from("project_update_media").delete().eq("id", mediaId).eq("update_id", id);
    if (error) redirect(`${desk(entry.run_id)}&edit=${id}&error=save`);
    if (data.object_path) await sb.storage.from("project-updates").remove([data.object_path]);
  }
  const project = await projectById(entry.run_id, user.id);
  if (project) revalidatePath(`${projectUpdatesPath(project.act.slug, project.slug)}/${id}`);
  revalidatePath(`/dashboard/runs/${entry.run_id}`);
  redirect(`${desk(entry.run_id)}&edit=${id}`);
}

export async function reserveProjectMedia(updateId: string, mime: string, alt: string, caption: string) {
  const user = await requireUser("/dashboard/runs");
  const entry = UUID.test(updateId) ? await ownedUpdate(updateId, user.id) : null;
  if (!entry) return { error: "Update not found" };
  if (await youthMediaBlocked(entry.run_id)) return { error: "Media is not available for youth projects." };
  const image = ["image/jpeg", "image/png", "image/webp"].includes(mime);
  const video = ["video/mp4", "video/webm"].includes(mime);
  if ((!image && !video) || (image && (!alt.trim() || alt.length > 300)) || caption.length > 500)
    return { error: "Choose an allowed file and describe the image." };
  const sb = supabaseAdmin();
  const { data: files } = await sb.from("project_update_media").select("position").eq("update_id", updateId);
  const position = Array.from({ length: 12 }, (_, i) => i).find((i) => !(files ?? []).some((m) => m.position === i));
  if (position === undefined) return { error: "Up to twelve attachments per update." };
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "video/mp4" ? "mp4" : "webm";
  const path = `${entry.run_id}/${updateId}/${crypto.randomUUID()}.${ext}`;
  const { data: token, error: signError } = await sb.storage.from("project-updates").createSignedUploadUrl(path);
  if (signError || !token) return { error: "Could not prepare upload." };
  const { error } = await sb.from("project_update_media").insert({ update_id: updateId, kind: image ? "image" : "video",
    object_path: path, alt_text: image ? alt.trim() : null, caption: caption.trim(), position });
  if (error) return { error: "Could not add attachment." };
  return { path, token: token.token };
}

export async function finishProjectMedia(updateId: string, path: string) {
  const user = await requireUser("/dashboard/runs");
  const entry = UUID.test(updateId) ? await ownedUpdate(updateId, user.id) : null;
  if (!entry || !path.startsWith(`${entry.run_id}/${updateId}/`)) return { error: "Attachment not found." };
  const sb = supabaseAdmin();
  const { data: media } = await sb.from("project_update_media").select("id")
    .eq("update_id", updateId).eq("object_path", path).maybeSingle();
  if (!media) return { error: "Attachment not found." };
  const { error: storageError } = await sb.storage.from("project-updates").info(path);
  if (storageError) return { error: "Upload did not complete." };
  const { error } = await sb.from("project_update_media").update({ uploaded_at: new Date().toISOString() }).eq("id", media.id);
  if (error) return { error: "Could not finish attachment." };
  const project = await projectById(entry.run_id, user.id);
  if (project) revalidatePath(`${projectUpdatesPath(project.act.slug, project.slug)}/${updateId}`);
  revalidatePath(`/dashboard/runs/${entry.run_id}`);
  return { ok: true };
}
