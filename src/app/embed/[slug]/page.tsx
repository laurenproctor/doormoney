import { notFound } from "next/navigation";
import { getBoard } from "@/lib/boards";
import { WIDGET_TIERS } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { EmbedClient } from "./EmbedClient";

/**
 * The widget. Designed to live inside an iframe on an act's own site.
 * No nav, no footer. Frameable by any origin (see next.config.ts).
 * Payment happens here, on Door Money's origin, never on the host page.
 */
export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const board = await getBoard(slug);
  if (!board) notFound();

  // Phase 4 replaces these with real backing totals.
  const backedCents = 214000;
  const goalCents = 360000;

  return (
    <EmbedClient
      slug={slug}
      actName={board.act.name}
      runTitle={board.run.title}
      showCount={board.run.showCount}
      backedLabel={formatMoney(backedCents)}
      goalLabel={formatMoney(goalCents)}
      progress={Math.min(100, Math.round((backedCents / goalCents) * 100))}
      tiers={WIDGET_TIERS.map((t) => ({ ...t, label: formatMoney(t.amountCents) }))}
      boardUrl={`/board/${slug}`}
    />
  );
}
