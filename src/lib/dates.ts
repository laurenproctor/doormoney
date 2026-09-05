// Date formatting for run copy. Runs are date-only strings from Postgres; close times are timestamps in New York time.

const NY = "America/New_York";
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const stampDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: NY });

/** "Oct 3 to Nov 2". Date-only strings are read as UTC so they never drift a day. */
export function formatDateRange(startsOn: string, endsOn: string) {
  return `${shortDay.format(new Date(startsOn))} to ${shortDay.format(new Date(endsOn))}`;
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
