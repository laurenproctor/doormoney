// In-memory copies of the seed boards, so the app runs before Supabase is connected.
// Shape matches what src/lib/boards.ts returns from the database.

export interface BoardLot {
  id: string;
  surfaceKey: string;
  label: string | null;
  priceCents: number;
  mode: "fixed" | "auction";
  status: "open" | "pending_funding" | "sold" | "unsold" | "cancelled";
  topBid?: { amountCents: number; patronName: string; anonymous: boolean } | null;
  soldTo?: string | null;
}

export interface Board {
  act: { slug: string; name: string; type: "touring_band" | "house_act" | "soloist"; city: string; bio: string | null; photoUrl?: string | null };
  run: { title: string; kind: string; startsOn: string; endsOn: string; showCount: number; expectedAttendance: number | null; biddingClosesAt: string | null };
  lots: BoardLot[];
}

export const SAMPLE_BOARDS: Record<string, Board> = {
  "gutter-hymns": {
    act: { slug: "gutter-hymns", name: "Gutter Hymns", type: "touring_band", city: "New York", bio: "Four-piece out of Ridgewood. Loud, tight, and on the road for most of the fall." },
    run: { title: "Fall run", kind: "tour", startsOn: "2026-10-03", endsOn: "2026-11-02", showCount: 18, expectedAttendance: 9400, biddingClosesAt: "2026-09-25T23:00:00-04:00" },
    lots: [
      { id: "a1", surfaceKey: "kick_head", label: null, priceCents: 120000, mode: "auction", status: "sold", soldTo: "Kettle St. Coffee" },
      { id: "a2", surfaceKey: "strap", label: null, priceCents: 45000, mode: "auction", status: "open", topBid: { amountCents: 52000, patronName: "Ridgewood Wine Co.", anonymous: false } },
      { id: "a3", surfaceKey: "case_sticker", label: "Case spot 1", priceCents: 35000, mode: "auction", status: "open", topBid: { amountCents: 38000, patronName: "Hi-Watt Print Shop", anonymous: false } },
      { id: "a4", surfaceKey: "case_sticker", label: "Case spot 2", priceCents: 35000, mode: "auction", status: "open", topBid: { amountCents: 36000, patronName: "Anonymous patron", anonymous: true } },
      { id: "a5", surfaceKey: "case_sticker", label: "Case spot 3", priceCents: 35000, mode: "fixed", status: "sold", soldTo: "LMN Pedals" },
      { id: "a6", surfaceKey: "merch_runner", label: null, priceCents: 50000, mode: "auction", status: "open", topBid: { amountCents: 61000, patronName: "LMN Pedals", anonymous: false } },
      { id: "a7", surfaceKey: "picks", label: null, priceCents: 15000, mode: "auction", status: "open", topBid: { amountCents: 17000, patronName: "Anonymous patron", anonymous: true } },
      { id: "a8", surfaceKey: "posts_email", label: null, priceCents: 40000, mode: "auction", status: "open", topBid: { amountCents: 44000, patronName: "Ridgewood Wine Co.", anonymous: false } },
      { id: "a9", surfaceKey: "rig_rundown", label: null, priceCents: 40000, mode: "auction", status: "open", topBid: null },
    ],
  },
  "rosie-bassoon": {
    act: { slug: "rosie-bassoon", name: "Rosie the Bassoonist", type: "soloist", city: "New York", bio: "Working bassoonist moving between rehearsals, services, chamber dates and sessions, with a feed where the bassoon does the talking." },
    run: { title: "Fall season", kind: "season", startsOn: "2026-09-15", endsOn: "2026-12-20", showCount: 32, expectedAttendance: null, biddingClosesAt: "2026-09-13T21:00:00-04:00" },
    lots: [
      { id: "b1", surfaceKey: "case_lid", label: "Case lid spot 1", priceCents: 6000, mode: "auction", status: "sold", soldTo: "Riverside Reeds" },
      { id: "b2", surfaceKey: "case_lid", label: "Case lid spot 2", priceCents: 4000, mode: "auction", status: "open", topBid: { amountCents: 4500, patronName: "Uptown Woodwind Repair", anonymous: false } },
      { id: "b3", surfaceKey: "case_lid", label: "Case lid spot 3", priceCents: 3000, mode: "fixed", status: "open", topBid: null },
      { id: "b4", surfaceKey: "music_stand", label: null, priceCents: 9000, mode: "auction", status: "open", topBid: { amountCents: 11000, patronName: "Parkside Music School", anonymous: false } },
      { id: "b5", surfaceKey: "posts_email", label: "Season thank-you post", priceCents: 5000, mode: "auction", status: "open", topBid: { amountCents: 5500, patronName: "Anonymous patron", anonymous: true } },
      { id: "b6", surfaceKey: "practice_video", label: null, priceCents: 7000, mode: "fixed", status: "open", topBid: null },
      { id: "b7", surfaceKey: "program_credit", label: null, priceCents: 4000, mode: "fixed", status: "open", topBid: null },
    ],
  },
};
