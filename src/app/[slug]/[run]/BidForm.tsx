"use client";
import { useMemo, useState } from "react";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { placeBid } from "@/app/actions/bids";
import { Button } from "@/components/Button";
import { formatMoney } from "@/lib/money";
import { elementsAppearance } from "@/lib/stripeAppearance";

/**
 * Placing a bid, in two steps: who and how much, then the card.
 *
 * Straight bidding, so the number here is what the patron pays if it wins. Nobody signs in to bid,
 * so the form takes a name and an email and offers to keep the name off the board.
 *
 * The card is stored, not charged. It sits against the patron until the close, and only the winning
 * bid is ever charged; an outbid patron has nothing to release. Taking it here is what stops a bid
 * from somebody who never meant to pay, which used to cost the act 48 hours before rolling on.
 *
 * Without a publishable key the card step is skipped and the bid goes in as it always did, which is
 * how the sample boards and any Door Money running without Stripe keep working.
 */
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type Details = { amountCents: number; name: string; email: string; anonymous: boolean };

export function BidForm({ lotId, lotName, minimumCents, onDone, onClose }: { lotId: string; lotName: string; minimumCents: number; onDone: () => void; onClose: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(minimumCents / 100)));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Set once the patron has been warned that the bid is far above the asking price. */
  const [confirmed, setConfirmed] = useState(false);
  /** Step two: the details are settled and Stripe is holding a client secret for the card. */
  const [card, setCard] = useState<{ clientSecret: string; details: Details } | null>(null);

  const appearance = useMemo<Appearance>(() => elementsAppearance(), []);

  /** The amount, or null with the reason already shown. Also the one place the misplaced digit is caught. */
  const readAmount = () => {
    const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("That amount did not look like a number.");
      return null;
    }
    // A bid is binding, and an extra digit is easy to type. Anything wildly over the asking price
    // gets one confirmation before it goes anywhere.
    if (cents >= minimumCents * 10 && !confirmed) {
      setConfirmed(true);
      setError(`That is ${formatMoney(cents)}, well above the ${formatMoney(minimumCents)} asked. Press again to confirm it.`);
      return null;
    }
    return cents;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cents = readAmount();
    if (cents === null) return;
    const details: Details = { amountCents: cents, name, email, anonymous };

    setPending(true);
    // No Stripe on this deployment: the bid goes in with no card, exactly as it used to.
    if (!stripePromise) {
      const r = await placeBid({ lotId, amountCents: cents, patronName: name, email, anonymous, website });
      setPending(false);
      if (!r.ok) setError(r.error);
      else onDone();
      return;
    }

    try {
      const res = await fetch("/api/bids/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lotId, patronName: name, email, website }),
      });
      const body = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !body.clientSecret) {
        setError(body.error ?? "That did not go through. Try once more.");
        return;
      }
      setCard({ clientSecret: body.clientSecret, details });
    } catch {
      setError("That did not go through. Try once more.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="edge col-span-full mt-2 bg-panel p-6 max-md:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="caps text-[14px] text-accent-ink">Bidding on {lotName}</span>
          <span className="caps ml-3 text-[14px] text-muted">{formatMoney(minimumCents)} or more</span>
        </div>
        <button type="button" onClick={card ? () => setCard(null) : onClose} className="caps cursor-pointer text-[14px] text-muted hover:text-ink">
          {card ? "Back" : "Cancel"}
        </button>
      </div>

      {card ? (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: card.clientSecret, appearance, loader: "auto", fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&display=swap" }] }}
        >
          <CardStep lotId={lotId} details={card.details} website={website} onDone={onDone} />
        </Elements>
      ) : (
        <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-[140px_1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="caps mb-2 block text-[14px] text-muted">Bid</span>
            <div className="field flex items-center gap-1 px-3.5 py-3">
              <span className="text-[15px] text-muted">$</span>
              <input
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setConfirmed(false);
                }}
                onFocus={(e) => e.currentTarget.select()}
                inputMode="decimal"
                required
                className="w-full bg-transparent text-[15px] outline-none"
                aria-label="Bid amount in dollars"
              />
            </div>
          </label>
          <label className="block">
            <span className="caps mb-2 block text-[14px] text-muted">Name, as it should appear</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="organization" className="field w-full px-3.5 py-3 text-[15px]" />
          </label>
          <label className="block">
            <span className="caps mb-2 block text-[14px] text-muted">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="field w-full px-3.5 py-3 text-[15px]" />
          </label>
          <Button type="submit" disabled={pending} arrow>
            {pending ? "One second" : confirmed ? "Confirm the bid" : stripePromise ? "Continue" : "Place the bid"}
          </Button>

          <label className="flex items-center gap-2.5 text-[14.5px] text-muted md:col-span-4">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Show the bid as &quot;Anonymous patron&quot; on the board. The musician still sees the name.
          </label>
          {/* Left empty by people, filled in by robots. */}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

          <p className="max-w-none text-[14px] leading-[1.6] text-muted md:col-span-4">
            {stripePromise
              ? "A bid is what the patron pays if it wins. The card is stored now and charged only if the bid wins at the close. An outbid patron is never charged."
              : "A bid is what the patron pays if it wins. Nothing is charged now. At the close the top bid has 48 hours to put the money up, and the spot goes to the next bid if it does not."}
          </p>
          {error && (
            <p role="alert" className="text-[14.5px] text-accent-ink md:col-span-4">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

/** Step two: the card. Stored against the patron, charged only if this bid wins. */
function CardStep({ lotId, details, website, onDone }: { lotId: string; details: Details; website: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    try {
      // The card is stored, never charged here, so there is no return_url to come back from:
      // "if_required" keeps the patron on the board unless their bank insists on a redirect.
      const { error: err, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
      if (err) {
        setError(err.message ?? "The card was not saved. Try once more.");
        return;
      }
      if (!setupIntent || setupIntent.status !== "succeeded") {
        setError("The card was not saved. Try once more.");
        return;
      }
      // The bid goes in only once the card is stored, so no bid exists without one. The server reads
      // this SetupIntent back from Stripe; the id is all that is trusted to travel.
      const r = await placeBid({
        lotId,
        amountCents: details.amountCents,
        patronName: details.name,
        email: details.email,
        anonymous: details.anonymous,
        website,
        setupIntentId: setupIntent.id,
      });
      if (!r.ok) setError(r.error);
      else onDone();
    } catch (e) {
      // Stripe.js throws, rather than returns, an integration error.
      console.error("confirmSetup", e);
      setError("The card was not saved. Try once more.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={confirm} className="mt-5 grid gap-4">
      <p className="max-w-[60ch] text-[14.5px] leading-[1.6] text-muted">
        Bidding {formatMoney(details.amountCents)}. The card is stored now and charged only if this bid wins at the close. An outbid patron is never charged.
      </p>
      <PaymentElement
        options={{ layout: "tabs", defaultValues: { billingDetails: { name: details.name, email: details.email } }, wallets: { link: "never" } }}
        onReady={() => setReady(true)}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || !ready} arrow>
          {pending ? "One second" : `Place the ${formatMoney(details.amountCents)} bid`}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[14.5px] text-accent-ink">
          {error}
        </p>
      )}
    </form>
  );
}
