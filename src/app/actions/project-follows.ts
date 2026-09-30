"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { UUID } from "@/lib/project-updates";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function setProjectFollow(form: FormData) {
  const runId = String(form.get("run") ?? "");
  if (!UUID.test(runId)) redirect("/fundraisers");
  const user = await requireUser("/fundraisers");
  const sb = supabaseAdmin();
  const { data: run } = await sb.from("runs").select("id,slug,status,acts!inner(slug,owner_id)")
    .eq("id", runId).in("status", ["open", "live", "closed", "cancelled"]).maybeSingle();
  if (!run) redirect("/fundraisers");
  const act = run.acts as unknown as { slug: string; owner_id: string | null };
  const destination = `/${act.slug}/support-${run.slug}/updates`;
  if (act.owner_id === user.id) redirect(destination);
  if (form.get("intent") === "follow") {
    const { error } = await sb.from("project_update_follows")
      .upsert({ run_id: runId, profile_id: user.id }, { onConflict: "run_id,profile_id", ignoreDuplicates: true });
    if (error) redirect(`${destination}?follow=error`);
  } else {
    const { error } = await sb.from("project_update_follows").delete().eq("run_id", runId).eq("profile_id", user.id);
    if (error) redirect(`${destination}?follow=error`);
    const { data: updates } = await sb.from("project_updates").select("id").eq("run_id", runId);
    if (updates?.length) await sb.from("project_update_mail").delete().eq("profile_id", user.id)
      .in("update_id", updates.map((r) => r.id));
  }
  revalidatePath(destination);
  redirect(destination);
}

export async function unsubscribeProjectFollow(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!UUID.test(token)) redirect("/fundraisers");
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("project_update_follows").select("run_id,profile_id")
    .eq("unsubscribe_token", token).maybeSingle();
  if (error) throw error;
  if (data) {
    const { error: deleteError } = await sb.from("project_update_follows").delete().eq("unsubscribe_token", token);
    if (deleteError) throw deleteError;
    const { data: updates } = await sb.from("project_updates").select("id").eq("run_id", data.run_id);
    if (updates?.length) await sb.from("project_update_mail").delete().eq("profile_id", data.profile_id)
      .in("update_id", updates.map((u) => u.id));
  }
  redirect("/project-updates/unsubscribed");
}
