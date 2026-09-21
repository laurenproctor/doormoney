"use client";
import { useState, useTransition } from "react";
import { decideMark } from "@/app/actions/marks";

/**
 * The organizer's yes or no on what one sponsor sent. "Approve" for a music logo, which is the word
 * music has always used, and "Accept" everywhere else, because accepting materials is not approving
 * a delivery and must not read as though it were.
 */
export function MarkDecision({ purchaseId, categoryKey }: { purchaseId: string; categoryKey?: string | null }) {
  const music = (categoryKey ?? "music") === "music";
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
      <button type="button" disabled={pending} onClick={() => act("approved")} className="caps edge cursor-pointer bg-accent px-4 py-2 text-[15px] text-on-accent disabled:opacity-60">
        {music ? "Approve" : "Accept"}
      </button>
      <button type="button" disabled={pending} onClick={() => act("declined")} className="caps edge cursor-pointer bg-panel px-4 py-2 text-[15px] disabled:opacity-60">
        Decline
      </button>
      {error && <span className="text-[14px] text-accent-ink">{error}</span>}
    </div>
  );
}
