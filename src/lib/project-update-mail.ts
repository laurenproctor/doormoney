import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, sendEmail } from "@/lib/email";
import { projectUpdatePath } from "@/lib/project-updates";
import { SITE } from "@/lib/site";

/** Small, retryable pass inside the existing daily job; money work runs first. */
export async function runProjectUpdateMail(sb: SupabaseClient) {
  if (!emailConfigured()) return { sent: 0, reason: "email not configured" };
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: updates, error } = await sb.from("project_updates")
    .select("id,run_id,published_at,runs!inner(slug,status,acts!inner(slug))")
    .not("published_at", "is", null).gte("published_at", since)
    .order("published_at", { ascending: false }).limit(100);
  if (error) throw error;
  for (const update of updates ?? []) {
    const run = update.runs as unknown as { slug: string; status: string; acts: { slug: string } };
    if (!["open", "live", "closed", "cancelled"].includes(run.status)) continue;
    const { data: follows, error: followsError } = await sb.from("project_update_follows")
      .select("profile_id,created_at").eq("run_id", update.run_id).lte("created_at", update.published_at).limit(1000);
    if (followsError) throw followsError;
    if (!follows?.length) continue;
    const { error: enqueueError } = await sb.from("project_update_mail").upsert(follows.map((f) => ({ update_id: update.id, profile_id: f.profile_id })),
      { onConflict: "update_id,profile_id", ignoreDuplicates: true });
    if (enqueueError) throw enqueueError;
  }
  const { data: pending, error: pendingError } = await sb.from("project_update_mail").select("id,update_id,profile_id")
    .is("sent_at", null).order("id").limit(10);
  if (pendingError) throw pendingError;
  let sent = 0;
  for (const row of pending ?? []) {
    const stale = new Date(Date.now() - 10 * 60000).toISOString();
    const { data: claimed, error: claimError } = await sb.from("project_update_mail").update({ claimed_at: new Date().toISOString() })
      .eq("id", row.id).is("sent_at", null).or(`claimed_at.is.null,claimed_at.lt.${stale}`)
      .select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    const { data: update, error: updateError } = await sb.from("project_updates")
      .select("id,run_id,published_at,runs!inner(slug,status,acts!inner(slug))")
      .eq("id", row.update_id).maybeSingle();
    if (updateError) throw updateError;
    const [{ data: follow, error: followError }, { data: person, error: personError }] = await Promise.all([
      sb.from("project_update_follows").select("unsubscribe_token,created_at")
        .eq("profile_id", row.profile_id).eq("run_id", update?.run_id ?? ""),
      sb.from("profiles").select("email").eq("id", row.profile_id).maybeSingle(),
    ]);
    if (followError) throw followError;
    if (personError) throw personError;
    const run = update?.runs as unknown as { slug: string; status: string; acts: { slug: string } } | undefined;
    const subscription = follow?.find((f) => f.created_at <= (update?.published_at ?? ""));
    // Discard ineligible deliveries; a republished update can enqueue its followers again.
    if (!update?.published_at || !run || !["open", "live", "closed", "cancelled"].includes(run.status)
      || !subscription || !person?.email) {
      const { error: deleteError } = await sb.from("project_update_mail").delete().eq("id", row.id);
      if (deleteError) throw deleteError;
      continue;
    }
    const url = `${SITE.url}${projectUpdatePath(run.acts.slug, run.slug, update.id)}`;
    const unsubscribe = `${SITE.url}/project-updates/unsubscribe/${subscription.unsubscribe_token}`;
    const result = await sendEmail({ to: person.email, subject: "A project you follow has an update",
      text: `A project you follow has a new update. Read it: ${url}\n\nStop emails for this project: ${unsubscribe}`,
      html: `<p>A project you follow has a new update.</p><p><a href="${url}">Read the update</a></p><p><a href="${unsubscribe}">Stop emails for this project</a></p>`,
      idempotencyKey: `project-update-${row.id}` });
    if (result.sent) {
      const { error: sentError } = await sb.from("project_update_mail").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
      if (sentError) throw sentError;
      sent++;
    }
  }
  return { sent };
}
