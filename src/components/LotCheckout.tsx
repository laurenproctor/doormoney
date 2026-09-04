"use client";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Button } from "@/components/Button";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

/**
 * Taking a fixed-price spot. Two steps: who the patron is, then Stripe's embedded checkout on this
 * page. The card never touches Door Money's servers; the money lands with Door Money and moves to the
 * act on Fridays. Fulfilment happens in the webhook, not here.
 */
export function LotCheckout({ lotId, lotName, priceLabel, onClose }: { lotId: string; lotName: string; priceLabel: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!stripePromise) {
    return <p className="mt-4 max-w-none text-[14.5px] text-muted">Payments are unavailable right now. The spot stays on the board; try again shortly.</p>;
  }

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "lot", lotId, patronName: name, email }),
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

  return (
    <div className="edge col-span-full mt-2 bg-panel p-6 max-md:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="caps text-[14px] text-accent-ink">Taking {lotName}</span>
          <span className="caps ml-3 text-[14px] text-muted">{priceLabel}</span>
        </div>
        <button type="button" onClick={onClose} className="caps cursor-pointer text-[14px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>

      {clientSecret ? (
        <div className="mt-5 bg-white p-3">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      ) : (
        <form onSubmit={start} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="caps mb-2 block text-[14px] text-muted">Name, as it should appear</span>
            <input name="patronName" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="organization" className="edge w-full px-3.5 py-3 text-[15px]" />
          </label>
          <label className="block">
            <span className="caps mb-2 block text-[14px] text-muted">Email for the record</span>
            <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="edge w-full px-3.5 py-3 text-[15px]" />
          </label>
          <Button type="submit" disabled={pending} arrow>
            {pending ? "One second" : "Continue to payment"}
          </Button>
          <p className="max-w-none text-[14px] leading-[1.6] text-muted md:col-span-3">
            Door Money holds the money and pays the musician every Friday through the run. The musician approves the mark before anything goes up. The spot is held for thirty minutes while payment goes through.
          </p>
          {error && (
            <p role="alert" className="text-[14.5px] text-accent-ink md:col-span-3">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
