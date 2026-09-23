import { STAGES, STAGE_LABEL, type Stage } from "@/lib/fundraiser-stages";

/**
 * Where the organizer is on the way to a fundraiser: four stages, one lit.
 *
 * Progress and nothing else. The stages are not links, because moving between them is what Back
 * and Continue do, and both of those save first. A stage before the current one is drawn as
 * passed, which says only that it was visited: what the fundraiser still needs is the readiness
 * checklist's answer, not this bar's.
 *
 * On a phone four tracked-caps labels do not fit side by side at 14px, and the type never goes
 * smaller than that, so the bars stay and one line names the stage instead.
 */
export function FundraiserStages({ current, className = "" }: { current: Stage; className?: string }) {
  const at = STAGES.indexOf(current);
  return (
    <nav aria-label="Stages of creating a fundraiser" className={className}>
      <ol className="grid grid-cols-4 gap-2">
        {STAGES.map((stage, i) => {
          const state = i < at ? "passed" : i === at ? "current" : "upcoming";
          return (
            <li key={stage} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
              <span
                aria-hidden="true"
                className={`block h-[3px] w-full ${state === "upcoming" ? "bg-line" : "bg-accent"} ${state === "passed" ? "opacity-60" : ""}`}
              />
              <span className={`caps mt-2.5 hidden text-[14px] sm:block ${state === "current" ? "text-ink" : "text-muted"}`}>
                <span className="sr-only">{state === "current" ? "Current stage: " : state === "passed" ? "Passed: " : "Upcoming: "}</span>
                {STAGE_LABEL[stage]}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="caps mt-2.5 text-[14px] text-ink sm:hidden">
        Stage {at + 1} of {STAGES.length}: {STAGE_LABEL[current]}
      </p>
    </nav>
  );
}
