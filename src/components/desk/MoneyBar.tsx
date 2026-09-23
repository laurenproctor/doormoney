import { formatMoney } from "@/lib/money";

/**
 * Where a fundraiser's money stands, in one bar.
 *
 * Three segments and no more: paid is the page's light, money held on a card until an offer closes
 * is the same light hatched, and what is left of the goal is the empty track. Hatching rather than
 * a second color, because a bid is not a second kind of money: it is the same money, not settled.
 *
 * The bar is a picture and says so, and its label states every number in it, so nothing here is
 * only visible to somebody who can see the colors. Cents in, nothing computed but the widths.
 *
 * With no goal there is no open segment and no goal in the label: a goal nobody set is not a
 * number this may draw.
 */
export function MoneyBar({
  paidCents,
  bidsCents,
  goalCents,
  height = 6,
  className = "",
}: {
  paidCents: number;
  bidsCents: number;
  goalCents?: number | null;
  height?: number;
  className?: string;
}) {
  const goal = goalCents && goalCents > 0 ? goalCents : null;
  const openCents = goal ? Math.max(0, goal - paidCents - bidsCents) : 0;
  // The track is the goal, unless the money already passed it: a bar cannot run off its own end.
  const total = Math.max(goal ?? 0, paidCents + bidsCents, 1);
  const width = (cents: number) => `${((cents / total) * 100).toFixed(1)}%`;

  const parts = [`${formatMoney(paidCents)} paid`, `${formatMoney(bidsCents)} in bids`];
  if (goal) parts.push(`${formatMoney(openCents)} open`);
  const label = goal ? `Goal ${formatMoney(goal)}: ${parts.join(", ")}` : parts.join(", ");

  return (
    <div
      role="img"
      aria-label={label}
      className={`flex overflow-hidden rounded-full bg-neutral-wash ${className}`}
      style={{ height }}
    >
      <span style={{ width: width(paidCents), background: "var(--ok)" }} />
      <span
        style={{
          width: width(bidsCents),
          backgroundImage: "repeating-linear-gradient(135deg, var(--ok) 0 3px, transparent 3px 7px)",
        }}
      />
    </div>
  );
}
