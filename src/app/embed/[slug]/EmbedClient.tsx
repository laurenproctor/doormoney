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
  const tierClass = (on: boolean) =>
    `grid cursor-pointer grid-cols-[72px_1fr] items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
      on ? "border-accent bg-accent/10" : "border-line bg-transparent hover:border-ink/50"
    }`;

  return (
    <div ref={root} className="lit mx-auto max-w-[380px] bg-ground text-ink">
      <div className="caps flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-[14px]">
        <span>Back the {p.runTitle.toLowerCase()}</span>
        <span className="text-accent-ink">Door Money</span>
      </div>

      {done ? (
        <div className="px-4 py-8 text-center">
          <div className="caps lit mx-auto mb-4 flex h-[104px] w-[104px] items-center justify-center rounded-full border border-accent/70 text-[14px] text-accent-ink">Backed</div>
          <p className="max-w-none text-[14.5px] leading-[1.6]"><b>{chosen?.label} to {p.actName}.</b><br />A receipt is on its way, and the name goes on the {chosen?.key === "merch_card" ? "merch table card" : "tour thank-you"} when the run wraps.</p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-4">
            <b className="heading block text-[22px] leading-none">{p.actName}</b>
            <span className="caps mt-1.5 block text-[14px] text-muted">{p.showCount} shows.</span>
          </div>
          <div className="relative mx-4 mt-3.5 h-1.5 bg-line"><i className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${p.progress}%` }} /></div>
          <div className="caps flex justify-between px-4 pt-2 text-[14px] text-muted"><span>{p.backedLabel} backed</span><span>of {p.goalLabel}</span></div>

          <div className="grid gap-2 px-4 pt-4">
            {p.tiers.map((t) => (
              <button key={t.key} type="button" onClick={() => setTier(t)} aria-pressed={chosen?.key === t.key} className={tierClass(chosen?.key === t.key)}>
                <span className="heading text-[22px] leading-none">{t.label}</span>
                <span><b className="block text-[14.5px] font-medium leading-tight">{t.title}</b><span className="block text-[14px] leading-snug text-muted">{t.blurb}</span></span>
              </button>
            ))}
            <button type="button" onClick={() => setTier("placement")} aria-pressed={tier === "placement"} className={tierClass(tier === "placement")}>
              <span className="heading text-[22px] leading-none">$500<small className="caps mt-1 block text-[14px] text-muted">and up</small></span>
              <span><b className="block text-[14.5px] font-medium leading-tight">Take a placement</b><span className="block text-[14px] leading-snug text-muted">Kick head, cases, straps, posts. Opens the musician&apos;s board on Door Money.</span></span>
            </button>
          </div>

          {chosen && (
            <div className="grid gap-2 px-4 pt-3">
              <input className="edge w-full px-3 py-2.5 text-[15px]" placeholder="Name, as it should appear" aria-label="Name" />
              <input className="edge w-full px-3 py-2.5 text-[15px]" type="email" placeholder="Email" aria-label="Email" />
              {/* Phase 4: mount the Stripe Payment Element here. */}
              <div className="flex items-center gap-2 border border-dashed border-line px-3 py-2.5 text-[14px] text-muted">Card field, served by Door Money. Nothing typed here touches the host site.</div>
            </div>
          )}

          <button type="button"
            onClick={() => { if (tier === "placement") window.open(p.boardUrl, "_blank"); else setDone(true); }}
            className="caps mx-4 mt-4 flex w-[calc(100%-32px)] cursor-pointer items-center justify-center gap-3 border border-accent bg-accent px-3 py-3.5 text-[14px] tracking-[0.16em] text-on-accent transition-colors hover:border-accent-ink hover:bg-accent-ink">
            {tier === "placement" ? "Open the board" : `Back for ${chosen?.label}`}
            <span aria-hidden="true" className="text-[16px] leading-none">&rarr;</span>
          </button>
          <p className="max-w-none px-4 pb-4 pt-3 text-[14px] leading-[1.6] text-muted">Door Money holds the money and pays the musician weekly through the run. Refunded in full if the run is cancelled.</p>
        </>
      )}
    </div>
  );
}
