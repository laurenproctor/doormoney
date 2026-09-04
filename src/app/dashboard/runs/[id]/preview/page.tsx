import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser, ownedAct } from "@/lib/auth";
import { getOwnedRunBoard } from "@/lib/boards";
import { BoardView } from "@/app/board/[slug]/BoardView";

type Props = { params: Promise<{ id: string }> };

/**
 * The board as it will look, before anyone else can see it.
 *
 * Private three times over: the route signs the visitor in first, the run is read filtered on the
 * act this account owns, and RLS refuses a draft run to anybody but its owner even if that filter
 * were wrong. Nothing links here from a public page, /auctions and the sitemap both list only open
 * runs, and robots.txt has disallowed /dashboard since Phase 2. Publishing is still the only thing
 * that makes a board public.
 */
export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false } };

export default async function RunPreviewPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/runs/${id}/preview`);
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

  const board = await getOwnedRunBoard(id, act.id);
  if (!board || !board.run) notFound();

  return <BoardView board={board} slug={act.slug} draft={{ backHref: `/dashboard/runs/${id}`, published: board.run.status === "open" || board.run.status === "live" }} />;
}
