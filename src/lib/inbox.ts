import { supabaseAdmin } from "@/lib/supabase/server";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Thread = {
  id: string;
  run_id: string;
  organizer_id: string;
  sponsor_id: string;
  blocked_by: string | null;
  organizer_read_at: string;
  sponsor_read_at: string;
  organizer_archived_at: string | null;
  sponsor_archived_at: string | null;
  created_at: string;
};

export async function threadFor(id: string, userId: string): Promise<Thread | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabaseAdmin().from("inbox_threads").select("*").eq("id", id)
    .or(`organizer_id.eq.${userId},sponsor_id.eq.${userId}`).maybeSingle();
  return (data as Thread | null) ?? null;
}

export async function threadContext(thread: Thread) {
  const sb = supabaseAdmin();
  const [{ data: run }, { data: act }, { data: sponsor }, { data: organizer }] = await Promise.all([
    sb.from("runs").select("id,title,slug,status,act_id").eq("id", thread.run_id).single(),
    sb.from("acts").select("id,name,slug").eq("owner_id", thread.organizer_id).maybeSingle(),
    sb.from("profiles").select("first_name,last_name").eq("id", thread.sponsor_id).single(),
    sb.from("profiles").select("first_name,last_name").eq("id", thread.organizer_id).single(),
  ]);
  return {
    run: run as { id: string; title: string; slug: string; status: string; act_id: string } | null,
    act: act as { id: string; name: string; slug: string } | null,
    sponsorName: [sponsor?.first_name, sponsor?.last_name].filter(Boolean).join(" ") || "Sponsor",
    organizerName: [organizer?.first_name, organizer?.last_name].filter(Boolean).join(" ") || act?.name || "Organizer",
  };
}

/** Purchase ownership is the verified profile link, never the email typed at checkout. */
export async function ownedPurchase(purchaseId: string, userId: string, runId: string) {
  if (!UUID.test(purchaseId)) return false;
  const sb = supabaseAdmin();
  const { data: patronIds } = await sb.from("patrons").select("id").eq("profile_id", userId);
  if (!patronIds?.length) return false;
  const { data } = await sb.from("purchases").select("id,lots!inner(run_id)")
    .eq("id", purchaseId).in("patron_id", patronIds.map((p) => p.id))
    .eq("lots.run_id", runId).in("payment_status", ["held", "released", "refunded", "partially_refunded"]).maybeSingle();
  return Boolean(data);
}
