import Link from "next/link";
import { Checkmark } from "@/components/dashboard/icons";
import { formatDay } from "@/lib/dates";
import { upcomingShow, type ShowRow } from "@/lib/dashboardModel";

/**
 * Music's dates, end to end, as one strip of circles.
 *
 * This is music's and stays music's, the way `ShowsPanel` is: a season, a production run and a
 * dinner series are dated too, but they are not eighteen evenings in a row and a strip is the
 * wrong picture for them. Another category gets its own picture or none.
 *
 * Nothing here is invented. Every circle is a row, the day under it is that row's date, and with
 * no rows there is no strip: an empty strip would draw a tour nobody has booked. A date missing a
 * venue or a city is the one thing that asks for attention, and it links to where it is fixed.
 */
const monthShort = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const dayNumber = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });

const utc = (on: string) => new Date(`${on}T00:00:00Z`);

export function RunStrip({
  shows,
  href = "#shows",
  today = new Date(),
  className = "",
}: {
  shows: ShowRow[];
  /** Where a date that is missing something sends somebody. */
  href?: string;
  today?: Date;
  className?: string;
}) {
  const dated = shows.filter((s) => s.played_on).sort((a, b) => a.played_on.localeCompare(b.played_on));
  if (dated.length === 0) return null;

  const next = upcomingShow(dated, today);
  const first = utc(dated[0].played_on);
  const last = utc(dated[dated.length - 1].played_on);
  const spansTwoMonths = monthLong.format(first) !== monthLong.format(last);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative pt-2">
        <span aria-hidden="true" className="absolute left-0 right-0 top-[17px] h-px bg-line" />
        <ol className="relative m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${dated.length}, minmax(0,1fr))` }}>
          {dated.map((show) => {
            const on = utc(show.played_on);
            const incomplete = !show.venue || !show.city;
            const isNext = !show.played && next?.id === show.id;
            const day = dayNumber.format(on);
            const tone = incomplete ? "text-attention-ink" : isNext ? "text-ink" : "text-muted";
            return (
              <li key={show.id} className="flex flex-col items-center gap-1.5">
                {show.played ? (
                  <span aria-hidden="true" className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ok text-on-accent">
                    <Checkmark size={12} />
                  </span>
                ) : incomplete ? (
                  <Link
                    href={href}
                    aria-label={`${formatDay(show.played_on)}, missing a ${show.venue ? "city" : "venue"}`}
                    className="block h-[18px] w-[18px] rounded-full border-[1.5px] border-attention-ink"
                  />
                ) : isNext ? (
                  <span aria-hidden="true" className="block h-[18px] w-[18px] rounded-full bg-ok shadow-[0_0_0_4px_var(--ok-wash)]" />
                ) : (
                  <span aria-hidden="true" className="block h-[18px] w-[18px] rounded-full border-[1.5px] border-field-line bg-surface" />
                )}
                <span className={`text-[14px] tabular-nums ${tone}`}>
                  <span className="sr-only">{monthShort.format(on)} </span>
                  {day}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex justify-between text-[14px] text-muted">
        <span>{monthLong.format(first)}</span>
        {spansTwoMonths && <span>{monthLong.format(last)}</span>}
      </div>
    </div>
  );
}
