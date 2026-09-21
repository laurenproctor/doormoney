"use client";
import type { OpportunityDraft, OpportunityTemplateView } from "@/lib/domain";
import { formatMoney } from "@/lib/money";

/**
 * One template row in the organizer's editor: offered or not, how many, the price, and how it is
 * sold. Controlled, with no state of its own and no server call: the form around it decides what
 * saving means. Field names are `on_`, `count_`, `price_`, `mode_` and `buynow_` plus the template
 * key, which is what the save action has always read.
 *
 * A price box starts at the suggestion where there is one and empty where there is not, and the
 * organizer's number is the price either way.
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
    <div className={`grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[28px_1fr_80px_120px_150px_130px] md:items-center ${r.on ? "" : "opacity-80"}`}>
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
  );
}
