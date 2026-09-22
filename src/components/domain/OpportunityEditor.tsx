"use client";
import type { OpportunityDraft, OpportunityTemplateView } from "@/lib/domain";
import { formatMoney } from "@/lib/money";

/**
 * One template row in the organizer's editor: offered or not, how many, the price, and how it is
 * sold. Controlled, with no state of its own and no server call: the form around it decides what
 * saving means. Field names are `on_`, `count_`, `price_`, `mode_`, `buynow_`, `reach_` and
 * `reachbasis_` plus the template key, which is what the save action reads.
 *
 * A price box starts at the suggestion where there is one and empty where there is not, and the
 * organizer's number is the price either way.
 *
 * The expected reach is the organizer's estimate and is optional. A number cannot be saved without
 * the reason for it: the product contract says an estimate states its basis, and the database
 * refuses one that does not (migration 0053). Who a placement reaches is a separate fact and is not
 * asked here at all, because it belongs to the placement rather than to one organizer.
 */
export function OpportunityEditor({
  template,
  value,
  locked = false,
  onChange,
}: {
  template: OpportunityTemplateView;
  value: OpportunityDraft;
  /** True once a spot on this template has sold or is being paid for: it can no longer be switched off. */
  locked?: boolean;
  onChange: (patch: Partial<OpportunityDraft>) => void;
}) {
  const t = template;
  const r = value;
  return (
   <div className={`border-b border-line p-4 last:border-b-0 ${r.on ? "" : "opacity-80"}`}>
    <div className="grid gap-3 md:grid-cols-[28px_1fr_80px_120px_150px_130px] md:items-center">
      <input type="checkbox" name={`on_${t.key}`} value="1" checked={r.on} disabled={locked} onChange={(e) => onChange({ on: e.target.checked })} aria-label={t.name} className="h-5 w-5 accent-[var(--accent)]" />
      {locked && <input type="hidden" name={`on_${t.key}`} value="1" />}
      <div>
        <b className="block text-[15px]">{t.name}</b>
        <span className="block text-[14px] text-muted">
          {t.suggestedPriceCents !== null && <>Suggested price {formatMoney(t.suggestedPriceCents)}{t.period ? ` per ${t.period}` : ""}. </>}
          {t.seenBy && <>Seen by {t.seenBy}.</>}
        </span>
        {t.kindLabels && t.kindLabels.length > 0 && <span className="mt-1 block text-[14px] text-accent-ink">{t.kindLabels.join(", ")}.</span>}
        {t.kindNote && <span className="mt-1 block text-[14px] text-muted">{t.kindNote}</span>}
      </div>
      <label className="caps text-[14px]">
        Spots
        <input
          type="number"
          name={`count_${t.key}`}
          min={1}
          max={6}
          value={r.count}
          disabled={!r.on}
          onChange={(e) => onChange({ count: e.target.value.replace(/[^0-9]/g, "").slice(0, 1) })}
          onBlur={() => onChange({ count: String(Math.max(1, Math.min(6, Number(r.count) || 1))) })}
          className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
        />
      </label>
      <label className="caps text-[14px]">
        Price, dollars
        <input name={`price_${t.key}`} inputMode="decimal" value={r.price} disabled={!r.on} onChange={(e) => onChange({ price: e.target.value })} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
      </label>
      <label className="caps text-[14px]">
        Sold as
        <select name={`mode_${t.key}`} value={r.saleMethod} disabled={!r.on} onChange={(e) => onChange({ saleMethod: e.target.value === "auction" ? "auction" : "fixed" })} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]">
          <option value="fixed">Fixed price</option>
          <option value="auction">Auction, price is the reserve</option>
        </select>
      </label>
      <label className={`caps text-[14px] ${r.saleMethod === "auction" ? "" : "max-md:hidden md:invisible"}`}>
        Take it now
        <input name={`buynow_${t.key}`} inputMode="decimal" value={r.buyNow} placeholder="Optional" disabled={!r.on || r.saleMethod !== "auction"} onChange={(e) => onChange({ buyNow: e.target.value })} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
      </label>
    </div>
    {r.on && (
      <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-[180px_1fr]">
        <label className="caps text-[14px]">
          People reached
          <input
            name={`reach_${t.key}`}
            inputMode="numeric"
            value={r.reach}
            placeholder="Optional"
            onChange={(e) => onChange({ reach: e.target.value.replace(/[^0-9]/g, "") })}
            className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
          />
        </label>
        <label className="caps text-[14px]">
          How do you know?
          <input
            name={`reachbasis_${t.key}`}
            value={r.reachBasis}
            placeholder={r.reach ? "Average attendance over the last six" : "Only needed if you give a number"}
            onChange={(e) => onChange({ reachBasis: e.target.value })}
            className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
          />
          <span className="mt-1 block text-[14px] normal-case tracking-normal text-muted">
            An estimate, not a promise. Say where the number comes from and a sponsor can judge it.
          </span>
        </label>
      </div>
    )}
   </div>
  );
}
