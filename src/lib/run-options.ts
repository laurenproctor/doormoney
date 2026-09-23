/**
 * Every sponsorship option on one fundraiser, and the one thing worth doing to each.
 *
 * Pure, so the arithmetic can be read without a database: the page reads the rows and hands them
 * here. Nothing is invented. An option nobody has bid on reports its asking price and says so; an
 * option with a bid reports the bid; a sold one reports what it sold for and names who bought it.
 * A price on an unsold option is never money and never counts toward anything.
 *
 * Category-neutral throughout. What the sponsor sent is "materials" or "logo" depending on the
 * category, and the caller supplies that word; nothing here writes one.
 */
import type { WorkRow } from "@/lib/dashboardModel";

/** What the row is waiting on, which is also what its badge says and what colour that badge is. */
export type OptionState =
  /** A sponsor sent their materials and the organizer has not answered. The only one that waits. */
  | "review"
  /** Sold and settled. */
  | "sold"
  /** Open to bids, and somebody has bid. The money is held on a card until it closes. */
  | "bids"
  /** Offered, and nothing has happened to it yet. */
  | "open";

export type OptionRow = {
  key: string;
  /** Every option collapsed into this row. One id on an ordinary row. */
  lotIds: string[];
  name: string;
  /** "Fixed" or "Bidding". */
  sale: string;
  /** Whether the option is sold by bidding, which is what makes "no bids" a fact about it. */
  bidding: boolean;
  state: OptionState;
  /** The amounts this row stands for, in cents, one per option collapsed into it. */
  amountsCents: number[];
  /** True when the amount is what the organizer is asking rather than what anybody has offered. */
  asking: boolean;
  /** The sponsor, where there is one. "Held until close" is the caller's word, not a name. */
  sponsor: string | null;
  /** The purchase to open, where this row is one settled sponsorship. */
  purchaseId: string | null;
};

export type OptionLot = {
  id: string;
  surface_key: string;
  label: string | null;
  price_cents: number;
  mode: string;
  status: string;
  buy_now_cents?: number | null;
};

const STATE_ORDER: Record<OptionState, number> = { review: 0, sold: 1, bids: 2, open: 3 };

/**
 * One row per sponsorship option, in the order the organizer should read them: what is waiting on
 * them first, then what sold, then what is being bid on, then what is still sitting there.
 */
export function optionRows(input: {
  lots: readonly OptionLot[];
  /** The templates, for an option the organizer never named. */
  templates: readonly { key: string; name: string }[];
  /** The top live bid on each option still open, by option id. */
  topBids: Readonly<Record<string, number>>;
  /** Purchases on this fundraiser, already shaped. Each carries the option it is against. */
  work: readonly WorkRow[];
}): OptionRow[] {
  const { lots, templates, topBids, work } = input;
  const byLot = new Map<string, WorkRow>();
  for (const row of work) if (row.lotId) byLot.set(row.lotId, row);

  return lots
    .map<OptionRow>((lot) => {
      const purchase = byLot.get(lot.id);
      const top = topBids[lot.id] ?? null;
      const bidding = lot.mode === "auction";
      const state: OptionState = purchase?.logo === "review" ? "review" : purchase ? "sold" : top ? "bids" : "open";
      const amount = purchase ? purchase.amountCents : (top ?? lot.price_cents);
      return {
        key: lot.id,
        lotIds: [lot.id],
        name: lot.label?.trim() || templates.find((t) => t.key === lot.surface_key)?.name || lot.surface_key,
        sale: bidding ? "Bidding" : "Fixed",
        bidding,
        state,
        amountsCents: [amount],
        // Only a bidding option can be asking: a fixed price is the price, not an opening number.
        asking: bidding && !purchase && top === null,
        sponsor: purchase?.sponsor ?? null,
        purchaseId: purchase?.id ?? null,
      };
    })
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

/**
 * Options in the same state, sold the same way and waiting on nobody, folded onto one row.
 *
 * Only past the point where the table stops being readable, and never a row somebody has to act
 * on: a sponsorship waiting for an answer keeps its own line however long the list is. The names
 * and the amounts are all kept, so nothing is hidden by folding them together.
 */
export function collapseOptions(rows: readonly OptionRow[], limit = 8): OptionRow[] {
  if (rows.length <= limit) return [...rows];

  const out: OptionRow[] = [];
  const groups = new Map<string, { row: OptionRow; names: string[] }>();
  for (const row of rows) {
    const foldable = (row.state === "open" || row.state === "bids") && !row.purchaseId;
    if (!foldable) {
      out.push(row);
      continue;
    }
    const key = `${row.state}:${row.sale}`;
    const seen = groups.get(key);
    if (!seen) {
      const fresh = { ...row, key, lotIds: [...row.lotIds], amountsCents: [...row.amountsCents] };
      groups.set(key, { row: fresh, names: [row.name] });
      out.push(fresh);
      continue;
    }
    seen.row.lotIds.push(...row.lotIds);
    seen.row.amountsCents.push(...row.amountsCents);
    seen.names.push(row.name);
    seen.row.name = joinNames(seen.names);
  }
  return out;
}

/** "Case spot 1, Case spot 2 and Picks". The list reads as a list, however long it gets. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
