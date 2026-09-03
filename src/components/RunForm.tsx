"use client";
import { useActionState } from "react";
import { saveRun, type RunState } from "@/app/actions/run";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { Field } from "@/components/ActForm";

export type RunInput = {
  id: string;
  kind: "tour" | "season" | "residency";
  title: string;
  starts_on: string;
  ends_on: string;
  show_count: number;
  expected_attendance: number | null;
  bidding_closes_at: string | null;
};

const KINDS = [
  ["tour", "Tour", "A run of dates on the road."],
  ["season", "Season", "A stretch of gigs at home. Weeks or months."],
  ["residency", "Residency", "One room, a month at a time."],
] as const;

const initial: RunState = { ok: false };

/** Local datetime value for the input, from an ISO timestamp. */
function localValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RunForm({ run, actType }: { run: RunInput | null; actType: "touring_band" | "house_act" | "soloist" }) {
  const [state, action, pending] = useActionState(saveRun, initial);
  const err = state.errors ?? {};
  const defaultKind = run?.kind ?? (actType === "touring_band" ? "tour" : "season");

  return (
    <form action={action} noValidate>
      {run && <input type="hidden" name="id" value={run.id} />}

      <fieldset className="mb-[18px]">
        <legend className={labelClass}>Kind of run</legend>
        <div className="grid gap-3.5 md:grid-cols-3">
          {KINDS.map(([value, label, blurb]) => (
            <label key={value} className="hard-border cursor-pointer bg-white p-3.5 has-[:checked]:bg-tape has-[:checked]:shadow-[inset_0_0_0_2px_var(--black)]">
              <input type="radio" name="kind" value={value} defaultChecked={defaultKind === value} className="sr-only" />
              <span className="poster block text-[17px]">{label}</span>
              <span className="block text-[14.5px] leading-[1.5] text-gray">{blurb}</span>
            </label>
          ))}
        </div>
        {err.kind && <p className="typewriter mt-1.5 text-[14.5px] text-red-deep">{err.kind}</p>}
      </fieldset>

      <Field label="Run name" error={err.title} hint='Shows on the board. "Fall run", "Winter season", "October at Barbès".'>
        <input name="title" defaultValue={run?.title ?? ""} className={inputClass} />
      </Field>

      <div className="grid gap-x-5 md:grid-cols-2">
        <Field label="First date" error={err.starts_on}>
          <input name="starts_on" type="date" defaultValue={run?.starts_on ?? ""} className={inputClass} />
        </Field>
        <Field label="Last date" error={err.ends_on}>
          <input name="ends_on" type="date" defaultValue={run?.ends_on ?? ""} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-x-5 md:grid-cols-2">
        <Field label="Shows on the run" error={err.show_count}>
          <input name="show_count" type="number" min={1} max={400} defaultValue={run?.show_count ?? ""} className={inputClass} />
        </Field>
        <Field label="Expected attendance" error={err.expected_attendance} hint="Across the whole run, a rough number. Optional.">
          <input name="expected_attendance" inputMode="numeric" defaultValue={run?.expected_attendance ?? ""} className={inputClass} />
        </Field>
      </div>

      <Field label="Bidding closes" error={err.bidding_closes_at} hint="Needed if any spot is an auction. Leave blank for fixed prices only.">
        <input name="bidding_closes_at" type="datetime-local" defaultValue={localValue(run?.bidding_closes_at ?? null)} className={inputClass} />
      </Field>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : run ? "Save the run" : "Save and price the spots"}</Button>
        {state.ok && <span className="typewriter text-[14.5px] text-gray">Saved.</span>}
        {err.form && <span className="typewriter text-[14.5px] text-red-deep">{err.form}</span>}
      </div>
    </form>
  );
}
