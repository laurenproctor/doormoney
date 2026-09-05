import { notFound } from "next/navigation";
import { THEMES, type ThemeName } from "@/components/Theme";
import { boardAsking, boardWorth, fanWorth, getBoard } from "@/lib/boards";
import { runUrl } from "@/lib/urls";
import { WIDGET_TIERS, tierPlace } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { EmbedClient } from "./EmbedClient";

/**
 * The widget. Designed to live inside an iframe on an act's own site.
 * No nav, no footer. Frameable by any origin (see next.config.ts).
 * Payment happens here, on Door Money's origin, never on the host page: the Payment Element
 * confirms a PaymentIntent and the webhook does the rest.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

/** A redirect-based payment method (a bank, a wallet) sends the fan back here. Confirm it is this act's backing before saying so. */
async function returned(
  sp: Record<string, string | string[] | undefined>,
  slug: string,
) {
  const piId = one(sp.payment_intent);
  const status = one(sp.redirect_status);
  if (!piId || !piId.startsWith("pi_") || !stripeConfigured()) return null;
  if (status !== "succeeded" && status !== "processing") return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.metadata?.kind !== "backing" || pi.metadata?.act_slug !== slug)
      return null;
    if (pi.status !== "succeeded" && pi.status !== "processing") return null;
    return {
      label: formatMoney(pi.amount),
      place: tierPlace(pi.metadata.tier ?? ""),
    };
  } catch {
    return null;
  }
}

export default async function EmbedPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const board = await getBoard(slug);
  if (!board || !board.run) notFound();

  const backers = board.backers ?? [];
  const backedCents = boardWorth(board) + fanWorth(board);
  const goalCents = boardAsking(board);
  const done = await returned(sp, slug);
  // The embed is lit blue on its own; the board frames it in the board's own light.
  const theme = THEMES.find((t) => t === one(sp.theme)) as
    ThemeName | undefined;

  return (
    <div data-theme={theme}>
      <EmbedClient
        slug={slug}
        actName={board.act.name}
        runTitle={board.run.title}
        showCount={board.run.showCount}
        kind={board.run.kind}
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
