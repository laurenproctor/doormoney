"use client";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { ChevronDown } from "@/components/dashboard/icons";
import type { DashboardRun } from "@/lib/dashboard";

/**
 * Which fundraiser the dashboard is about.
 *
 * A native select, so it is keyboard-operable and screen-reader-operable without any of it being
 * rebuilt. The choice goes into the query string rather than into state, so the page it produces
 * can be linked to and reloaded.
 */
export function FundraiserSelector({ runs, selectedId }: { runs: DashboardRun[]; selectedId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const id = useId();

  if (runs.length < 2) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Choose a fundraiser
      </label>
      <div className="relative">
        <select
          id={id}
          value={selectedId}
          disabled={pending}
          onChange={(e) => start(() => router.push(`/dashboard?fundraiser=${encodeURIComponent(e.target.value)}`))}
          className="field w-full min-w-[220px] cursor-pointer appearance-none bg-ground py-2.5 pl-3.5 pr-10 text-[14.5px] text-ink"
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      </div>
    </div>
  );
}
