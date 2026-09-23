"use client";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Button } from "@/components/Button";
import { OfferSummary } from "@/components/OfferSummary";
import { isEmptyOfferTerms, type OfferTermsView } from "@/lib/offer-terms";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

/**
 * Taking a fixed-price spot. Two steps: who the patron is, then Stripe's embedded checkout on this
 * page. The card never touches Door Money's servers; the money lands with Door Money and moves to the
 * act on Fridays. Fulfilment happens in the webhook, not here.
 */
export function LotCheckout({
  lotId,
  lotName,
  priceLabel,
  token,
  buyNow,
  note,
  terms = "Door Money holds the money and releases it under the fundraiser's terms. The organizer approves the sponsor's materials before anything goes up.",
  offerTerms = {},
  offerPolicy = [],
  termsFingerprint = null,
  onClose,
}: {
  lotId: string;
  lotName: string;
  priceLabel: string;
  /** The winning bidder's private token, when this is an auction lot being claimed. */
  token?: string;
  /** Taking an auction lot outright at its buy-it-now price. */
  buyNow?: boolean;
  /** An extra line above the form, for anything the patron should know before paying. */
  note?: string;
  /** How the money moves on this fundraiser, from checkoutTerms in src/lib/record-words.ts. The default names no category. */
  terms?: string;
  /**
   * What this sponsorship includes, already public-safe. Shown before the card form so nobody pays
   * for an offer they have not read. Empty on an offer whose organizer has written no terms.
   */
  offerTerms?: OfferTermsView;
  /** What the category's delivery policy decides about cancelling and refunds. */
  offerPolicy?: { key: string; label: string; sentence: string }[];
  /**
   * The fingerprint of the offer this page drew. Sent back so the server can refuse a payment
   * against terms that have moved since. It is never read as the terms themselves: the route loads
   * those from the lot and compares its own fingerprint with this one.
   */
  termsFingerprint?: string | null;
  /** Null on the claim page, where there is nothing to go back to. */
  onClose: (() => void) | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!stripePromise) {
    return <p className="mt-4 max-w-none text-[14.5px] text-muted">Payments are unavailable right now. The spot stays open; try again shortly.</p>;
  }

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "lot", lotId, patronName: name, email,
          ...(token ? { token } : {}),
          ...(buyNow ? { buyNow: true } : {}),
          ...(termsFingerprint ? { termsFingerprint } : {}),
        }),
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
        {onClose && (
          <button type="button" onClick={onClose} className="caps cursor-pointer text-[14px] text-muted hover:text-ink">
            Cancel
          </button>
        )}
      </div>

      {note && !clientSecret && <p className="mt-4 max-w-none text-[14.5px] leading-[1.6] text-accent-ink">{note}</p>}

      {/* What is being bought, one press away, right where the money is. An offer whose organizer
          wrote no terms shows nothing here, and the line under the form still says how the money
          moves, exactly as it did before any of this existed. */}
      {!clientSecret && !isEmptyOfferTerms(offerTerms) && (
        <details className="mt-4 border-t border-line pt-4">
          <summary className="caps cursor-pointer text-[14px] text-accent-ink">What this sponsorship includes</summary>
          <div className="mt-4">
            <OfferSummary terms={offerTerms} policy={offerPolicy} heading="" />
          </div>
        </details>
      )}

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
            <input name="patronName" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="organization" className="field w-full px-3.5 py-3 text-[15px]" />
          </label>
          <label className="block">
            <span className="caps mb-2 block text-[14px] text-muted">Email for the record</span>
            <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="field w-full px-3.5 py-3 text-[15px]" />
          </label>
          <Button type="submit" disabled={pending} arrow>
            {pending ? "One second" : "Continue to payment"}
          </Button>
          <p className="max-w-none text-[14px] leading-[1.6] text-muted md:col-span-3">
            {terms}
            {!token && " The sponsorship is held for thirty minutes while payment goes through."}
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
