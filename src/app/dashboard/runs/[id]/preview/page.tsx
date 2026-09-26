import { getCategoryLabels } from "@/lib/category-registry";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser, ownedAct } from "@/lib/auth";
import { getOwnedRunBoard } from "@/lib/boards";
import { BoardView } from "@/app/[slug]/[run]/BoardView";

type Props = { params: Promise<{ id: string }> };

/**
 * The fundraiser's page as a sponsor will see it, before anyone else can.
 *
 * Private three times over: the route signs the visitor in first, the fundraiser is read filtered
 * on the organizer this account owns, and RLS refuses a draft to anybody but its owner even if that
 * filter were wrong. Nothing links here from a public page, /fundraisers and the sitemap both list
 * only open fundraisers, and robots.txt has disallowed /dashboard since Phase 2. Publishing is still
 * the only thing that makes the page public.
 */
export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false } };

export default async function RunPreviewPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/runs/${id}/preview`);
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

  const board = await getOwnedRunBoard(id, act.id);
  if (!board || !board.run) notFound();

  const labels = await getCategoryLabels();
  return <BoardView board={board} slug={act.slug} categoryName={labels[board.run.categoryKey]} draft={{ backHref: `/dashboard/runs/${id}`, published: board.run.status === "open" || board.run.status === "live" }} />;
}
