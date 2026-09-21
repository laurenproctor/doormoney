import { FUNDRAISER_STATUS_LABEL } from "@/lib/category-words";
import type { FundraiserStatusKey } from "@/lib/domain";

/** Open, under way, closed or cancelled, said in words. The state is never carried by color alone. */
export function FundraiserStatus({ status, className = "" }: { status: FundraiserStatusKey; className?: string }) {
  const live = status === "open" || status === "live";
  return (
    <span data-status={status} className={`caps text-[14px] ${live ? "text-accent-ink" : "text-muted"} ${className}`}>
      {FUNDRAISER_STATUS_LABEL[status] ?? status}
    </span>
  );
}
