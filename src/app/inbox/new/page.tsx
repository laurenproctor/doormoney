import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { startThread } from "@/app/actions/inbox";
import { DashboardShell } from "@/components/DashboardShell";
import { requireUser, currentProfile, ownedAct } from "@/lib/auth";
import { dashboardNav } from "@/lib/dashboardModel";
import { ownedPurchase, UUID } from "@/lib/inbox";
import { fullName } from "@/lib/names";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ask the organizer", robots: { index: false, follow: false } };

export default async function NewMessage({ searchParams }: { searchParams: Promise<{ run?: string; purchase?: string; error?: string }> }) {
  const user = await requireUser("/inbox");
  const { run: id, purchase, error } = await searchParams;
  if (!id || !UUID.test(id)) notFound();
  const [{ data: run }, profile, act] = await Promise.all([
    supabaseAdmin().from("runs").select("id,title,status,acts!inner(name,owner_id)").eq("id", id).maybeSingle(),
    currentProfile(user.id), ownedAct(user.id),
  ]);
  const organizer = run?.acts as unknown as { name: string; owner_id: string | null } | undefined;
  const bought = purchase ? await ownedPurchase(purchase, user.id, id) : false;
  if (!run || !organizer?.owner_id || organizer.owner_id === user.id || (purchase && !bought) || (!bought && !["open", "live"].includes(run.status))) notFound();
  return <DashboardShell current="/inbox" nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })} actName={act?.name}
    identity={fullName(profile)} eyebrow="Private conversation" title="Ask the" accent="organizer"
    intro={`Your message goes to ${organizer.name} about ${run.title}. You can return to the conversation from your inbox.`}>
    <form action={startThread} className="max-w-[680px] rounded-card border border-line bg-panel p-6">
      <input type="hidden" name="run" value={id} />{bought && <input type="hidden" name="purchase" value={purchase} />}
      <label htmlFor="body" className="mb-2 block font-medium">Your message</label>
      <textarea id="body" name="body" required minLength={1} maxLength={2000} rows={6} className="w-full rounded-control border border-field-line bg-ground p-3 text-ink" />
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error === "length" ? "Write a message of up to 2,000 characters." : "You have started too many conversations today. Please try later."}</p>}
      <p className="mt-3 text-sm text-muted">Messages cannot change the purchased offer or start a refund. Use the sponsorship record for those steps.</p>
      <button type="submit" className="mt-5 rounded-control bg-accent px-5 py-3 font-medium text-on-accent">Send message</button>
    </form>
  </DashboardShell>;
}
