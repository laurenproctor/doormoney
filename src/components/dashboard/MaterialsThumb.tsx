import { formatDay } from "@/lib/dates";
import type { WorkRow } from "@/lib/dashboardModel";
import { formatMoney } from "@/lib/money";

/**
 * What one sponsor sent, at the head of the row that decides on it.
 *
 * The same block on Today and on the fundraiser's own page, because it is the same decision in
 * both places. What was sent is drawn where there is a file, and the shape of what is missing
 * where there is not: nothing is invented to fill the space.
 */
export function MaterialsThumb({ row, word }: { row: WorkRow; word: string }) {
  if (row.markUrl) {
    /* A plain image: the address is whatever the marks bucket holds, and the optimizer only fetches
       what it has been told about. It is decoration, and the row says whose it is in words. */
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={row.markUrl} alt="" className="h-10 w-16 rounded-[4px] border border-line bg-neutral-wash object-contain p-0.5" />;
  }
  return (
    <span className="flex h-10 w-16 items-center justify-center rounded-[4px] border border-dashed border-field-line text-[14px] text-muted">
      {row.markText ? "Name" : word}
    </span>
  );
}

/** Who sent it, what they paid, when it arrived, and where the offer says it goes. */
export function materialsDetail(row: WorkRow): string {
  return [
    row.sponsor,
    formatMoney(row.amountCents),
    row.submittedAt ? `sent ${formatDay(row.submittedAt.slice(0, 10))}` : null,
    row.placement,
  ]
    .filter(Boolean)
    .join(" · ");
}
