import { SALE_METHOD_LABEL } from "@/lib/category-words";
import type { OpportunityView } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import type { ReactNode } from "react";

/**
 * One sponsorship option an organizer chose to offer, at the organizer's own price.
 *
 * It shows a price and never takes a payment: whatever starts a checkout or a bid is handed in as
 * `action`, so this card holds no payment logic and works the same in every category. It says
 * what is offered and nothing more. A benefit the organizer did not choose is not on it.
 */
export function OpportunityCard({ opportunity, action }: { opportunity: OpportunityView; action?: ReactNode }) {
  const o = opportunity;
  const open = o.status === "open";
  const bidding = o.saleMethod === "auction";
  return (
    <article data-status={o.status} className="edge grid gap-3 bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="heading text-[20px] leading-[1.15]">{o.name}</h3>
        <span className="caps text-[14px] text-muted">{SALE_METHOD_LABEL[o.saleMethod]}</span>
      </div>
      {o.description && <p className="max-w-[58ch] text-[15px] leading-[1.6]">{o.description}</p>}
      {o.seenBy && <p className="text-[14.5px] text-muted">Seen by {o.seenBy}.</p>}
      <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <b className="display text-[28px] leading-none">{formatMoney(bidding && o.topBidCents ? o.topBidCents : o.priceCents)}</b>
        <span className="caps text-[14px] text-muted">
          {o.status === "sold" ? (o.soldTo ? `Taken by ${o.soldTo}` : "Taken") : bidding ? (o.topBidCents ? "Top bid" : "Bidding starts here") : "Price"}
        </span>
        {open && bidding && o.buyNowCents ? <span className="caps text-[14px] text-muted">Or {formatMoney(o.buyNowCents)} to take it now</span> : null}
      </p>
      {open && action ? <div className="mt-1">{action}</div> : null}
    </article>
  );
}
