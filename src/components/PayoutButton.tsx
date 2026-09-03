"use client";
import { useState, useTransition } from "react";
import { startStripeOnboarding } from "@/app/actions/payouts";
import { Button } from "@/components/Button";

export function PayoutButton({ configured, label, ghost = false }: { configured: boolean; label: string; ghost?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        type="button"
        variant={ghost ? "ghost" : "solid"}
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
      {error && <span className="typewriter text-[14.5px] text-red-deep">{error}</span>}
    </div>
  );
}
