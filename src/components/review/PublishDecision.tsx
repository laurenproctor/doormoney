"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { publishRun } from "@/app/actions/run";
import { Button } from "@/components/Button";
import { Locked } from "@/components/dashboard/icons";

/*
  The last decision on a draft.

  Three answers, and the page draws exactly one. A category the registry has not opened cannot be
  published: the draft is kept, and the button says so. A publishable draft with something still
  unfinished names it and waits. A finished one publishes, with what becomes public said above
  the button, and lands on the fundraiser's workspace with its public address in hand.

  `publishRun` is the gate. The blockers here are its own sentences, computed on the server by the
  same rules, so a button that waits and a refusal that arrives cannot disagree; the database asks
  once more (migrations 0041, 0060) whatever this drew.
*/
export function PublishDecision({ runId, publishable, blockers, becomesPublic, keepHref, workspaceHref }: {
  runId: string;
  /** From the registry's `publish_enabled`, never from a list in code. */
  publishable: boolean;
  /** What publishRun would refuse this draft for right now. */
  blockers: readonly string[];
  /** The lines above the button, from src/lib/review.ts. */
  becomesPublic: readonly string[];
  /** Where a private draft is kept: the fundraisers list. */
  keepHref: string;
  /** Where a published fundraiser is managed from now on. */
  workspaceHref: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [publishing, start] = useTransition();

  if (!publishable) {
    return (
      <div>
        <p className="max-w-[62ch] text-[15px]">
          Door Money has not opened this category for publishing or payments. Nobody else can see this fundraiser, nothing on it can be bought, and everything you wrote is saved as a private draft for when it opens.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href={keepHref} className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-control border border-accent-line bg-accent px-3.5 text-[14px] font-medium text-on-accent no-underline hover:bg-accent-ink">
            Save private draft
          </Link>
          <span className="text-[14px] text-muted">It is already saved. This takes you back to your fundraisers.</span>
        </div>
      </div>
    );
  }

  const ready = blockers.length === 0;
  return (
    <div>
      {ready ? (
        <>
          <p className="mb-2 text-[14px] text-muted">What becomes public</p>
          <ul className="grid max-w-[62ch] gap-1.5 text-[15px]">
            {becomesPublic.map((line) => (
              <li key={line} className="flex gap-2.5"><span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 flex-none bg-accent" /><span>{line}</span></li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mb-2 text-[14px] text-muted">Before it can be published</p>
          <ul className="grid max-w-[62ch] gap-1.5 text-[15px]">
            {blockers.map((b) => (
              <li key={b} className="flex gap-2.5"><span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 flex-none bg-attention-ink" /><span>{b}</span></li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-5 flex items-center gap-2.5 text-[14px] text-muted">
        <Locked size={16} aria-hidden="true" className="flex-none" />
        {ready ? "Private until you choose Publish fundraiser. Nothing goes up on its own." : "Private. The button waits until the list above is empty."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button
          register="desk"
          type="button"
          disabled={!ready || publishing}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await publishRun(runId);
              if (!r.ok) {
                setError(r.error ?? "That did not publish.");
                return;
              }
              router.push(`${workspaceHref}?published=1`);
            })
          }
        >
          {publishing ? "Publishing" : "Publish fundraiser"}
        </Button>
        <Link href={keepHref} className="text-[14px] text-accent-ink underline decoration-1 underline-offset-4">Keep it as a draft for now</Link>
      </div>
      {error && <p role="alert" className="mt-4 max-w-[62ch] text-[14.5px] text-attention-ink">{error}</p>}
    </div>
  );
}
