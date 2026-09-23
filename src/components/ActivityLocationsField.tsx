"use client";
import { useId } from "react";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { COUNTRY_OPTIONS } from "@/lib/countries";

/*
  Where the activity happens: none, one or several places.

  `runs.activity_locations` (migration 0038) held a list nothing on the dashboard could write, so
  every fundraiser's activity countries, which discovery derives from it (0053), stayed empty. This
  is the smallest editor that writes it: a city, a region and a country per place, each optional,
  with a blank row dropped rather than saved as an empty place. The organizer's own location is a
  different fact (`acts.city`) and is never copied in here. Online work adds no place at all.
*/

export type LocationRow = { city: string; region: string; country_code: string };

export const EMPTY_LOCATION: LocationRow = { city: "", region: "", country_code: "" };

export const isBlankLocation = (row: LocationRow) => !row.city.trim() && !row.region.trim() && !row.country_code;

export function ActivityLocationsField({ rows, onChange }: { rows: LocationRow[]; onChange: (rows: LocationRow[]) => void }) {
  const id = useId();
  const update = (i: number, patch: Partial<LocationRow>) => onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <fieldset className="my-4">
      <legend className={labelClass}>Places (optional)</legend>
      <p className="mb-3 text-[14.5px] text-muted">
        Where the work happens: a town on a tour, a home ground, a screening city. Leave it empty for online work or until it is settled.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="mb-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className={labelClass}>City</span>
            <input id={`${id}-city-${i}`} type="text" value={row.city} onChange={(e) => update(i, { city: e.target.value })} autoComplete="off" className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Region or state</span>
            <input type="text" value={row.region} onChange={(e) => update(i, { region: e.target.value })} autoComplete="off" className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Country</span>
            <select value={row.country_code} onChange={(e) => update(i, { country_code: e.target.value })} className={inputClass}>
              <option value="">Not chosen</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            aria-label={`Remove place ${i + 1}`}
            className="caps min-h-[44px] cursor-pointer px-2 text-[14px] text-accent-ink underline decoration-1 underline-offset-4"
          >
            Remove
          </button>
        </div>
      ))}
      {rows.length < 50 && (
        <button
          type="button"
          onClick={() => onChange([...rows, { ...EMPTY_LOCATION }])}
          className="caps min-h-[44px] cursor-pointer text-[14px] text-accent-ink underline decoration-1 underline-offset-4"
        >
          {rows.length === 0 ? "Add a place" : "Add another place"}
        </button>
      )}
    </fieldset>
  );
}
