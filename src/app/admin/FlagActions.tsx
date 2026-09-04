"use client";
import { useState, useTransition } from "react";
import { clearPatronFlag } from "@/app/actions/flags";
import type { FlagSource } from "@/lib/flags";
import { Button } from "@/components/Button";

/** Door Money looked and the run is fine: the hold comes off and the paused slices rejoin the queue. */
export function ClearFlag({ source, id }: { source: FlagSource; id: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<string | null>(null);
  if (state) return <span className="caps text-[14px] text-muted">{state}</span>;
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await clearPatronFlag(source, id);
          setState(r.ok ? `Released ${r.resumed ?? 0}` : (r.error ?? "Did not save"));
        })
      }
    >
      {pending ? "One second" : "Release the hold"}
    </Button>
  );
}
