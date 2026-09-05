"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { periodOf } from "@/lib/periods";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { elementsAppearance } from "@/lib/stripeAppearance";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

/*
  The widget's client side. Three steps: pick a tier and give a name, pay through Stripe's Payment
  Element (its own iframe inside this one, so the card never reaches this page either), then the
  backed state. The host page only ever hears one thing from here: how tall to make the frame.
*/

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type Tier = { key: string; amountCents: number; title: string; blurb: string; label: string };
type Done = { label: string; place: string };

export function EmbedClient(p: {
  slug: string;
  actName: string;
  runTitle: string;
  showCount: number;
  /** runs.kind, so the widget names the tour or the season rather than calling it a run. */
  kind: string;
  backedLabel: string;
  goalLabel: string | null;
  progress: number;
  backerCount: number;
  tiers: Tier[];
  boardUrl: string;
  siteUrl: string;
  source: "widget" | "board";
  paymentsOpen: boolean;
  /** Set when a redirect-based payment method sent the fan back here already paid. */
  initialDone: Done | null;
}) {
  const [tier, setTier] = useState<Tier | "placement">(p.tiers[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(p.initialDone);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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
  }, [done, tier, clientSecret]);

  const chosen = tier === "placement" ? null : tier;
  const period = periodOf(p.kind);
  const tierClass = (on: boolean) =>
    `grid cursor-pointer grid-cols-[72px_1fr] items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
      on ? "border-accent bg-accent/10" : "border-line bg-transparent hover:border-ink/50"
    }`;

  /** Step one done: make the backing and get a client secret for the Payment Element. */
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setPending(true);
    setError(null);
    try {
      // Where the widget is embedded, for the record. The referrer is the host page when its policy allows it.
      let origin: string | undefined;
      try {
        const ref = document.referrer ? new URL(document.referrer).origin : "";
        if (ref && ref !== window.location.origin) origin = ref;
      } catch {
        origin = undefined;
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "backing", slug: p.slug, tier: chosen.key, displayName: name, email, source: p.source, origin }),
      });
      const data = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) throw new Error(data.error ?? "Payment could not start. Try once more.");
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not start. Try once more.");
    } finally {
      setPending(false);
    }
  };

  const appearance = useMemo<Appearance>(() => elementsAppearance(), []);

  return (
    <div ref={root} className="lit mx-auto max-w-[380px] bg-ground text-ink">
      <div className="caps flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-[14px]">
        <span>Back the {period.noun}</span>
        <span className="text-accent-ink">Door Money</span>
      </div>

      {done ? (
        <div className="px-4 py-8 text-center">
          <div className="caps lit mx-auto mb-4 flex h-[104px] w-[104px] items-center justify-center rounded-full border border-accent/70 text-[14px] text-accent-ink">Backed</div>
          <p className="max-w-none text-[14.5px] leading-[1.6]">
            <b>{done.label} to {p.actName}.</b>
            <br />A receipt is on its way, and the name goes on {done.place} when the {period.noun} ends.
          </p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-4">
            <b className="heading block text-[22px] leading-none">{p.actName}</b>
            <span className="caps mt-1.5 block text-[14px] text-muted">
              {p.runTitle}. {p.showCount} {period.units}.
            </span>
          </div>
          {p.goalLabel ? (
            <>
              <div className="relative mx-4 mt-3.5 h-1.5 bg-line" role="img" aria-label={`${p.backedLabel} backed of ${p.goalLabel}`}>
                <i className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${p.progress}%` }} />
              </div>
              <div className="caps flex justify-between px-4 pt-2 text-[14px] text-muted">
                <span>{p.backedLabel} backed</span>
                <span>of {p.goalLabel}</span>
              </div>
            </>
          ) : (
            <div className="caps px-4 pt-3 text-[14px] text-muted">{p.backedLabel} backed</div>
          )}
          {p.backerCount > 0 && (
            <div className="caps px-4 pt-1 text-[14px] text-muted">
              {p.backerCount} {p.backerCount === 1 ? "fan" : "fans"} so far
            </div>
          )}

          {clientSecret && chosen && stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance, loader: "auto", fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&display=swap" }] }}>
              <PayStep
                tier={chosen}
                name={name}
                email={email}
                returnUrl={`${p.siteUrl}/embed/${p.slug}${p.source === "board" ? "?source=board" : ""}`}
                onBack={() => setClientSecret(null)}
                onDone={() => setDone({ label: chosen.label, place: chosen.key === "merch_card" ? "the merch table card" : "the tour thank-you" })}
              />
            </Elements>
          ) : (
            <form onSubmit={start}>
              <div className="grid gap-2 px-4 pt-4">
                {p.tiers.map((t) => (
                  <button key={t.key} type="button" onClick={() => setTier(t)} aria-pressed={chosen?.key === t.key} className={tierClass(chosen?.key === t.key)}>
                    <span className="heading text-[22px] leading-none">{t.label}</span>
                    <span>
                      <b className="block text-[14.5px] font-medium leading-tight">{t.title}</b>
                      <span className="block text-[14px] leading-snug text-muted">{t.blurb}</span>
                    </span>
                  </button>
                ))}
                <button type="button" onClick={() => setTier("placement")} aria-pressed={tier === "placement"} className={tierClass(tier === "placement")}>
                  <span className="heading text-[22px] leading-none">
                    $500<small className="caps mt-1 block text-[14px] text-muted">and up</small>
                  </span>
                  <span>
                    <b className="block text-[14.5px] font-medium leading-tight">Take a sponsorship</b>
                    <span className="block text-[14px] leading-snug text-muted">Kick head, cases, straps, posts. Opens the musician&apos;s page on Door Money.</span>
                  </span>
                </button>
              </div>

              {chosen && (
                <div className="grid gap-2 px-4 pt-3">
                  <input className="field w-full px-3 py-2.5 text-[15px]" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Name, as it should appear" aria-label="Name, as it should appear" autoComplete="name" />
                  <input className="field w-full px-3 py-2.5 text-[15px]" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email, for the receipt" aria-label="Email, for the receipt" autoComplete="email" />
                  {!p.paymentsOpen && <p className="max-w-none text-[14px] leading-[1.6] text-muted">Payments are unavailable right now. Try again shortly.</p>}
                </div>
              )}

              {tier === "placement" ? (
                <a href={p.boardUrl} target="_blank" rel="noopener" className={`${cta} mx-4 w-[calc(100%-32px)]`}>
                  Open the fundraiser <span aria-hidden="true" className="text-[16px] leading-none">&rarr;</span>
                </a>
              ) : (
                <button type="submit" disabled={pending || !p.paymentsOpen} className={`${cta} mx-4 w-[calc(100%-32px)]`}>
                  {pending ? "One second" : `Back for ${chosen?.label}`} <span aria-hidden="true" className="text-[16px] leading-none">&rarr;</span>
                </button>
              )}
              {error && (
                <p role="alert" className="max-w-none px-4 pt-3 text-[14px] text-accent-ink">
                  {error}
                </p>
              )}
              <p className="max-w-none px-4 pb-4 pt-3 text-[14px] leading-[1.6] text-muted">
                Door Money holds the money and pays the musician weekly through the {period.noun}. Refunded in full if it is cancelled.
              </p>
            </form>
          )}
        </>
      )}
    </div>
  );
}

const cta =
  "caps mt-4 flex cursor-pointer items-center justify-center gap-3 border border-accent bg-accent px-3 py-3.5 text-[14px] tracking-[0.16em] text-on-accent no-underline transition-colors hover:border-accent-ink hover:bg-accent-ink disabled:cursor-default disabled:opacity-60";

/** Step two: Stripe's Payment Element and the pay button. Card payments finish here; redirect methods come back to the return URL. */
function PayStep({ tier, name, email, returnUrl, onBack, onDone }: { tier: Tier; name: string; email: string; returnUrl: string; onBack: () => void; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    try {
      const { error: err, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: returnUrl, receipt_email: email },
      });
      if (err) setError(err.message ?? "The payment did not go through. Try once more.");
      else if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) onDone();
      else setError("The payment did not go through. Try once more.");
    } catch (e) {
      // Stripe.js throws, rather than returns, an integration error. Show something and let the fan try again.
      console.error("confirmPayment", e);
      setError("The payment did not go through. Try once more.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={pay} className="px-4 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="caps text-[14px] text-accent-ink">
          {tier.label}, {tier.title.toLowerCase()}
        </span>
        <button type="button" onClick={onBack} className="caps cursor-pointer text-[14px] text-muted hover:text-ink">
          Back
        </button>
      </div>
      <div className="mt-3 min-h-[120px]">
        {/* Name and email were typed one step back. Link is off: its save-my-info prompt asks for a
            phone number, which is more than a $25 backing should ask. */}
        <PaymentElement options={{ layout: "tabs", defaultValues: { billingDetails: { name, email } }, wallets: { link: "never" } }} onReady={() => setReady(true)} />
      </div>
      <button type="submit" disabled={pending || !ready || !stripe} className={`${cta} w-full`}>
        {pending ? "One second" : `Pay ${tier.label}`} <span aria-hidden="true" className="text-[16px] leading-none">&rarr;</span>
      </button>
      {error && (
        <p role="alert" className="max-w-none pt-3 text-[14px] text-accent-ink">
          {error}
        </p>
      )}
      <p className="max-w-none pb-4 pt-3 text-[14px] leading-[1.6] text-muted">The card field is served by the payment processor. Nothing typed in it touches the host site or Door Money&apos;s servers.</p>
    </form>
  );
}
