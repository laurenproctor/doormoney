import { supabaseServer } from "@/lib/supabase/server";
import { SAMPLE_BOARDS, type Board, type BoardLot } from "@/lib/sample";

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Load a public board by act slug. Falls back to the in-memory sample until Supabase is connected. */
export async function getBoard(slug: string): Promise<Board | null> {
  if (!configured()) return SAMPLE_BOARDS[slug] ?? null;

  const sb = await supabaseServer();
  const { data: act } = await sb.from("acts").select("slug,name,type,city,bio").eq("slug", slug).single();
  if (!act) return null;

  const { data: run } = await sb
    .from("runs")
    .select("id,title,kind,starts_on,ends_on,show_count,expected_attendance,bidding_closes_at")
    .eq("act_id", (await sb.from("acts").select("id").eq("slug", slug).single()).data!.id)
    .in("status", ["open", "live"])
    .order("starts_on", { ascending: false })
    .limit(1)
    .single();
  if (!run) return { act, run: null as never, lots: [] };

  const { data: lots } = await sb
    .from("lots")
    .select("id,surface_key,label,price_cents,mode,status,bids(amount_cents,anonymous,patrons(name))")
    .eq("run_id", run.id)
    .order("created_at");

  const shaped: BoardLot[] = (lots ?? []).map((l) => {
    type BidRow = { amount_cents: number; anonymous: boolean; patrons: { name: string } | null };
    const bids = ((l.bids ?? []) as unknown as BidRow[]).sort((a, b) => b.amount_cents - a.amount_cents);
    const top = bids[0];
    return {
      id: l.id,
      surfaceKey: l.surface_key,
      label: l.label,
      priceCents: l.price_cents,
      mode: l.mode,
      status: l.status,
      topBid: top ? { amountCents: top.amount_cents, patronName: top.anonymous ? "Anonymous patron" : top.patrons?.name ?? "Patron", anonymous: top.anonymous } : null,
    };
  });

  return {
    act,
    run: { title: run.title, kind: run.kind, startsOn: run.starts_on, endsOn: run.ends_on, showCount: run.show_count, expectedAttendance: run.expected_attendance, biddingClosesAt: run.bidding_closes_at },
    lots: shaped,
  };
}

export async function listOpenBoards() {
  if (!configured()) return Object.values(SAMPLE_BOARDS);
  const sb = await supabaseServer();
  const { data } = await sb.from("acts").select("slug").order("created_at");
  const boards = await Promise.all((data ?? []).map((a) => getBoard(a.slug)));
  return boards.filter((b): b is Board => Boolean(b && b.run));
}

/** What a board is worth right now: sold lots at their price, open lots at the top bid. */
export function boardWorth(b: Board) {
  return b.lots.reduce((n, l) => n + (l.status === "sold" ? l.priceCents : (l.topBid?.amountCents ?? 0)), 0);
}

export function openSpots(b: Board) {
  return b.lots.filter((l) => l.status === "open").length;
}
