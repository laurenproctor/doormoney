"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { closeTimeOf, minimumBidCents, notifyOutbid } from "@/lib/auctions";
import { formatMoney } from "@/lib/money";
import { patronFor, payingProfileId } from "@/lib/patrons";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/*
  Placing a bid. Straight bidding: the number a patron enters is what they pay if they win.
  Nobody signs in to bid, so a bid carries a name and an email; the same pair is one patron.
  Called from the board, which is our own page, so this is a server action rather than a route.
*/

const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Input = z.object({
  lotId: Id,
  amountCents: z.number().int().positive().max(100_000_000),
  patronName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  anonymous: z.boolean().default(false),
  /** Left empty by people, filled in by robots. */
  website: z.string().max(0).optional(),
});

export type BidResult = { ok: true; amountCents: number; nextMinimumCents: number } | { ok: false; error: string };

type LotRow = {
  id: string;
  price_cents: number;
  mode: string;
  status: string;
  closes_at: string | null;
  runs: { status: string; bidding_closes_at: string | null; acts: { slug: string } };
};

export async function placeBid(input: z.input<typeof Input>): Promise<BidResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That bid did not look right. Check the amount and the email." };
  const { lotId, amountCents, patronName, email, anonymous, website } = parsed.data;
  if (website) return { ok: false, error: "That bid did not go through." };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("lots")
    .select("id,price_cents,mode,status,closes_at,runs!inner(status,bidding_closes_at,acts!inner(slug))")
    .eq("id", lotId)
    .maybeSingle();
  if (error) return { ok: false, error: "That did not load. Try once more." };
  const lot = data as unknown as LotRow | null;
  if (!lot) return { ok: false, error: "That spot is not on any board." };
  if (lot.mode !== "auction") return { ok: false, error: "That spot is a fixed price, not an auction." };
  if (!["open", "live"].includes(lot.runs.status)) return { ok: false, error: "That board is closed." };
  if (lot.status !== "open") return { ok: false, error: "Bidding on that spot is over." };

  const closesAt = closeTimeOf(lot, lot.runs);
  if (closesAt && closesAt <= new Date().toISOString()) return { ok: false, error: "Bidding on that spot has closed." };

  // The bid has to clear the reserve, or beat the top bid by a step. Read the top inside the same request
  // so a bid placed a second ago still counts.
  const { data: topRow } = await sb.from("bids").select("id,amount_cents").eq("lot_id", lot.id).is("passed_at", null).order("amount_cents", { ascending: false }).limit(1).maybeSingle();
  const topCents = (topRow?.amount_cents as number | undefined) ?? null;
  const minimum = minimumBidCents(lot.price_cents, topCents);
  if (amountCents < minimum) return { ok: false, error: `The next bid starts at ${formatMoney(minimum)}.` };

  // A bidder who happens to be signed in, under their own verified address, gets the patron row
  // tied to their account. Bidding still needs no account, and the address typed here decides
  // nothing on its own.
  const { data: session } = await (await supabaseServer()).auth.getUser();
  const patronId = await patronFor(sb, patronName, email, payingProfileId(session.user, email));
  if (!patronId) return { ok: false, error: "That did not save. Try once more." };

  const { data: bid, error: bidError } = await sb.from("bids").insert({ lot_id: lot.id, patron_id: patronId, amount_cents: amountCents, anonymous }).select("id").single();
  if (bidError || !bid) return { ok: false, error: "That bid did not save. Try once more." };

  // Mail is best effort: the bid is already in, and a failed send must not lose it.
  try {
    await notifyOutbid(sb, lot.id, bid.id);
  } catch (e) {
    console.error("outbid notices failed", lot.id, e instanceof Error ? e.message : e);
  }

  revalidatePath(`/board/${lot.runs.acts.slug}`);
  return { ok: true, amountCents, nextMinimumCents: minimumBidCents(lot.price_cents, amountCents) };
}
