"use client";
import { useEffect, useRef, useState } from "react";

type Tier = { key: string; amountCents: number; title: string; blurb: string; label: string };

export function EmbedClient(p: {
  slug: string; actName: string; runTitle: string; showCount: number;
  backedLabel: string; goalLabel: string; progress: number; tiers: Tier[]; boardUrl: string;
}) {
  const [tier, setTier] = useState<Tier | "placement">(p.tiers[0]);
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Tell the host page how tall the widget is, so embed.js can size the iframe.
  // Measure the widget itself, not the document: the document fills whatever height the iframe already has.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const send = () => {
      const height = Math.ceil(el.getBoundingClientRect().height) + 16; // 8px of layout padding each side
      window.parent?.postMessage({ type: "doormoney:height", height }, "*");
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    return () => ro.disconnect();
  }, [done, tier]);

  const chosen = tier === "placement" ? null : tier;

  return (
    <div ref={root} className="hard-border mx-auto max-w-[380px] bg-white shadow-[6px_6px_0_var(--black)]">
      <div className="poster flex items-center justify-between border-b-[3px] border-ink bg-tape px-4 py-3 text-[17px]">
        <span>Back the {p.runTitle.toLowerCase()}</span>
        <span className="poster -rotate-3 border-2 border-ink bg-white px-2 py-0.5 text-[14px] tracking-[0.06em] text-red-deep">Door Money</span>
      </div>

      {done ? (
        <div className="px-4 py-7 text-center">
          <div className="typewriter mx-auto mb-3.5 flex h-[104px] w-[104px] -rotate-[8deg] items-center justify-center rounded-full border-[3px] border-red text-[14.5px] text-red-deep">BACKED</div>
          <p className="max-w-none text-[14.5px] leading-[1.6]"><b>{chosen?.label} to {p.actName}.</b><br />A receipt is on its way, and the name goes on the {chosen?.key === "merch_card" ? "merch table card" : "tour thank-you"} when the run wraps.</p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3.5">
            <b className="block text-[15px]">{p.actName}</b>
            <span className="typewriter text-[14px] text-gray">{p.showCount} shows.</span>
          </div>
          <div className="relative mx-4 mt-3 h-4 border-2 border-ink"><i className="absolute inset-y-0 left-0 bg-red" style={{ width: `${p.progress}%` }} /></div>
          <div className="typewriter flex justify-between px-4 pt-1.5 text-[14px] text-gray"><span>{p.backedLabel} backed</span><span>of {p.goalLabel}</span></div>

          <div className="grid gap-2 px-4 pt-3.5">
            {p.tiers.map((t) => (
              <button key={t.key} type="button" onClick={() => setTier(t)}
                className={`grid cursor-pointer grid-cols-[64px_1fr] items-center gap-3 border-2 border-ink px-3 py-2.5 text-left ${chosen?.key === t.key ? "bg-tape shadow-[3px_3px_0_var(--black)]" : "bg-white hover:bg-cream"}`}>
                <span className="poster text-[22px] leading-none">{t.label}</span>
                <span><b className="block text-[14.5px] leading-tight">{t.title}</b><span className="block text-[14px] leading-snug text-gray">{t.blurb}</span></span>
              </button>
            ))}
            <button type="button" onClick={() => setTier("placement")}
              className={`grid cursor-pointer grid-cols-[64px_1fr] items-center gap-3 border-2 border-ink px-3 py-2.5 text-left ${tier === "placement" ? "bg-tape shadow-[3px_3px_0_var(--black)]" : "bg-white hover:bg-cream"}`}>
              <span className="poster text-[22px] leading-none">$500<small className="typewriter block text-[14px] normal-case text-gray">and up</small></span>
              <span><b className="block text-[14.5px] leading-tight">Take a placement</b><span className="block text-[14px] leading-snug text-gray">Kick head, cases, straps, posts. Opens the act&apos;s board on Door Money.</span></span>
            </button>
          </div>

          {chosen && (
            <div className="grid gap-2 px-4 pt-3">
              <input className="hard-border w-full px-2.5 py-2 text-[15px]" placeholder="Name, as it should appear" aria-label="Name" />
              <input className="hard-border w-full px-2.5 py-2 text-[15px]" type="email" placeholder="Email" aria-label="Email" />
              {/* Phase 4: mount the Stripe Payment Element here. */}
              <div className="typewriter flex items-center gap-2 border-2 border-dashed border-ink bg-[#FAF8F3] px-2.5 py-2 text-[14px] text-gray">Card field, served by Door Money. Nothing typed here touches the host site.</div>
            </div>
          )}

          <button type="button"
            onClick={() => { if (tier === "placement") window.open(p.boardUrl, "_blank"); else setDone(true); }}
            className="poster mx-4 mt-3.5 w-[calc(100%-32px)] cursor-pointer border-[3px] border-ink bg-red-deep px-3 py-3 text-[18px] tracking-[0.03em] text-white shadow-[4px_4px_0_var(--black)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_var(--black)]">
            {tier === "placement" ? "Open the board" : `Back for ${chosen?.label}`}
          </button>
          <p className="typewriter max-w-none px-4 pb-3.5 pt-3 text-[14px] leading-[1.6] text-gray">Door Money holds the money and pays the act weekly through the run. Refunded in full if the run is cancelled.</p>
        </>
      )}
    </div>
  );
}
