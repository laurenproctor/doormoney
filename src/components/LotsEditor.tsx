"use client";
import { useActionState, useState, useTransition } from "react";
import { saveLots, type LotsState } from "@/app/actions/lots";
import { cancelRun, publishRun, unpublishRun } from "@/app/actions/run";
import { Button } from "@/components/Button";
import { OpportunityEditor } from "@/components/domain";
import type { OpportunityDraft } from "@/lib/domain";
import { templateSections, type OpportunityTemplate } from "@/lib/opportunities";
import { formatMoney } from "@/lib/money";
import { IN_KIND_NOTE, hasInKind, sponsorshipKindLabels } from "@/lib/sponsorship-kinds";

export type ExistingLot = { id: string; surface_key: string; label: string | null; price_cents: number; mode: "fixed" | "auction"; status: string; buy_now_cents: number | null; reach_estimate: number | null; reach_basis: string | null };

type RowState = { on: boolean; count: string; price: string; mode: "fixed" | "auction"; buyNow: string; reach: string; reachBasis: string };

const initial: LotsState = { ok: false };
const dollars = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);

/**
 * The templates this fundraiser's category offers, each one a row: on or off, how many spots, the
 * price, fixed price or bidding. A row that is off is not offered and appears nowhere public. A
 * price box starts at the suggested price where there is one and empty where there is not; the
 * organizer's number is the price either way.
 * A bidding spot can also carry a take-it-now price, which ends the bidding when someone pays it.
 */
export function LotsEditor({
  runId,
  runStatus,
  surfaces,
  lots,
  boardHref,
  publishable = true,
}: {
  runId: string;
  runStatus: string;
  surfaces: OpportunityTemplate[];
  lots: ExistingLot[];
  boardHref: string;
  /**
   * False where the registry has not opened the category for publishing. The button is then not
   * offered. This is a courtesy: publishRun and the database both refuse whatever is drawn here.
   */
  publishable?: boolean;
}) {
  const [state, action, pending] = useActionState(saveLots, initial);
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const r: Record<string, RowState> = {};
    for (const s of surfaces) {
      const mine = lots.filter((l) => l.surface_key === s.key);
      r[s.key] = mine.length
        ? {
            on: true, count: String(mine.length), price: dollars(mine[0].price_cents), mode: mine[0].mode,
            buyNow: mine[0].buy_now_cents ? dollars(mine[0].buy_now_cents) : "",
            reach: mine[0].reach_estimate === null ? "" : String(mine[0].reach_estimate),
            reachBasis: mine[0].reach_basis ?? "",
          }
        : { on: false, count: "1", price: s.defaultPriceCents === null ? "" : dollars(s.defaultPriceCents), mode: "fixed", buyNow: "", reach: "", reachBasis: "" };
    }
    return r;
  });
  const set = (key: string, patch: Partial<RowState>) => setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const lockedKeys = new Set(lots.filter((l) => l.status !== "open").map((l) => l.surface_key));

  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelled, setCancelled] = useState<{ refundedCents: number; patrons: number } | null>(null);
  const [publishing, startPublish] = useTransition();
  const onCount = Object.values(rows).filter((r) => r.on).length;

  // Sections come from the templates themselves, so a category this build has no words for still
  // draws one, under its own name.
  const groups = templateSections(surfaces);

  return (
    <>
      <form action={action} noValidate>
        <input type="hidden" name="run_id" value={runId} />
        {groups.map(({ group: g, eyebrow, heading, items }) => (
          <div key={g} className="mb-8">
            <p className={`caps text-[15px] text-accent-ink ${heading ? "mb-1" : "mb-3"}`}>{eyebrow}</p>
            {heading && <p className="mb-3 max-w-none text-[15px] text-muted">{heading}</p>}
            <div className="edge bg-panel">
              {items.map((s) => {
                const r = rows[s.key];
                const locked = lockedKeys.has(s.key);
                // The row is the domain component: it knows a template and a draft, and nothing about
                // music, the catalog or saving. This file stays the adapter between them.
                const draft: OpportunityDraft = { on: r.on, count: r.count, price: r.price, saleMethod: r.mode, buyNow: r.buyNow, reach: r.reach, reachBasis: r.reachBasis };
                return (
                  <OpportunityEditor
                    key={s.key}
                    template={{ key: s.key, name: s.name, seenBy: s.seenBy, suggestedPriceCents: s.defaultPriceCents, period: s.period, kindLabels: sponsorshipKindLabels(s.kinds), kindNote: hasInKind(s.kinds) ? IN_KIND_NOTE : null }}
                    value={draft}
                    locked={locked}
                    onChange={(patch) => {
                      const { saleMethod, ...rest } = patch;
                      set(s.key, saleMethod ? { ...rest, mode: saleMethod } : rest);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save the sponsorship options"}</Button>
          {state.ok && <span className="text-[14.5px] text-muted">Saved {state.saved} {state.saved === 1 ? "sponsorship option" : "sponsorship options"}.</span>}
          {state.error && <span className="text-[14.5px] text-accent-ink">{state.error}</span>}
        </div>
      </form>

      <div className="mt-10 border-t border-line pt-6">
        {runStatus === "draft" && !publishable ? (
          <p className="max-w-[56ch] text-[15px]">
            This fundraiser is a private draft, and it stays one. Door Money has not opened this category for publishing or payments yet, so nobody else can see it and nothing on it can be bought. Your sponsorship options and prices are saved for when it opens.
          </p>
        ) : runStatus === "draft" ? (
          <>
            <p className="mb-4 max-w-[56ch] text-[15px]">
              The fundraiser is private until it is published. Publishing puts it at its own address and on the fundraisers page. Save the sponsorship options first.
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
                {publishing ? "Publishing" : "Publish the fundraiser"}
              </Button>
              {publishError && <span className="text-[14.5px] text-accent-ink">{publishError}</span>}
            </div>
          </>
        ) : runStatus === "cancelled" || cancelled ? (
          <p className="max-w-[56ch] text-[15px]">
            This fundraiser is cancelled. Its sponsorship options are off the page
            {cancelled && cancelled.patrons > 0 ? `, and ${formatMoney(cancelled.refundedCents)} went back to ${cancelled.patrons === 1 ? "one patron" : `${cancelled.patrons} patrons`}` : ""}.
          </p>
        ) : runStatus === "closed" ? (
          <p className="max-w-[56ch] text-[15px]">This fundraiser is over. Patrons have their records, and the page is down.</p>
        ) : (
          <>
            <p className="mb-4 max-w-[56ch] text-[15px]">
              The fundraiser is live at <a href={boardHref} className="break-all text-accent-ink underline decoration-1 underline-offset-4">{boardHref}</a>. Prices on open sponsorship options can still change here.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {runStatus === "open" && (
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
                  Take the fundraiser down
                </Button>
              )}
              {!confirmCancel && (
                <button type="button" onClick={() => setConfirmCancel(true)} className="caps cursor-pointer text-[14px] text-muted hover:text-accent-ink">
                  Cancel the fundraiser
                </button>
              )}
              {publishError && <span className="text-[14.5px] text-accent-ink">{publishError}</span>}
            </div>
            {confirmCancel && (
              <div className="edge mt-5 max-w-[620px] bg-panel p-5">
                <p className="max-w-none text-[15px]">
                  Cancelling takes every sponsorship option off the page and refunds each patron the share not yet released, fee included. Anything already released stays released. This cannot be undone.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Button
                    type="button"
                    disabled={publishing}
                    onClick={() =>
                      startPublish(async () => {
                        setPublishError(null);
                        const r = await cancelRun(runId);
                        if (!r.ok) setPublishError(r.error ?? "That did not go through.");
                        else {
                          setCancelled({ refundedCents: r.refundedCents ?? 0, patrons: r.patrons ?? 0 });
                          if (r.error) setPublishError(r.error);
                        }
                      })
                    }
                  >
                    {publishing ? "Cancelling" : "Yes, cancel the fundraiser"}
                  </Button>
                  <button type="button" onClick={() => setConfirmCancel(false)} className="caps cursor-pointer text-[14px] text-muted hover:text-ink">
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
