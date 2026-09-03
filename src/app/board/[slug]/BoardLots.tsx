"use client";
import { useState, type CSSProperties } from "react";
import { Eyebrow } from "@/components/Brand";
import { Countdown } from "@/components/Countdown";
import { LotCheckout } from "@/components/LotCheckout";
import { formatMoney } from "@/lib/money";

export type LotView = {
  id: string;
  name: string;
  note: string;
  mode: "fixed" | "auction";
  sold: boolean;
  /** Somebody is mid-checkout on this lot. */
  pending: boolean;
  priceCents: number;
  bidCents: number | null;
  bidder: string | null;
  anonymous: boolean;
  stepCents: number;
};

type Live = { bidCents: number | null; bidder: string | null; mine: boolean; sold: boolean };

/** Initials for the little mark next to a bidder: "Kettle St. Coffee" becomes "KS". */
function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const MARK = {
  /** Another patron holds the bid. */
  bid: "border-accent/70 text-accent-ink",
  /** This patron holds the bid. */
  mine: "rounded-full border-accent bg-accent text-on-accent",
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
 * The board total and the lot list. Fixed-price spots check out for real through LotCheckout.
 * Until Phase 5 ships real bidding, pressing a bid button raises the bid locally, as the mockup
 * does, so the board total responds.
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
  const [taking, setTaking] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, Live>>(() =>
    Object.fromEntries(lots.map((l) => [l.id, { bidCents: l.bidCents, bidder: l.bidder, mine: false, sold: l.sold }])),
  );

  const worth = lots.reduce((n, l) => {
    const v = live[l.id];
    return n + (v.sold ? (v.bidCents ?? l.priceCents) : (v.bidCents ?? 0));
  }, 0);

  const press = (l: LotView) => {
    if (l.mode === "fixed") {
      setTaking((cur) => (cur === l.id ? null : l.id));
      return;
    }
    setLive((prev) => {
      const v = prev[l.id];
      const next = (v.bidCents ?? l.priceCents - l.stepCents) + l.stepCents;
      return { ...prev, [l.id]: { ...v, bidCents: next, bidder: "This patron", mine: true } };
    });
  };

  return (
    <>
      <div className="lit mt-12 flex flex-wrap items-end justify-between gap-6 bg-panel px-8 py-7 max-md:px-6">
        <div>
          <b className="heading block text-[clamp(38px,6vw,64px)] leading-none">{formatMoney(worth)}</b>
          <span className="caps mt-2 block text-[14px] text-muted">in sold placements and current bids</span>
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
        <Eyebrow className="mb-5">The placements</Eyebrow>
        <h2 className="heading mb-8 text-[clamp(30px,4.4vw,52px)] leading-[1.02]">{heading}</h2>
        <div className="grid gap-px bg-line">
          {lots.map((l, i) => {
            const v = live[l.id];
            const sold = v.sold;
            const amount = sold || l.mode === "fixed" ? (v.bidCents ?? l.priceCents) : (v.bidCents ?? l.priceCents);
            const label = sold ? "won at" : l.mode === "fixed" ? "fixed price" : v.bidCents ? "current bid" : "opening bid";
            const bidder = l.pending && !sold ? "being taken right now" : (v.bidder ?? "open");
            const markKind = v.mine ? "mine" : sold ? "sold" : v.bidder && !l.anonymous ? "bid" : "open";
            const markText = v.mine ? "TP" : l.anonymous ? "?" : v.bidder ? initials(v.bidder) : "+";
            const button = l.mode === "fixed" ? `Take this spot for ${formatMoney(l.priceCents)}` : `Bid ${formatMoney((v.bidCents ?? l.priceCents - l.stepCents) + l.stepCents)}`;
            return (
              <div
                key={l.id}
                data-reveal
                style={{ "--i": i } as CSSProperties}
                className={`relative grid items-center gap-x-8 gap-y-3 px-7 py-6 max-md:px-5 min-[681px]:grid-cols-[1fr_auto] ${sold ? "bg-ground" : "bg-ground"}`}
              >
                <div>
                  <div className={`heading text-[24px] leading-[1.1] ${sold ? "text-muted" : ""}`}>{l.name}</div>
                  <div className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.55] text-muted">{l.note}</div>
                </div>
                <div className="min-w-[200px] min-[681px]:text-right">
                  <div className="caps text-[14px] text-muted">{label}</div>
                  <div className={`heading mt-1 text-[30px] leading-none ${sold ? "text-muted" : "text-accent-ink"}`}>{formatMoney(amount)}</div>
                  <div className="mt-2 flex items-center gap-2 min-[681px]:justify-end">
                    <Mark text={markText} kind={markKind} />
                    <div className="caps text-[14px] text-muted">{bidder}</div>
                  </div>
                  {!sold && !l.pending && (
                    <button
                      type="button"
                      onClick={() => press(l)}
                      aria-expanded={l.mode === "fixed" ? taking === l.id : undefined}
                      className="caps mt-3 cursor-pointer border border-accent bg-accent px-5 py-3 text-[14px] tracking-[0.16em] text-on-accent transition-colors hover:border-accent-ink hover:bg-accent-ink"
                    >
                      {button}
                    </button>
                  )}
                </div>
                {taking === l.id && !sold && (
                  <LotCheckout lotId={l.id} lotName={l.name.toLowerCase()} priceLabel={formatMoney(l.priceCents)} onClose={() => setTaking(null)} />
                )}
                {sold && (
                  <div className="caps absolute right-5 top-4 bg-accent px-2.5 py-1 text-[14px] text-on-accent min-[681px]:right-7 min-[681px]:top-6">
                    Sold
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
