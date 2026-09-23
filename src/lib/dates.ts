// Date formatting for run copy. Runs are date-only strings from Postgres; close times are timestamps in New York time.

const NY = "America/New_York";
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const stampDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: NY });
const shortDayYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 3 to Nov 2". Date-only strings are read as UTC so they never drift a day. */
export function formatDateRange(startsOn: string | null, endsOn: string | null) {
  if (!startsOn || !endsOn) return "Dates to be confirmed";
  return `${shortDay.format(new Date(startsOn))} to ${shortDay.format(new Date(endsOn))}`;
}

/**
 * "Oct 3, 2027" for one date-only string, with the year, because a delivery window and a deadline
 * can sit in a different year from the reader. Read as UTC, so a date never drifts a day.
 */
export function formatDay(on: string) {
  return shortDayYear.format(new Date(`${on}T00:00:00Z`));
}

/** "Friday" in New York time. */
export function weekdayOf(iso: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: NY }).format(new Date(iso));
}

/** "8pm ET" or "8:30pm ET" in New York time. */
export function clockOf(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: NY }).formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const minute = get("minute");
  return `${get("hour")}${minute === "00" ? "" : `:${minute}`}${get("dayPeriod").toLowerCase()} ET`;
}

/** "Friday, October 3, 2026, 8pm ET" in New York time. The whole close, spelled out. */
export function closeStamp(iso: string) {
  return `${stampDay.format(new Date(iso))}, ${clockOf(iso)}`;
}


/** "Fri, Oct 3" for one date-only string. The weekday, because the next date is a day somebody has to be somewhere. */
export function formatWeekdayDay(on: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${on}T00:00:00Z`));
}

/** One date-only string split for a date block: the day, and the month above or under it. */
export function dayAndMonth(on: string): { day: string; month: string } {
  const at = new Date(`${on}T00:00:00Z`);
  return {
    day: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(at),
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(at),
  };
}
