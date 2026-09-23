"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { decideMark } from "@/app/actions/marks";

/**
 * The organizer's yes or no on what one sponsor sent, taken where the row stands.
 *
 * The same server action the fundraiser page uses (`decideMark`), on the Desk register's controls:
 * a small form rather than a page to go to, because the whole point of Today is that the work is
 * finished from the row. On success the row is gone at the next render, since the query that put
 * it there asks for submitted materials and this is no longer one.
 *
 * "Approve" for a music logo, which is the word music has always used, and "Accept" everywhere
 * else: accepting materials is not approving a delivery and must not read as though it were.
 */
export function TaskDecision({ purchaseId, categoryKey, what }: { purchaseId: string; categoryKey?: string | null; what: string }) {
  const music = (categoryKey ?? "music") === "music";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (decision: "approved" | "declined") =>
    start(async () => {
      setError(null);
      const r = await decideMark(purchaseId, decision);
      if (!r.ok) setError(r.error ?? "That did not save.");
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-1.5">
        <Button register="desk" variant="solid" size="sm" disabled={pending} onClick={() => decide("approved")}>
          {music ? "Approve" : "Accept"}
          <span className="sr-only">: {what}</span>
        </Button>
        <Button register="desk" variant="outline" size="sm" disabled={pending} onClick={() => decide("declined")}>
          Decline
          <span className="sr-only">: {what}</span>
        </Button>
      </div>
      {error && (
        <span role="alert" className="max-w-[30ch] text-right text-[14px] text-attention-ink">
          {error}
        </span>
      )}
    </div>
  );
}
