"use client";
import { useActionState, useState, useTransition } from "react";
import { saveLots, type LotsState } from "@/app/actions/lots";
import { publishRun, unpublishRun } from "@/app/actions/run";
import { Button } from "@/components/Button";
import { GROUPS, type Surface, type SurfaceGroup } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";

export type ExistingLot = { id: string; surface_key: string; label: string | null; price_cents: number; mode: "fixed" | "auction"; status: string };

type RowState = { on: boolean; count: string; price: string; mode: "fixed" | "auction" };

const initial: LotsState = { ok: false };
const dollars = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);

/**
 * The standard card for this act type, each surface a row: on or off, how many spots,
 * the price, fixed or auction. Prices start at the card default; the act's number wins.
 */
export function LotsEditor({
  runId,
  runStatus,
  surfaces,
  lots,
  boardHref,
}: {
  runId: string;
  runStatus: string;
  surfaces: Surface[];
  lots: ExistingLot[];
  boardHref: string;
}) {
  const [state, action, pending] = useActionState(saveLots, initial);
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const r: Record<string, RowState> = {};
    for (const s of surfaces) {
      const mine = lots.filter((l) => l.surface_key === s.key);
      r[s.key] = mine.length
        ? { on: true, count: String(mine.length), price: dollars(mine[0].price_cents), mode: mine[0].mode }
        : { on: false, count: "1", price: dollars(s.defaultPriceCents), mode: "fixed" };
    }
    return r;
  });
  const set = (key: string, patch: Partial<RowState>) => setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const lockedKeys = new Set(lots.filter((l) => l.status !== "open").map((l) => l.surface_key));

  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();
  const onCount = Object.values(rows).filter((r) => r.on).length;

  const groups = (Object.keys(GROUPS) as SurfaceGroup[]).map((g) => ({ g, items: surfaces.filter((s) => s.group === g) })).filter((x) => x.items.length);

  return (
    <>
      <form action={action} noValidate>
        <input type="hidden" name="run_id" value={runId} />
        {groups.map(({ g, items }) => (
          <div key={g} className="mb-8">
            <p className="caps mb-1 text-[15px] text-accent-ink">{GROUPS[g].eyebrow}</p>
            <p className="mb-3 max-w-none text-[15px] text-muted">{GROUPS[g].heading}</p>
            <div className="edge bg-panel">
              {items.map((s) => {
                const r = rows[s.key];
                const locked = lockedKeys.has(s.key);
                return (
                  <div key={s.key} className={`grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[28px_1fr_90px_140px_150px] md:items-center ${r.on ? "" : "opacity-80"}`}>
                    <input
                      type="checkbox"
                      name={`on_${s.key}`}
                      value="1"
                      checked={r.on}
                      disabled={locked}
                      onChange={(e) => set(s.key, { on: e.target.checked })}
                      aria-label={s.name}
                      className="h-5 w-5 accent-[var(--accent)]"
                    />
                    {locked && <input type="hidden" name={`on_${s.key}`} value="1" />}
                    <div>
                      <b className="block text-[15px]">{s.name}</b>
                      <span className="block text-[14px] text-muted">
                        Card price {formatMoney(s.defaultPriceCents)} per {s.period}. Seen by {s.seenBy}.
                      </span>
                    </div>
                    <label className="caps text-[14px]">
                      Spots
                      <input
                        type="number"
                        name={`count_${s.key}`}
                        min={1}
                        max={6}
                        value={r.count}
                        disabled={!r.on}
                        onChange={(e) => set(s.key, { count: e.target.value.replace(/[^0-9]/g, "").slice(0, 1) })}
                        onBlur={() => set(s.key, { count: String(Math.max(1, Math.min(6, Number(r.count) || 1))) })}
                        className="edge mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
                      />
                    </label>
                    <label className="caps text-[14px]">
                      Price, dollars
                      <input
                        name={`price_${s.key}`}
                        inputMode="decimal"
                        value={r.price}
                        disabled={!r.on}
                        onChange={(e) => set(s.key, { price: e.target.value })}
                        className="edge mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
                      />
                    </label>
                    <label className="caps text-[14px]">
                      Sold as
                      <select
                        name={`mode_${s.key}`}
                        value={r.mode}
                        disabled={!r.on}
                        onChange={(e) => set(s.key, { mode: e.target.value as "fixed" | "auction" })}
                        className="edge mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
                      >
                        <option value="fixed">Fixed price</option>
                        <option value="auction">Auction, price is the reserve</option>
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save the spots"}</Button>
          {state.ok && <span className="text-[14.5px] text-muted">Saved {state.saved} {state.saved === 1 ? "spot" : "spots"}.</span>}
          {state.error && <span className="text-[14.5px] text-accent-ink">{state.error}</span>}
        </div>
      </form>

      <div className="mt-10 border-t border-line pt-6">
        {runStatus === "draft" ? (
          <>
            <p className="mb-4 max-w-[56ch] text-[15px]">
              The board is private until it is published. Publishing puts it at the board address and on the live boards page. Save the spots first.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                disabled={publishing || onCount === 0}
                onClick={() =>
                  startPublish(async () => {
                    setPublishError(null);
                    const r = await publishRun(runId);
                    if (!r.ok) setPublishError(r.error ?? "That did not publish.");
                  })
                }
              >
                {publishing ? "Publishing" : "Publish the board"}
              </Button>
              {publishError && <span className="text-[14.5px] text-accent-ink">{publishError}</span>}
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 max-w-[56ch] text-[15px]">
              The board is live at <a href={boardHref} className="break-all text-accent-ink underline decoration-1 underline-offset-4">{boardHref}</a>. Prices on open spots can still change here.
            </p>
            {runStatus === "open" && (
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={publishing}
                  onClick={() =>
                    startPublish(async () => {
                      setPublishError(null);
                      const r = await unpublishRun(runId);
                      if (!r.ok) setPublishError(r.error ?? "That did not save.");
                    })
                  }
                >
                  Take the board down
                </Button>
                {publishError && <span className="text-[14.5px] text-accent-ink">{publishError}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
