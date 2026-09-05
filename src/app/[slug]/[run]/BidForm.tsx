"use client";
import { useState } from "react";
import { placeBid } from "@/app/actions/bids";
import { Button } from "@/components/Button";
import { formatMoney } from "@/lib/money";

/**
 * Placing a bid. Straight bidding: the number here is what the patron pays if they win. Nobody
 * signs in to bid, so the form takes a name and an email, and offers to keep the name off the board.
 */
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("That amount did not look like a number.");
      setPending(false);
      return;
    }
    // A bid is binding, and an extra digit is easy to type. Anything wildly over the asking price
    // gets one confirmation before it goes in.
    if (cents >= minimumCents * 10 && !confirmed) {
      setConfirmed(true);
      setError(`That is ${formatMoney(cents)}, well above the ${formatMoney(minimumCents)} asked. Press again to confirm it.`);
      setPending(false);
      return;
    }
    const r = await placeBid({ lotId, amountCents: cents, patronName: name, email, anonymous, website });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onDone();
  };

  return (
    <div className="edge col-span-full mt-2 bg-panel p-6 max-md:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="caps text-[14px] text-accent-ink">Bidding on {lotName}</span>
          <span className="caps ml-3 text-[14px] text-muted">{formatMoney(minimumCents)} or more</span>
        </div>
        <button type="button" onClick={onClose} className="caps cursor-pointer text-[14px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-[140px_1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="caps mb-2 block text-[14px] text-muted">Bid</span>
          <div className="edge flex items-center gap-1 px-3.5 py-3">
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
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="organization" className="edge w-full px-3.5 py-3 text-[15px]" />
        </label>
        <label className="block">
          <span className="caps mb-2 block text-[14px] text-muted">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="edge w-full px-3.5 py-3 text-[15px]" />
        </label>
        <Button type="submit" disabled={pending} arrow>
          {pending ? "One second" : confirmed ? "Confirm the bid" : "Place the bid"}
        </Button>

        <label className="flex items-center gap-2.5 text-[14.5px] text-muted md:col-span-4">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Show the bid as &quot;Anonymous patron&quot; on the board. The musician still sees the name.
        </label>
        {/* Left empty by people, filled in by robots. */}
        <input value={website} onChange={(e) => setWebsite(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

        <p className="max-w-none text-[14px] leading-[1.6] text-muted md:col-span-4">
          A bid is what the patron pays if it wins. Nothing is charged now. At the close the top bid has 48 hours to put the money up, and the spot goes to the next bid if it does not.
        </p>
        {error && (
          <p role="alert" className="text-[14.5px] text-accent-ink md:col-span-4">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
