import { notFound } from "next/navigation";
import { THEMES, type ThemeName } from "@/components/Theme";
import { boardAsking, boardWorth, fanWorth, getBoard, getBoardByRunId } from "@/lib/boards";
import { FUNDRAISER_PARAM, fundraiserRequest } from "@/lib/fundraiser-identity";
import { backingReturnNotice } from "@/lib/payment-returns";
import { runUrl } from "@/lib/urls";
import { WIDGET_TIERS } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";
import { stripeConfigured } from "@/lib/stripe";
import { EmbedClient } from "./EmbedClient";

/**
 * The widget. Designed to live inside an iframe on an act's own site.
 * No nav, no footer. Frameable by any origin (see next.config.ts).
 * Payment happens here, on Door Money's origin, never on the host page: the Payment Element
 * confirms a PaymentIntent and the webhook does the rest.
 *
 * Which fundraiser. /embed/<organizer>?fundraiser=<id> is one exact fundraiser and nothing else:
 * if it has closed the widget says so, and it is never swapped for another fundraiser by the same
 * organizer. /embed/<organizer> with no id is the compatibility path for snippets pasted before
 * exact widgets existed, and draws the organizer's current fundraiser, as it always did. Either
 * way the fundraiser is settled once, here, and its id is what the payment and the return carry,
 * so what a fan read is what a fan paid for. See src/lib/fundraiser-identity.ts.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function EmbedPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // A widget that asked for one fundraiser gets that one or a 404, never a different one.
  const request = fundraiserRequest(sp[FUNDRAISER_PARAM]);
  if (request.kind === "invalid") notFound();
  const board = request.kind === "exact" ? await getBoardByRunId(slug, request.id) : await getBoard(slug);
  if (!board || !board.run) notFound();
  // The widget's backing tiers are music's, in music's words: a name on the tour thank-you, a name
  // on the merch table card. Another category's fundraiser does not get offered them by accident.
  // An exact-fundraiser widget that knows what it is selling is its own piece of Phase 3.
  if (board.run.categoryKey !== "music") notFound();

  const backers = board.backers ?? [];
  const backedCents = boardWorth(board) + fanWorth(board);
  const goalCents = boardAsking(board);
  const fundraiserId = board.run.id ?? null;
  const closed = board.run.status === "closed";
  // A redirect-based payment method sends the fan back here. Only a backing of this exact
  // fundraiser is acknowledged. See src/lib/payment-returns.ts.
  const done = await backingReturnNotice({ paymentIntent: one(sp.payment_intent), redirectStatus: one(sp.redirect_status) }, fundraiserId);
  // The embed is lit blue on its own; the board frames it in the board's own light.
  const theme = THEMES.find((t) => t === one(sp.theme)) as
    ThemeName | undefined;

  return (
    <div data-theme={theme}>
      <EmbedClient
        slug={slug}
        fundraiserId={fundraiserId}
        closed={closed}
        actName={board.act.name}
        runTitle={board.run.title}
        showCount={board.run.showCount ?? 0}
        kind={board.run.kind ?? "tour"}
        backedLabel={formatMoney(backedCents)}
        goalLabel={goalCents > 0 ? formatMoney(goalCents) : null}
        progress={
          goalCents > 0
            ? Math.min(100, Math.round((backedCents / goalCents) * 100))
            : 0
        }
        backerCount={backers.length}
        tiers={WIDGET_TIERS.map((t) => ({
          ...t,
          label: formatMoney(t.amountCents),
        }))}
        boardUrl={runUrl(slug, board.run.slug)}
        siteUrl={SITE.url}
        source={one(sp.source) === "board" ? "board" : "widget"}
        paymentsOpen={
          stripeConfigured() &&
          Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
        }
        initialDone={done}
      />
    </div>
  );
}
