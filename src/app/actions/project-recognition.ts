"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { projectById, projectUpdatePath, UUID } from "@/lib/project-updates";
import { SITE } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function requestProjectRecognition(form: FormData) {
  const user = await requireUser("/dashboard/runs");
  const updateId = String(form.get("update") ?? "");
  const purchaseId = String(form.get("purchase") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!UUID.test(updateId) || !UUID.test(purchaseId) || !name || name.length > 100) redirect("/dashboard/runs");
  const sb = supabaseAdmin();
  const { data: update } = await sb.from("project_updates").select("id,run_id").eq("id", updateId).maybeSingle();
  const project = update ? await projectById(update.run_id, user.id) : null;
  if (!project) redirect("/dashboard/runs");
  const back = `/dashboard/runs/${project.id}?tab=updates&edit=${updateId}`;
  const { data: purchase } = await sb.from("purchases")
    .select("id,lot_id,patron_id,mark_status,mark_url,patrons!inner(profile_id),lots!inner(run_id)")
    .eq("id", purchaseId).eq("lots.run_id", project.id)
    .in("payment_status", ["held", "released", "partially_refunded"]).maybeSingle();
  const patron = purchase?.patrons as unknown as { profile_id: string | null } | undefined;
  if (!purchase || !patron?.profile_id || patron.profile_id === user.id) redirect(`${back}&error=recognition`);
  // A bid won anonymously does not become a named journal acknowledgment.
  const { data: anonymous } = await sb.from("bids").select("id")
    .eq("lot_id", purchase.lot_id).eq("patron_id", purchase.patron_id).eq("anonymous", true).limit(1);
  if (anonymous?.length) redirect(`${back}&error=recognition`);
  const logoUrl = form.get("logo") === "yes" && purchase.mark_status === "approved" ? purchase.mark_url : null;
  const { data, error } = await sb.from("project_update_recognition").insert({ update_id: updateId,
    purchase_id: purchaseId, sponsor_id: patron.profile_id, display_name: name, logo_url: logoUrl })
    .select("id").single();
  if (error || !data) redirect(`${back}&error=recognition`);
  const { data: sponsor } = await sb.from("profiles").select("email").eq("id", patron.profile_id).maybeSingle();
  if (sponsor?.email) await sendEmail({ to: sponsor.email, subject: "Approve a project update mention on Door Money",
    text: `The organizer asked to name you in a project update. Review the exact name and logo before it appears: ${SITE.url}/project-recognition/${data.id}`,
    html: `<p>The organizer asked to name you in a project update.</p><p><a href="${SITE.url}/project-recognition/${data.id}">Review your mention</a></p>` });
  revalidatePath(back.split("?")[0]);
  redirect(back);
}

export async function decideProjectRecognition(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) redirect("/dashboard");
  const user = await requireUser(`/project-recognition/${id}`);
  const sb = supabaseAdmin();
  const { data } = await sb.from("project_update_recognition")
    .select("id,update_id,sponsor_id,approved_at,withdrawn_at,project_updates!inner(run_id)")
    .eq("id", id).eq("sponsor_id", user.id).maybeSingle();
  if (!data) redirect("/dashboard");
  const intent = String(form.get("intent") ?? "");
  const values = intent === "approve" ? { approved_at: new Date().toISOString(), withdrawn_at: null }
    : { approved_at: null, withdrawn_at: new Date().toISOString() };
  const { error } = await sb.from("project_update_recognition").update(values).eq("id", id).eq("sponsor_id", user.id);
  if (error) redirect(`/project-recognition/${id}?error=save`);
  const runId = (data.project_updates as unknown as { run_id: string }).run_id;
  const { data: run } = await sb.from("runs").select("slug,acts!inner(slug)").eq("id", runId).maybeSingle();
  if (run) revalidatePath(projectUpdatePath((run.acts as unknown as { slug: string }).slug, run.slug, data.update_id));
  revalidatePath(`/project-recognition/${id}`);
  redirect(`/project-recognition/${id}`);
}
