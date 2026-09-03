"use client";
import { useActionState, useState, useTransition } from "react";
import { addShow, markShow, removeShow, uploadShowPhoto, type ShowState } from "@/app/actions/shows";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";

export type ShowRow = { id: string; played_on: string; venue: string | null; city: string | null; played: boolean; attendance: number | null; photo_url: string | null };

const initial: ShowState = { ok: false };
const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The show list for a run: add a date, tap "played", type a number, add a photo.
 * Light on purpose. The end-of-run record reads from this.
 */
export function ShowsPanel({ runId, shows, defaultCity }: { runId: string; shows: ShowRow[]; defaultCity: string }) {
  const [addState, addAction, adding] = useActionState(addShow, initial);
  const played = shows.filter((s) => s.played).length;

  return (
    <div>
      {shows.length > 0 && (
        <p className="mb-4 text-[15px]">
          {played} of {shows.length} played.
        </p>
      )}
      {shows.length === 0 ? (
        <p className="mb-6 max-w-none text-[15px] text-muted">No dates yet. Add each show once; through the run, one tap marks it played.</p>
      ) : (
        <ul className="mb-8 divide-y divide-line border-y border-line">
          {shows.map((s) => (
            <ShowLine key={s.id} show={s} />
          ))}
        </ul>
      )}

      <form action={addAction} noValidate className="grid gap-x-4 md:grid-cols-[170px_1fr_1fr_auto] md:items-end">
        <input type="hidden" name="run_id" value={runId} />
        <div className="mb-3">
          <label className={labelClass} htmlFor="show-date">Date</label>
          <input id="show-date" name="played_on" type="date" className={inputClass} />
        </div>
        <div className="mb-3">
          <label className={labelClass} htmlFor="show-venue">Venue</label>
          <input id="show-venue" name="venue" className={inputClass} placeholder="Optional" />
        </div>
        <div className="mb-3">
          <label className={labelClass} htmlFor="show-city">City</label>
          <input id="show-city" name="city" defaultValue={defaultCity} className={inputClass} />
        </div>
        <div className="mb-3">
          <Button type="submit" variant="ghost" disabled={adding} className="px-5 py-3 text-[16px]">{adding ? "Adding" : "Add a show"}</Button>
        </div>
      </form>
      {addState.error && <p className="-mt-1 text-[14.5px] text-accent-ink">{addState.error}</p>}
    </div>
  );
}

function ShowLine({ show }: { show: ShowRow }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState(show.attendance?.toString() ?? "");
  const [photoState, photoAction, uploading] = useActionState(uploadShowPhoto, initial);

  const run = (fn: () => Promise<ShowState>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not save.");
    });

  return (
    <li className="grid gap-3 py-3.5 md:grid-cols-[120px_1fr_130px_160px_auto] md:items-center">
      <div className="caps text-[15px]">{fmt.format(new Date(show.played_on))}</div>
      <div className="text-[15px]">
        {show.venue ?? <span className="text-muted">No venue named</span>}
        {show.city && <span className="caps block text-[14px] text-muted">{show.city}</span>}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => markShow(show.id, { played: !show.played }))}
        className={`display edge cursor-pointer px-3 py-1.5 text-[14.5px] disabled:opacity-60 ${show.played ? "bg-accent text-on-accent" : "bg-panel"}`}
        aria-pressed={show.played}
      >
        {show.played ? "Played" : "Mark played"}
      </button>
      <label className="caps text-[14px]">
        Attendance
        <input
          inputMode="numeric"
          value={attendance}
          onChange={(e) => setAttendance(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
          onBlur={() => {
            const n = attendance === "" ? null : Number(attendance);
            if (n !== (show.attendance ?? null)) run(() => markShow(show.id, { attendance: n }));
          }}
          className="edge mt-0.5 w-full bg-ground px-2 py-1 text-[15px]"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {show.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={show.photo_url} alt="" className="edge h-[44px] w-[44px] object-cover" />
        ) : null}
        <form action={photoAction} className="flex items-center gap-2">
          <input type="hidden" name="show_id" value={show.id} />
          <label className="caps cursor-pointer text-[14px] text-accent-ink">
            {show.photo_url ? "Swap photo" : "Add a photo"}
            <input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => e.target.form?.requestSubmit()}
              disabled={uploading}
            />
          </label>
          {uploading && <span className="caps text-[14px] text-muted">Uploading</span>}
        </form>
        <button type="button" disabled={pending} onClick={() => run(() => removeShow(show.id))} className="caps cursor-pointer text-[14px] text-muted hover:text-accent-ink">
          Remove
        </button>
      </div>
      {(error || photoState.error) && <p className="text-[14px] text-accent-ink md:col-span-5">{error ?? photoState.error}</p>}
    </li>
  );
}
