import type { Metadata } from "next";
import Link from "next/link";
import { setInboxNotifications } from "@/app/actions/inbox";
import { DashboardShell } from "@/components/DashboardShell";
import { requireUser, currentProfile, ownedAct } from "@/lib/auth";
import { dashboardNav } from "@/lib/dashboardModel";
import { threadContext, type Thread } from "@/lib/inbox";
import { fullName } from "@/lib/names";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inbox", robots: { index: false, follow: false } };

export default async function InboxPage() {
  const user = await requireUser("/inbox");
  const sb = supabaseAdmin();
  const [{ data }, profile, act, { data: preference }] = await Promise.all([
    sb.from("inbox_threads").select("*").or(`organizer_id.eq.${user.id},sponsor_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(100),
    currentProfile(user.id), ownedAct(user.id),
    sb.from("inbox_notification_preferences").select("email_enabled").eq("profile_id", user.id).maybeSingle(),
  ]);
  const threads = (data ?? []) as Thread[];
  const cards = await Promise.all(threads.map(async (thread) => {
    const [context, { data: last }] = await Promise.all([
      threadContext(thread), sb.from("inbox_messages").select("created_at,sender_id").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const organizer = thread.organizer_id === user.id;
    return { thread, context, last, organizer, unread: Boolean(last && last.sender_id !== user.id && last.created_at > (organizer ? thread.organizer_read_at : thread.sponsor_read_at)),
      archived: Boolean(organizer ? thread.organizer_archived_at : thread.sponsor_archived_at) };
  }));
  const active = cards.filter((c) => !c.archived);
  const archived = cards.filter((c) => c.archived);
  return (
    <DashboardShell current="/inbox" nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })} actName={act?.name}
      identity={fullName(profile)} eyebrow="Private conversations" title="Your" accent="inbox"
      intro="Talk with organizers and sponsors about their fundraiser. Purchased promises and refunds stay on the sponsorship record.">
      <p className="mb-5 text-sm text-muted">{active.filter((c) => c.unread).length} unread · {active.length} active</p>
      {active.length === 0 && <p className="rounded-card border border-line bg-panel p-6 text-muted">No active conversations yet. You can ask an organizer a question from a published fundraiser.</p>}
      {active.map((c) => <ThreadCard key={c.thread.id} {...c} />)}
      {archived.length > 0 && <section className="mt-8"><h2 className="heading mb-3 text-xl">Archived</h2>{archived.map((c) => <ThreadCard key={c.thread.id} {...c} />)}</section>}
      <form action={setInboxNotifications} className="mt-8 rounded-card border border-line bg-panel p-5 text-sm">
        <h2 className="mb-2 font-medium">Email notifications</h2><p className="mb-3 text-muted">Emails contain a link to your inbox, never a message preview.</p>
        <label className="flex items-center gap-2"><input type="checkbox" name="enabled" value="yes" defaultChecked={preference?.email_enabled !== false} /> Email me when someone sends a message</label>
        <button className="mt-3 text-accent-ink underline">Save preference</button>
      </form>
    </DashboardShell>
  );
}

function ThreadCard({ thread, context, last, organizer, unread }: { thread: Thread; context: Awaited<ReturnType<typeof threadContext>>; last: { created_at: string; sender_id: string } | null; organizer: boolean; unread: boolean }) {
  return <Link href={`/inbox/${thread.id}`} className="mb-2 block rounded-card border border-line bg-panel p-5 text-ink no-underline hover:border-accent-ink">
    <span className="flex items-center justify-between gap-4"><b>{organizer ? context.sponsorName : context.act?.name ?? context.organizerName}</b>{unread && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">New</span>}</span>
    <span className="mt-1 block text-sm text-muted">{context.run?.title ?? "Fundraiser"}{last ? ` · Last message ${new Date(last.created_at).toLocaleDateString("en-US")}` : ""}{thread.blocked_by ? " · Blocked" : ""}</span>
  </Link>;
}
