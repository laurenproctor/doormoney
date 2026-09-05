import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getBoard } from "@/lib/boards";
import { periodOf } from "@/lib/periods";
import { currentSlugFor } from "@/lib/patronprofile";
import { normalizeUsername } from "@/lib/username";
import { closeTimeOf, settleDueLots } from "@/lib/auctions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { runPath, runSlugFromSegment } from "@/lib/urls";
import { BoardView, type PaidNotice } from "./BoardView";

/*
  One fundraiser's page: /gutter-hymns/support-europe-tour.

  The second segment carries the "support-" prefix the site puts on every fundraiser address, so a
  segment without it is not a fundraiser and this route does not serve it.
*/

type Props = { params: Promise<{ slug: string; run: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, run: segment } = await params;
  const runSlug = runSlugFromSegment(segment);
  const board = runSlug ? await getBoard(slug, runSlug) : null;
  if (!board || !board.run) return { title: "Fundraiser" };
  const description = `${board.act.name}, ${board.run.title}. ${board.run.showCount} ${periodOf(board.run.kind).units} in ${board.act.city}. Patrons put money behind the ${periodOf(board.run.kind).noun} on Door Money.`;
  return {
    title: `${board.act.name}, ${board.run.title}`,
    description,
    openGraph: { title: `${board.act.name} on Door Money`, description, type: "website", ...(board.act.photoUrl ? { images: [{ url: board.act.photoUrl }] } : {}) },
    twitter: { card: board.act.photoUrl ? "summary_large_image" : "summary", title: `${board.act.name} on Door Money`, description },
  };
}

/** Whether anything here is past its moment: bidding over, or a funding window run out. */
async function hasOverdueLot(board: NonNullable<Awaited<ReturnType<typeof getBoard>>>) {
  const nowIso = new Date().toISOString();
  const closes = board.run?.biddingClosesAt ?? null;
  const overdueBidding = board.lots.some((l) => {
    if (l.mode !== "auction" || l.status !== "open") return false;
    const at = closeTimeOf({ closes_at: l.closesAt ?? null }, { bidding_closes_at: closes });
    return at !== null && at <= nowIso;
  });
  if (overdueBidding) return true;
  // A funding deadline is not on the public page, so ask for the ones that matter.
  const waiting = board.lots.filter((l) => l.mode === "auction" && l.status === "pending_funding").map((l) => l.id);
  if (!waiting.length) return false;
  const { data } = await supabaseAdmin().from("lots").select("id").in("id", waiting).lt("funding_deadline", nowIso).limit(1);
  return Boolean(data?.length);
}

/** What the patron sees when Stripe's embedded checkout sends them back here. */
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

export default async function RunBoardPage({ params, searchParams }: Props) {
  const [{ slug, run: segment }, sp] = await Promise.all([params, searchParams]);
  const runSlug = runSlugFromSegment(segment);
  if (!runSlug) notFound();

  let board = await getBoard(slug, runSlug);
  if (!board || !board.run) {
    // An address that moved keeps its old word pointing here. Retired words are never
    // reissued (migration 0024), so this can only ever land on the musician who left it behind.
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(runPath(moved, runSlug));
    notFound();
  }

  // An auction that has run out of time settles here rather than waiting for the next cron pass.
  // Both writes are conditional on the state they expect, so two readers at once cannot double up.
  if (await hasOverdueLot(board)) {
    await settleDueLots(supabaseAdmin());
    board = (await getBoard(slug, runSlug)) ?? board;
  }
  const paid = await paidNotice(typeof sp.paid === "string" ? sp.paid : undefined, slug);

  return <BoardView board={board} slug={slug} paid={paid} />;
}
