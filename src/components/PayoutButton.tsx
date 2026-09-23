"use client";
import { useState, useTransition } from "react";
import { startStripeOnboarding } from "@/app/actions/payouts";
import { Button } from "@/components/Button";

/**
 * The way into Stripe's own onboarding, from the Money page.
 *
 * On the Desk register, so it is sentence case with a 6px corner rather than the Stage register's
 * tracked caps: the workspace is scanned, and a button that shouts is a button in the wrong room.
 */
export function PayoutButton({ configured, label, ghost = false }: { configured: boolean; label: string; ghost?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        type="button"
        register="desk"
        variant={ghost ? "outline" : "solid"}
        disabled={pending || !configured}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await startStripeOnboarding();
            if (r && !r.ok) setError(r.error ?? "That did not start.");
          })
        }
      >
        {pending ? "Opening Stripe" : label}
      </Button>
      {error && <span className="text-[14px] text-attention-ink">{error}</span>}
    </div>
  );
}
