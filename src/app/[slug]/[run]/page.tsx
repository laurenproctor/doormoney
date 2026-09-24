import { getCategoryLabels } from "@/lib/category-registry";
import { signedInSponsor } from "@/lib/auth";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getBoard } from "@/lib/boards";
import { periodOf } from "@/lib/periods";
import { currentSlugFor } from "@/lib/patronprofile";
import { normalizeUsername } from "@/lib/username";
import { lotPaidNotice } from "@/lib/payment-returns";
import { runPath, runSlugFromSegment } from "@/lib/urls";
import { BoardView } from "./BoardView";

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

export default async function RunBoardPage({ params, searchParams }: Props) {
  const [{ slug, run: segment }, sp] = await Promise.all([params, searchParams]);
  const runSlug = runSlugFromSegment(segment);
  if (!runSlug) notFound();

  const board = await getBoard(slug, runSlug);
  if (!board || !board.run) {
    // An address that moved keeps its old word pointing here. Retired words are never
    // reissued (migration 0024), so this can only ever land on the musician who left it behind.
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(runPath(moved, runSlug));
    notFound();
  }

  // Rendering is read-only. An auction past its time is closed by the worker at
  // /api/cron/auctions (remediation Phase 3), never by a page load: a page that settled its own
  // lots on sight let any anonymous visitor close auctions, charge cards and send email.
  // Only a payment for this exact fundraiser is acknowledged here, never one for another
  // fundraiser by the same organizer. See src/lib/payment-returns.ts.
  const paid = await lotPaidNotice(typeof sp.paid === "string" ? sp.paid : undefined, board.run.id);

  // The signed-in visitor, if any, so the sponsor forms use the account's email. Null with no
  // session and null with no database: the page renders the same either way.
  const [labels, viewer] = await Promise.all([getCategoryLabels(), signedInSponsor()]);
  return <BoardView board={board} slug={slug} paid={paid} categoryName={labels[board.run.categoryKey]} viewer={viewer} />;
}
