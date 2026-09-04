import { supabaseServer } from "@/lib/supabase/server";
import { SAMPLE_BOARDS, type Backer, type Board, type BoardLot } from "@/lib/sample";

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Load a public board by act slug. Falls back to the in-memory sample until Supabase is connected. */
export async function getBoard(slug: string): Promise<Board | null> {
  if (!configured()) return SAMPLE_BOARDS[slug] ?? null;

  const sb = await supabaseServer();
  const { data: actRow } = await sb.from("acts").select("id,slug,name,type,city,bio,photo_url").eq("slug", slug).single();
  if (!actRow) return null;
  const { id: actId, photo_url, ...actRest } = actRow;
  const act = { ...actRest, photoUrl: photo_url as string | null };

  const { data: run } = await sb
    .from("runs")
    .select("id,title,kind,starts_on,ends_on,show_count,expected_attendance,bidding_closes_at")
    .eq("act_id", actId)
    .in("status", ["open", "live"])
    .order("starts_on", { ascending: false })
    .limit(1)
    .single();
  if (!run) return { act, run: null as never, lots: [] };

  // lots and bids are linked twice (a bid belongs to a lot; a lot records its winning bid),
  // so the join has to name the relationship. Patron names come through the patron_names view.
  const { data: lots, error: lotsError } = await sb
    .from("lots")
    .select("id,surface_key,label,price_cents,mode,status,closes_at,buy_now_cents,winner_bid_id,bids!bids_lot_id_fkey(amount_cents,anonymous,passed_at,patron_names(name))")
    .eq("run_id", run.id)
    .order("created_at");
  if (lotsError) console.error("board lots query failed", lotsError.message);

  // purchases is locked too. Who bought a sold lot comes through the lot_buyers view (migration 0003).
  const soldIds = (lots ?? []).filter((l) => l.status === "sold").map((l) => l.id);
  const buyers = new Map<string, { name: string; amountCents: number }>();
  if (soldIds.length) {
    const { data } = await sb.from("lot_buyers").select("lot_id,name,amount_cents").in("lot_id", soldIds);
    for (const b of (data ?? []) as { lot_id: string; name: string; amount_cents: number }[]) buyers.set(b.lot_id, { name: b.name, amountCents: b.amount_cents });
  }

  // Fans who backed the run through the widget, through the run_backers view (migration 0010).
  const { data: fanRows } = await sb.from("run_backers").select("display_name,tier,amount_cents,created_at").eq("run_id", run.id).order("created_at");
  const backers: Backer[] = ((fanRows ?? []) as { display_name: string; tier: string; amount_cents: number }[]).map((f) => ({ name: f.display_name, tier: f.tier, amountCents: f.amount_cents }));

  const shaped: BoardLot[] = (lots ?? []).map((l) => {
    type BidRow = { amount_cents: number; anonymous: boolean; passed_at: string | null; patron_names: { name: string } | null };
    // A bid that won and then let the 48 hours run out is out of the running, so it is not the top bid.
    const bids = ((l.bids ?? []) as unknown as BidRow[]).filter((b) => !b.passed_at).sort((a, b) => b.amount_cents - a.amount_cents);
    const top = bids[0];
    return {
      id: l.id,
      surfaceKey: l.surface_key,
      label: l.label,
      priceCents: l.price_cents,
      mode: l.mode,
      status: l.status,
      closesAt: l.closes_at,
      buyNowCents: l.buy_now_cents,
      topBid: top ? { amountCents: top.amount_cents, patronName: top.anonymous ? "Anonymous patron" : top.patron_names?.name ?? "Patron", anonymous: top.anonymous } : null,
      soldTo: buyers.get(l.id)?.name ?? null,
      soldCents: buyers.get(l.id)?.amountCents ?? null,
      wonAtAuction: Boolean(l.winner_bid_id),
    };
  });

  return {
    act,
    run: { id: run.id, title: run.title, kind: run.kind, startsOn: run.starts_on, endsOn: run.ends_on, showCount: run.show_count, expectedAttendance: run.expected_attendance, biddingClosesAt: run.bidding_closes_at },
    lots: shaped,
    backers,
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
  return b.lots.reduce((n, l) => n + (l.status === "sold" ? (l.soldCents ?? l.priceCents) : (l.topBid?.amountCents ?? 0)), 0);
}

/** What the fans have put in through the widget. */
export function fanWorth(b: Board) {
  return (b.backers ?? []).reduce((n, f) => n + f.amountCents, 0);
}

/** What the board is asking for in total: every lot at its list price. The widget's bar fills against this. */
export function boardAsking(b: Board) {
  return b.lots.reduce((n, l) => n + l.priceCents, 0);
}

export function openSpots(b: Board) {
  return b.lots.filter((l) => l.status === "open").length;
}
