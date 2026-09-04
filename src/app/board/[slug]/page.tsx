import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getBoard } from "@/lib/boards";
import { currentSlugFor } from "@/lib/patronprofile";
import { normalizeUsername } from "@/lib/username";
import { closeTimeOf, settleDueLots } from "@/lib/auctions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { BoardView, type PaidNotice } from "./BoardView";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoard(slug);
  if (!board || !board.run) return { title: "Board" };
  const description = `${board.act.name}, ${board.run.title}. ${board.run.showCount} ${board.run.kind === "season" ? "gigs" : "shows"} in ${board.act.city}. Patrons put money behind the run on Door Money.`;
  return {
    title: `${board.act.name}, live board`,
    description,
    openGraph: { title: `${board.act.name} on Door Money`, description, type: "website", ...(board.act.photoUrl ? { images: [{ url: board.act.photoUrl }] } : {}) },
    twitter: { card: board.act.photoUrl ? "summary_large_image" : "summary", title: `${board.act.name} on Door Money`, description },
  };
}

/** Whether anything on this board is past its moment: bidding over, or a funding window run out. */
async function hasOverdueLot(board: NonNullable<Awaited<ReturnType<typeof getBoard>>>) {
  const nowIso = new Date().toISOString();
  const closes = board.run?.biddingClosesAt ?? null;
  const overdueBidding = board.lots.some((l) => {
    if (l.mode !== "auction" || l.status !== "open") return false;
    const at = closeTimeOf({ closes_at: l.closesAt ?? null }, { bidding_closes_at: closes });
    return at !== null && at <= nowIso;
  });
  if (overdueBidding) return true;
  // A funding deadline is not on the public board, so ask for the ones that matter.
  const waiting = board.lots.filter((l) => l.mode === "auction" && l.status === "pending_funding").map((l) => l.id);
  if (!waiting.length) return false;
  const { data } = await supabaseAdmin().from("lots").select("id").in("id", waiting).lt("funding_deadline", nowIso).limit(1);
  return Boolean(data?.length);
}

/** What the patron sees back on the board after Stripe's embedded checkout sends them here. */
async function paidNotice(sessionId: string | undefined, slug: string): Promise<PaidNotice | null> {
  if (!sessionId || !sessionId.startsWith("cs_") || !stripeConfigured()) return null;
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.metadata?.act_slug !== slug) return null;
    const email = s.customer_details?.email ?? null;
    if (s.status === "complete" && s.payment_status !== "unpaid") return { kind: "paid", amount: s.amount_total ?? 0, email };
    if (s.status === "complete") return { kind: "processing", amount: s.amount_total ?? 0, email };
    return null;
  } catch {
    return null;
  }
}

export default async function BoardPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  let board = await getBoard(slug);
  if (!board || !board.run) {
    // A board address that moved keeps its old word pointing here. Retired words are never
    // reissued (migration 0024), so this can only ever land on the musician who left it behind.
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(`/board/${moved}`);
    notFound();
  }

  // An auction that has run out of time settles here rather than waiting for the next cron pass.
  // Both writes are conditional on the state they expect, so two readers at once cannot double up.
  if (await hasOverdueLot(board)) {
    await settleDueLots(supabaseAdmin());
    board = (await getBoard(slug)) ?? board;
  }
  const paid = await paidNotice(typeof sp.paid === "string" ? sp.paid : undefined, slug);

  return <BoardView board={board} slug={slug} paid={paid} />;
}
