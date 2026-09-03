"use client";
import { useState, useTransition } from "react";
import { decideMark } from "@/app/actions/marks";

/** Approve or decline buttons for one submitted mark. */
export function MarkDecision({ purchaseId }: { purchaseId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (decision: "approved" | "declined") =>
    start(async () => {
      setError(null);
      const r = await decideMark(purchaseId, decision);
      if (!r.ok) setError(r.error ?? "That did not save.");
    });
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button type="button" disabled={pending} onClick={() => act("approved")} className="poster hard-border cursor-pointer bg-red px-4 py-2 text-[14px] text-white shadow-[3px_3px_0_var(--black)] disabled:opacity-60">
        Approve
      </button>
      <button type="button" disabled={pending} onClick={() => act("declined")} className="poster hard-border cursor-pointer bg-white px-4 py-2 text-[14px] shadow-[3px_3px_0_var(--black)] disabled:opacity-60">
        Decline
      </button>
      {error && <span className="typewriter text-[12.5px] text-red">{error}</span>}
    </div>
  );
}
