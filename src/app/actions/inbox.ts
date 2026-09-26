"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { ownedPurchase, threadFor, UUID } from "@/lib/inbox";
import { SITE } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/server";

const replyError = (id: string, code: string) => redirect(`/inbox/${id}?error=${code}`);

export async function startThread(form: FormData) {
  const user = await requireUser("/inbox");
  const runId = String(form.get("run") ?? "");
  const purchaseId = String(form.get("purchase") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!UUID.test(runId) || (purchaseId && !UUID.test(purchaseId))) redirect("/inbox");
  if (!body || body.length > 2000) redirect(`/inbox/new?run=${runId}&error=length`);
  const sb = supabaseAdmin();
  const { data: run } = await sb.from("runs").select("id,status,act_id,acts!inner(owner_id)").eq("id", runId).maybeSingle();
  const act = run?.acts as unknown as { owner_id: string | null } | undefined;
  if (!run || !act?.owner_id || act.owner_id === user.id) redirect("/inbox");
  const bought = purchaseId ? await ownedPurchase(purchaseId, user.id, runId) : false;
  if (purchaseId && !bought) redirect("/inbox");
  const { data: existing } = await sb.from("inbox_threads").select("id").eq("run_id", runId).eq("sponsor_id", user.id).maybeSingle();
  if (!existing && !bought && !["open", "live"].includes(run.status)) redirect("/inbox");
  let threadId = existing?.id;
  if (!threadId) {
    const { data, error } = await sb.from("inbox_threads").insert({ run_id: runId, organizer_id: act.owner_id, sponsor_id: user.id }).select("id").single();
    if (error) {
      // Concurrent first messages may race the unique fundraiser/sponsor pair.
      const { data: raced } = await sb.from("inbox_threads").select("id").eq("run_id", runId).eq("sponsor_id", user.id).maybeSingle();
      if (!raced) redirect(`/inbox/new?run=${runId}&error=limit`);
      threadId = raced.id;
    } else threadId = data.id;
  }
  const { error } = await sb.from("inbox_messages").insert({ thread_id: threadId, sender_id: user.id, body });
  if (error) replyError(threadId!, "send");
  await notifyRecipient(threadId!, act.owner_id);
  revalidatePath("/inbox");
  redirect(`/inbox/${threadId}`);
}

export async function sendMessage(form: FormData) {
  const user = await requireUser("/inbox");
  const id = String(form.get("thread") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const thread = await threadFor(id, user.id);
  if (!thread) redirect("/inbox");
  if (!body || body.length > 2000) replyError(id, "length");
  const { error } = await supabaseAdmin().from("inbox_messages").insert({ thread_id: id, sender_id: user.id, body });
  if (error) replyError(id, thread.blocked_by ? "blocked" : "send");
  await notifyRecipient(id, user.id === thread.organizer_id ? thread.sponsor_id : thread.organizer_id);
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${id}`);
  redirect(`/inbox/${id}`);
}

async function notifyRecipient(id: string, recipientId: string) {
  const sb = supabaseAdmin();
  const [{ data }, { data: preference }] = await Promise.all([
    sb.from("profiles").select("email").eq("id", recipientId).maybeSingle(),
    sb.from("inbox_notification_preferences").select("email_enabled").eq("profile_id", recipientId).maybeSingle(),
  ]);
  if (preference?.email_enabled === false) return;
  if (!data?.email) return;
  const url = `${SITE.url}/inbox/${id}`;
  // No sender name or message text in mail: the account gate protects the entire exchange.
  await sendEmail({ to: data.email, subject: "A new Door Money message", text: `You have a new message about a fundraiser. Open your inbox: ${url}`,
    html: `<p>You have a new message about a fundraiser.</p><p><a href="${url}">Open your Door Money inbox</a></p>` });
}

export async function setInboxNotifications(form: FormData) {
  const user = await requireUser("/inbox");
  const enabled = form.get("enabled") === "yes";
  const { error } = await supabaseAdmin().from("inbox_notification_preferences").upsert({
    profile_id: user.id, email_enabled: enabled, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Could not update inbox notifications");
  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function updateThread(form: FormData) {
  const user = await requireUser("/inbox");
  const id = String(form.get("thread") ?? "");
  const action = String(form.get("action") ?? "");
  const thread = await threadFor(id, user.id);
  if (!thread) redirect("/inbox");
  const organizer = user.id === thread.organizer_id;
  const prefix = organizer ? "organizer" : "sponsor";
  const sb = supabaseAdmin();
  if (action === "archive" || action === "unarchive") {
    const { error } = await sb.from("inbox_threads").update({ [`${prefix}_archived_at`]: action === "archive" ? new Date().toISOString() : null }).eq("id", id);
    if (error) throw new Error("Could not update conversation");
  } else if (action === "block" || action === "unblock") {
    if (action === "block" && !thread.blocked_by || action === "unblock" && thread.blocked_by === user.id) {
      const query = sb.from("inbox_threads").update({ blocked_by: action === "block" ? user.id : null }).eq("id", id);
      const { error } = action === "block" ? await query.is("blocked_by", null) : await query.eq("blocked_by", user.id);
      if (error) throw new Error("Could not update conversation");
    }
  } else if (action === "report") {
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 10 || reason.length > 1000) replyError(id, "report");
    const { error } = await sb.from("inbox_reports").upsert({ thread_id: id, reporter_id: user.id, reason, resolved_at: null, reviewed_by: null }, { onConflict: "thread_id,reporter_id" });
    if (error) throw new Error("Could not submit report");
    revalidatePath("/admin/inbox");
    revalidatePath(`/admin/inbox/${id}`);
    revalidatePath(`/inbox/${id}`);
    redirect(`/inbox/${id}?reported=1`);
  }
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${id}`);
  redirect(`/inbox/${id}`);
}
