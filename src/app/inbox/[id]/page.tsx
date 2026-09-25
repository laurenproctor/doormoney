import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sendMessage, updateThread } from "@/app/actions/inbox";
import { DashboardShell } from "@/components/DashboardShell";
import { requireUser, currentProfile, ownedAct } from "@/lib/auth";
import { dashboardNav } from "@/lib/dashboardModel";
import { threadContext, threadFor } from "@/lib/inbox";
import { fullName } from "@/lib/names";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conversation", robots: { index: false, follow: false } };

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/inbox/${id}`);
  const thread = await threadFor(id, user.id);
  if (!thread) notFound();
  const sb = supabaseAdmin();
  const [context, { data: messages }, profile, act, { error, reported }] = await Promise.all([
    threadContext(thread), sb.from("inbox_messages").select("id,sender_id,body,created_at").eq("thread_id", id).order("created_at", { ascending: false }).limit(200),
    currentProfile(user.id), ownedAct(user.id), searchParams,
  ]);
  const organizer = user.id === thread.organizer_id;
  await sb.from("inbox_threads").update({ [organizer ? "organizer_read_at" : "sponsor_read_at"]: new Date().toISOString() }).eq("id", id);
  const { data: patrons } = await sb.from("patrons").select("id").eq("profile_id", thread.sponsor_id);
  const { data: purchases } = patrons?.length ? await sb.from("purchases").select("id,lots!inner(run_id,label)").in("patron_id", patrons.map((p) => p.id))
    .eq("lots.run_id", thread.run_id).in("payment_status", ["held", "released", "refunded", "partially_refunded"]) : { data: [] };
  return <DashboardShell current="/inbox" nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })} actName={act?.name}
    identity={fullName(profile)} eyebrow={<Link href="/inbox" className="text-accent-ink">← Inbox</Link>}
    title={organizer ? context.sponsorName : context.act?.name ?? context.organizerName} accent=""
    intro={`About ${context.run?.title ?? "a fundraiser"}. Only you and the other participant can read this conversation.`}>
    <div className="max-w-[760px] space-y-5">
      {reported && <p role="status" className="rounded-card border border-line bg-panel p-4 text-sm">Report sent to Door Money staff.</p>}
      {error === "report" && <p role="alert" className="text-sm text-red-700">Please explain what happened in 10 to 1,000 characters.</p>}
      {purchases && purchases.length > 0 && <div className="rounded-card border border-line bg-panel p-4 text-sm">Sponsorship records: {purchases.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link href={`/record/${p.id}`} className="text-accent-ink underline">{(p.lots as unknown as { label: string | null })?.label ?? "View record"}</Link></span>)}</div>}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">{(messages ?? []).slice().reverse().map((m) => <li key={m.id} className={`rounded-card border border-line p-4 ${m.sender_id === user.id ? "ml-8 bg-panel" : "mr-8 bg-ground"}`}>
        <div className="mb-2 text-xs text-muted">{m.sender_id === user.id ? "You" : organizer ? context.sponsorName : context.act?.name ?? "Organizer"} · {new Date(m.created_at).toLocaleString("en-US")}</div>
        <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
      </li>)}</ol>
      {thread.blocked_by ? <p className="rounded-card border border-line p-4 text-sm">This conversation is blocked. {thread.blocked_by === user.id ? "Unblock it to resume messaging." : "You cannot send another message."}</p> :
        <form action={sendMessage} className="rounded-card border border-line bg-panel p-5"><input type="hidden" name="thread" value={id} />
          <label htmlFor="reply" className="mb-2 block font-medium">Reply</label><textarea id="reply" name="body" rows={4} maxLength={2000} required className="w-full rounded-control border border-field-line bg-ground p-3 text-ink" />
          {error && error !== "report" && <p role="alert" className="mt-2 text-sm text-red-700">{error === "length" ? "Write up to 2,000 characters." : "Message could not be sent. If you sent several recently, wait ten minutes."}</p>}
          <button className="mt-3 rounded-control bg-accent px-5 py-3 font-medium text-on-accent">Send</button></form>}
      <div className="flex flex-wrap gap-3 text-sm"><form action={updateThread}><input type="hidden" name="thread" value={id} /><button name="action" value={(organizer ? thread.organizer_archived_at : thread.sponsor_archived_at) ? "unarchive" : "archive"} className="text-accent-ink underline">{(organizer ? thread.organizer_archived_at : thread.sponsor_archived_at) ? "Unarchive" : "Archive"}</button></form>
        {(!thread.blocked_by || thread.blocked_by === user.id) && <form action={updateThread}><input type="hidden" name="thread" value={id} /><button name="action" value={thread.blocked_by ? "unblock" : "block"} className="text-accent-ink underline">{thread.blocked_by ? "Unblock" : "Block"}</button></form>}</div>
      <form action={updateThread} className="border-t border-line pt-4"><input type="hidden" name="thread" value={id} /><label htmlFor="reason" className="block text-sm font-medium">Report this conversation to Door Money</label>
        <textarea id="reason" name="reason" required minLength={10} maxLength={1000} rows={2} className="mt-2 w-full rounded-control border border-field-line bg-ground p-3 text-sm" placeholder="Tell us what happened (at least 10 characters)" />
        <button name="action" value="report" className="mt-2 text-sm text-accent-ink underline">Submit report</button></form>
    </div>
  </DashboardShell>;
}
