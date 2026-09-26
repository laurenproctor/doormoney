import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { resolveInboxReport } from "@/app/actions/inbox-admin";
import { threadContext, UUID, type Thread } from "@/lib/inbox";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reported conversation", robots: { index: false, follow: false } };

export default async function ReportedThread({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sb = supabaseAdmin();
  const { data: reports } = await sb.from("inbox_reports").select("id,reason,reporter_id,created_at,resolved_at")
    .eq("thread_id", id).order("created_at", { ascending: false });
  if (!reports?.length) notFound();
  const { data: row } = await sb.from("inbox_threads").select("*").eq("id", id).single();
  if (!row) notFound();
  // This page is intentionally dynamic. Record every staff opening before private content is read.
  const { error: auditError } = await sb.from("inbox_staff_access").insert({ thread_id: id, staff_id: staff.id, reason: "Review participant report" });
  if (auditError) throw new Error("Could not log staff inbox access");
  const [context, { data: messages }] = await Promise.all([
    threadContext(row as Thread), sb.from("inbox_messages").select("id,sender_id,body,created_at").eq("thread_id", id).order("created_at").limit(300),
  ]);
  return <main className="mx-auto max-w-[800px] px-6 py-10"><Link href="/admin/inbox" className="text-accent-ink">← Reports</Link>
    <h1 className="display my-6">Reported conversation</h1><p>{context.act?.name ?? "Organizer"} · {context.run?.title ?? "Fundraiser"}</p>
    <section className="my-6 rounded-card border border-line bg-panel p-5"><h2 className="heading text-xl">Reports</h2>{reports.map((r) => <div key={r.id} className="border-t border-line py-3">
      <p className="whitespace-pre-wrap">{r.reason}</p><small>{r.resolved_at ? "Resolved" : "Open"} · {new Date(r.created_at).toLocaleString("en-US")}</small>
      {!r.resolved_at && <form action={resolveInboxReport}><input type="hidden" name="report" value={r.id} /><button className="mt-2 block text-sm text-accent-ink underline">Mark reviewed</button></form>}
    </div>)}</section>
    <ol className="list-none space-y-3 p-0">{messages?.map((m) => <li key={m.id} className="rounded-card border border-line p-4">
      <small>{m.sender_id === row.organizer_id ? "Organizer" : "Sponsor"} · {new Date(m.created_at).toLocaleString("en-US")}</small>
      <p className="mt-2 whitespace-pre-wrap break-words">{m.body}</p></li>)}</ol>
  </main>;
}
