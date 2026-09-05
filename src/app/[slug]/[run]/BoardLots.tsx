"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Eyebrow } from "@/components/Brand";
import { Countdown } from "@/components/Countdown";
import { LotCheckout } from "@/components/LotCheckout";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { BidForm } from "./BidForm";

export type LotView = {
  id: string;
  name: string;
  note: string;
  mode: "fixed" | "auction";
  sold: boolean;
  /** What it sold for, which is not always the top bid. */
  soldCents: number | null;
  /** Sold out of the bidding rather than taken at a set price. */
  wonAtAuction: boolean;
  /** Somebody is mid-checkout on this fixed-price spot, or a winning bidder is paying for this one. */
  pending: boolean;
  /** The auction closed and the winner has not paid yet. */
  awaitingFunding: boolean;
  /** Bidding on this lot is over. */
  closed: boolean;
  priceCents: number;
  bidCents: number | null;
  bidder: string | null;
  anonymous: boolean;
  /** The smallest bid the lot will take now. */
  minimumCents: number;
  /** Set while an auction lot can still be taken outright at this price. */
  buyNowCents: number | null;
  closesAt: string | null;
};

/** Initials for the little mark next to a bidder: "Kettle St. Coffee" becomes "KS". */
function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const MARK = {
  /** A patron holds the bid. */
  bid: "border-accent/70 text-accent-ink",
  /** Sold. */
  sold: "border-ink bg-ink text-ground",
  /** Nobody yet. */
  open: "border-dashed border-line text-muted",
} as const;

function Mark({ text, kind }: { text: string; kind: keyof typeof MARK }) {
  return (
    <span aria-hidden="true" className={`caps flex h-[26px] w-[26px] flex-none items-center justify-center border text-[14px] leading-none tracking-normal ${MARK[kind]}`}>
      {text}
    </span>
  );
}

/**
 * The board total and the lot list. Fixed-price spots check out here; auction lots take real bids
 * through the bid form. The board watches the bids table over Realtime, so a bid anyone places
 * shows up on every open board within a second.
 */
export function BoardLots({
  lots,
  closesAt,
  closesLabel,
  heading,
}: {
  lots: LotView[];
  closesAt: string | null;
  closesLabel: string;
  heading: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ id: string; kind: "take" | "bid" | "buyNow" } | null>(null);
  const [justBid, setJustBid] = useState<Set<string>>(new Set());

  // The lots this board watches, as one stable string. The array itself is a new object on every
  // render, so depending on it directly would tear the subscription down and build it again each time.
  const watchKey = lots
    .filter((l) => l.mode === "auction")
    .map((l) => l.id)
    .sort()
    .join(",");

  // Somebody bid, here or anywhere else. Re-read the board rather than patching it by hand, so the
  // patron's name and the totals come from the same place they always do.
  useEffect(() => {
    if (!watchKey) return;
    const sb = supabaseBrowser();
    // No Supabase, no live bids to watch: the board is rendering from the samples.
    if (!sb) return;
    const ids = new Set(watchKey.split(","));
    const channel = sb
      .channel("board-bids")
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, (payload) => {
        const row = (payload.new ?? payload.old) as { lot_id?: string } | null;
        if (row?.lot_id && ids.has(row.lot_id)) router.refresh();
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [watchKey, router]);

  const worth = lots.reduce((n, l) => n + (l.sold ? (l.bidCents ?? l.priceCents) : (l.bidCents ?? 0)), 0);

  return (
    <>
      <div className="lit mt-12 flex flex-wrap items-end justify-between gap-6 bg-panel px-8 py-7 max-md:px-6">
        <div>
          <b className="heading block text-[clamp(38px,6vw,64px)] leading-none">{formatMoney(worth)}</b>
          <span className="caps mt-2 block text-[14px] text-muted">in sold sponsorships and current bids</span>
        </div>
        <div className="md:text-right">
          {closesAt ? (
            <Countdown closesAt={closesAt} className="heading block text-[clamp(24px,3.4vw,36px)] leading-none" />
          ) : (
            <b className="heading block text-[clamp(24px,3.4vw,36px)] leading-none">Open</b>
          )}
          <span className="caps mt-2 block text-[14px] text-muted">{closesLabel}</span>
        </div>
      </div>

      <div className="pb-6 pt-[84px]">
        <Eyebrow className="mb-5">Sponsorship options</Eyebrow>
        <h2 className="heading mb-8 text-[clamp(30px,4.4vw,52px)] leading-[1.02]">{heading}</h2>
        <div className="grid gap-px bg-line">
          {lots.map((l, i) => {
            const auction = l.mode === "auction";
            const amount = l.sold ? (l.soldCents ?? l.bidCents ?? l.priceCents) : (l.bidCents ?? l.priceCents);
            const label = l.sold ? (l.wonAtAuction ? "won at" : "taken at") : !auction ? "fixed price" : l.bidCents ? "current bid" : "opening bid";
            const bidder = l.awaitingFunding ? "won, paying now" : l.pending && !l.sold ? "being taken right now" : (l.bidder ?? "open");
            const markKind = l.sold ? "sold" : l.bidder ? "bid" : "open";
            const markText = l.sold || l.bidder ? (l.anonymous ? "?" : initials(l.bidder ?? "Patron")) : "+";
            const canAct = !l.sold && !l.pending && !l.awaitingFunding && !(auction && l.closed);
            const button = auction ? `Bid ${formatMoney(l.minimumCents)}` : `Take this spot for ${formatMoney(l.priceCents)}`;
            const mine = justBid.has(l.id);
            return (
              <div key={l.id} data-reveal style={{ "--i": i } as CSSProperties} className="relative grid items-center gap-x-8 gap-y-3 bg-ground px-7 py-6 max-md:px-5 min-[681px]:grid-cols-[1fr_auto]">
                <div>
                  <div className={`heading text-[24px] leading-[1.1] ${l.sold ? "text-muted" : ""}`}>{l.name}</div>
                  <div className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.55] text-muted">{l.note}</div>
                  {auction && l.closesAt && !l.sold && !l.closed && (
                    <div className="caps mt-2 text-[14px] text-muted">
                      Closes in <Countdown closesAt={l.closesAt} className="text-accent-ink" />
                    </div>
                  )}
                </div>
                <div className="min-w-[200px] min-[681px]:text-right">
                  <div className="caps text-[14px] text-muted">{label}</div>
                  <div className={`heading mt-1 text-[30px] leading-none ${l.sold ? "text-muted" : "text-accent-ink"}`}>{formatMoney(amount)}</div>
                  <div className="mt-2 flex items-center gap-2 min-[681px]:justify-end">
                    <Mark text={markText} kind={markKind} />
                    <div className="caps text-[14px] text-muted">{bidder}</div>
                  </div>
                  {mine && <div className="caps mt-2 text-[14px] text-accent-ink">Bid placed</div>}
                  {canAct && (
                    <div className="mt-3 flex flex-wrap gap-2.5 min-[681px]:justify-end">
                      <button
                        type="button"
                        onClick={() => setOpen((cur) => (cur?.id === l.id && cur.kind !== "buyNow" ? null : { id: l.id, kind: auction ? "bid" : "take" }))}
                        aria-expanded={open?.id === l.id && open.kind !== "buyNow"}
                        className="caps cursor-pointer border border-accent bg-accent px-5 py-3 text-[14px] tracking-[0.16em] text-on-accent transition-colors hover:border-accent-ink hover:bg-accent-ink"
                      >
                        {button}
                      </button>
                      {auction && l.buyNowCents !== null && (
                        <button
                          type="button"
                          onClick={() => setOpen((cur) => (cur?.id === l.id && cur.kind === "buyNow" ? null : { id: l.id, kind: "buyNow" }))}
                          aria-expanded={open?.id === l.id && open.kind === "buyNow"}
                          className="caps cursor-pointer border border-accent px-5 py-3 text-[14px] tracking-[0.16em] text-accent-ink transition-colors hover:bg-accent hover:text-on-accent"
                        >
                          Take it now for {formatMoney(l.buyNowCents)}
                        </button>
                      )}
                    </div>
                  )}
                  {auction && l.closed && !l.sold && !l.awaitingFunding && <div className="caps mt-3 text-[14px] text-muted">Bidding closed</div>}
                </div>

                {open?.id === l.id && open.kind === "take" && (
                  <LotCheckout lotId={l.id} lotName={l.name.toLowerCase()} priceLabel={formatMoney(l.priceCents)} onClose={() => setOpen(null)} />
                )}
                {open?.id === l.id && open.kind === "buyNow" && l.buyNowCents !== null && (
                  <LotCheckout
                    lotId={l.id}
                    lotName={l.name.toLowerCase()}
                    priceLabel={formatMoney(l.buyNowCents)}
                    buyNow
                    note="Taking it now ends the bidding on this spot. Anyone who bid is told, and nothing is charged to them."
                    onClose={() => setOpen(null)}
                  />
                )}
                {open?.id === l.id && open.kind === "bid" && (
                  <BidForm
                    lotId={l.id}
                    lotName={l.name.toLowerCase()}
                    minimumCents={l.minimumCents}
                    onClose={() => setOpen(null)}
                    onDone={() => {
                      setOpen(null);
                      setJustBid((prev) => new Set(prev).add(l.id));
                      router.refresh();
                    }}
                  />
                )}
                {l.sold && <div className="caps absolute right-5 top-4 bg-accent px-2.5 py-1 text-[14px] text-on-accent min-[681px]:right-7 min-[681px]:top-6">Sold</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
