"use client";
import { useState } from "react";
import { Countdown } from "@/components/Countdown";
import { formatMoney } from "@/lib/money";

export type LotView = {
  id: string;
  name: string;
  note: string;
  mode: "fixed" | "auction";
  sold: boolean;
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
  tape: "-rotate-3 bg-tape text-ink",
  red: "rounded-full bg-red-deep text-white",
  black: "-rotate-3 bg-ink text-paper",
  open: "-rotate-3 border-dashed bg-white text-gray",
} as const;

function Mark({ text, kind }: { text: string; kind: keyof typeof MARK }) {
  return (
    <span aria-hidden="true" className={`poster flex h-[26px] w-[26px] flex-none items-center justify-center border-2 border-ink text-[14px] leading-none tracking-[0.02em] ${MARK[kind]}`}>
      {text}
    </span>
  );
}

/**
 * The black board box and the lot list. Until Phase 5 ships real bidding, pressing a button
 * raises the bid locally, as the mockup does, so the board total responds.
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
  const [live, setLive] = useState<Record<string, Live>>(() =>
    Object.fromEntries(lots.map((l) => [l.id, { bidCents: l.bidCents, bidder: l.bidder, mine: false, sold: l.sold }])),
  );

  const worth = lots.reduce((n, l) => {
    const v = live[l.id];
    return n + (v.sold ? (v.bidCents ?? l.priceCents) : (v.bidCents ?? 0));
  }, 0);

  const press = (l: LotView) => {
    setLive((prev) => {
      const v = prev[l.id];
      if (l.mode === "fixed") return { ...prev, [l.id]: { bidCents: l.priceCents, bidder: "This patron", mine: true, sold: true } };
      const next = (v.bidCents ?? l.priceCents - l.stepCents) + l.stepCents;
      return { ...prev, [l.id]: { ...v, bidCents: next, bidder: "This patron", mine: true } };
    });
  };

  return (
    <>
      <div className="hard-border mb-2.5 mt-9 flex flex-wrap items-center justify-between gap-5 bg-ink px-7 py-[26px] text-paper shadow-[8px_8px_0_var(--red)]">
        <div>
          <b className="poster block text-[clamp(34px,5.4vw,54px)] leading-none">{formatMoney(worth)}</b>
          <span className="typewriter text-[14.5px] text-[#9B968A]">what the board is worth right now</span>
        </div>
        <div className="text-right">
          {closesAt ? (
            <Countdown closesAt={closesAt} className="typewriter block text-[clamp(18px,2.8vw,24px)]" />
          ) : (
            <b className="typewriter block text-[clamp(18px,2.8vw,24px)]">Open</b>
          )}
          <span className="typewriter text-[14px] text-[#9B968A]">{closesLabel}</span>
        </div>
      </div>

      <div className="pb-5 pt-[94px]">
        <p className="typewriter mb-3 text-[15px] text-red-deep">The spots</p>
        <h2 className="poster mb-6 text-[clamp(28px,4vw,44px)] leading-none">{heading}</h2>
        {lots.map((l) => {
          const v = live[l.id];
          const sold = v.sold;
          const amount = sold || l.mode === "fixed" ? (v.bidCents ?? l.priceCents) : (v.bidCents ?? l.priceCents);
          const label = sold ? "won at" : l.mode === "fixed" ? "buy now" : v.bidCents ? "current bid" : "opening bid";
          const bidder = v.bidder ?? "open";
          const markKind = v.mine ? "red" : sold ? "black" : v.bidder && !l.anonymous ? "tape" : "open";
          const markText = v.mine ? "TP" : l.anonymous ? "?" : v.bidder ? initials(v.bidder) : "+";
          const button = l.mode === "fixed" ? "Take it" : `Bid ${formatMoney((v.bidCents ?? l.priceCents - l.stepCents) + l.stepCents)}`;
          return (
            <div
              key={l.id}
              className={`hard-border relative mb-[22px] grid items-center gap-x-5 gap-y-2 px-[22px] py-5 shadow-[6px_6px_0_var(--black)] min-[681px]:grid-cols-[1fr_auto] ${
                sold ? "bg-[#F6F1E4]" : "bg-white"
              }`}
            >
              <div>
                <div className="poster text-[22px] leading-[1.05]">{l.name}</div>
                <div className="typewriter mt-1 text-[14px] text-gray">{l.note}</div>
              </div>
              <div className="min-w-[190px] min-[681px]:text-right">
                <div className="typewriter text-[14.5px] text-gray">{label}</div>
                <div className={`poster text-[28px] leading-none ${sold ? "text-gray" : ""}`}>{formatMoney(amount)}</div>
                <div className="flex items-center gap-[7px] min-[681px]:justify-end">
                  <Mark text={markText} kind={markKind} />
                  <div className="typewriter text-[14px] text-gray">{bidder}</div>
                </div>
                {!sold && (
                  <button
                    type="button"
                    onClick={() => press(l)}
                    className="poster mt-2 cursor-pointer border-[3px] border-ink bg-red-deep px-[18px] py-[9px] text-[15px] tracking-[0.03em] text-white shadow-[4px_4px_0_var(--black)] transition-[transform,box-shadow] duration-[80ms] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_var(--black)]"
                  >
                    {button}
                  </button>
                )}
              </div>
              {sold && (
                <div className="typewriter absolute -top-3.5 right-4 -rotate-[9deg] border-[3px] border-red bg-cream px-3 py-[3px] text-[15px] text-red-deep shadow-[2px_2px_0_rgba(0,0,0,0.2)]">
                  SOLD
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
