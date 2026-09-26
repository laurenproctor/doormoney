import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inbox reports", robots: { index: false, follow: false } };

export default async function InboxReports() {
  await requireAdmin();
  const { data } = await supabaseAdmin().from("inbox_reports").select("id,thread_id,reason,created_at,resolved_at")
    .is("resolved_at", null).order("created_at", { ascending: false }).limit(100);
  return <main className="mx-auto max-w-[800px] px-6 py-10"><Link href="/admin" className="text-accent-ink">← Staff overview</Link>
    <h1 className="display my-6">Inbox reports</h1>
    {!data?.length && <p>No open reports.</p>}
    <ul className="list-none space-y-3 p-0">{data?.map((r) => <li key={r.id} className="rounded-card border border-line bg-panel p-5">
      <Link href={`/admin/inbox/${r.thread_id}`} className="font-medium text-accent-ink underline">Review reported conversation</Link>
      <p className="mt-2 whitespace-pre-wrap text-sm">{r.reason}</p><time className="text-xs text-muted">{new Date(r.created_at).toLocaleString("en-US")}</time>
    </li>)}</ul>
  </main>;
}
