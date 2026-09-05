/**
 * What a fundraiser's period is called, in words.
 *
 * Decision 14 retired "run" from copy and asked for the actual period by name instead: a tour, a
 * season, a residency. `runs.kind` still stores which one, so this is the single place that turns
 * that column into the words a reader sees, the way src/lib/verification.ts holds the words for
 * what a musician promises.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */

export type Period = {
  /** "tour". For "Back the tour", "as the tour goes on". */
  noun: string;
  /** "shows". For "12 shows, Oct 3 to Nov 2". */
  units: string;
  /** "show". For "a record of every show". */
  unit: string;
  /** "shows on the tour". A stat label, where the period needs naming as well as counting. */
  counted: string;
};

const PERIODS: Record<string, Period> = {
  tour: { noun: "tour", units: "shows", unit: "show", counted: "shows on the tour" },
  season: { noun: "season", units: "gigs", unit: "gig", counted: "gigs a season" },
  residency: { noun: "residency", units: "nights", unit: "night", counted: "nights of the residency" },
};

/**
 * The words for a stored kind. A kind the app does not know falls back to the tour wording rather
 * than to "run", which is the one word none of these may be.
 */
export function periodOf(kind: string | null | undefined): Period {
  return PERIODS[kind ?? ""] ?? PERIODS.tour;
}
