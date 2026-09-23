"use client";
import { useState, useTransition } from "react";
import { publishRun } from "@/app/actions/run";
import { Button } from "@/components/Button";

/*
  The one decision left on a draft's workspace: publish it, or hear that its category cannot be.

  The same two sentences the options editor (LotsEditor) says under its list, drawn without the
  list, because a draft's options are now built on the sponsorships stage. Transitional: the review
  stage is where this decision will live, and this component goes with it.
*/
export function DraftPublishControls({ runId, publishable, optionCount, blockers = [] }: {
  runId: string; publishable: boolean; optionCount: number;
  /** What publishRun would refuse this draft for right now, from the same rules it runs. Shown, and the button waits. */
  blockers?: readonly string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [publishing, start] = useTransition();
  if (!publishable) {
    return (
      <p className="max-w-[56ch] text-[15px]">
        This fundraiser is a private draft, and it stays one. Door Money has not opened this category for publishing or payments yet, so nobody else can see it and nothing on it can be bought. Your sponsorship options and prices are saved for when it opens.
      </p>
    );
  }
  return (
    <>
      <p className="mb-4 max-w-[56ch] text-[15px]">
        The fundraiser is private until it is published. Publishing puts it at its own address and on the fundraisers page.
      </p>
      {blockers.length > 0 && (
        <div className="mb-4 max-w-[62ch]">
          <p className="caps mb-2 text-[14px] text-accent-ink">Before it can be published</p>
          <ul className="grid gap-1 text-[14.5px]">
            {blockers.map((b) => (
              <li key={b}><span aria-hidden="true" className="mr-2 text-accent-ink">•</span>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          disabled={publishing || optionCount === 0 || blockers.length > 0}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await publishRun(runId);
              if (!r.ok) setError(r.error ?? "That did not publish.");
            })
          }
        >
          {publishing ? "Publishing" : "Publish the fundraiser"}
        </Button>
        {error && <span className="text-[14.5px] text-accent-ink">{error}</span>}
      </div>
    </>
  );
}
