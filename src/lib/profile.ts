/**
 * The rules behind a patron's optional public profile.
 *
 * Pure on purpose: the same limits are read by the editor in the dashboard, by the server action
 * that writes the row, and by the tests, so what a patron is told and what the database will take
 * cannot drift. The database repeats every one of these as a constraint (migration 0022), because
 * a form is a courtesy and a constraint is the rule.
 *
 * Nothing here knows about money. No amount reaches a public profile, so no amount passes through
 * this file. See docs/DECISIONS.md, decision 11.
 */
import { z } from "zod";
import { safeWebsite } from "@/lib/links";

export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const BIO_MAX = 240;
export const LOCATION_MAX = 80;
export const INTEREST_MAX = 40;
export const INTERESTS_MAX = 8;

/** Twelve calendar months, counted from the day the current username was claimed. */
export const USERNAME_MONTHS = 12;

// ---------------------------------------------------------------
// Music preferences
// ---------------------------------------------------------------

/**
 * What a patron listens for, from the lines they typed. Genres, scenes, instruments, traditions:
 * no taxonomy, just short words in their own hand.
 *
 * Commas and line breaks both separate. Whitespace inside an entry collapses to single spaces,
 * blank lines fall away, and a word said twice is refused rather than quietly deduplicated, so
 * nobody saves a list that is not the list they typed.
 */
export type InterestsResult = { items: string[]; error?: string };

export function parseInterests(raw: string | string[] | null | undefined): InterestsResult {
  const source = Array.isArray(raw) ? raw.join("\n") : (raw ?? "");
  const items: string[] = [];
  const seen = new Set<string>();
  for (const piece of source.split(/[\n,]/)) {
    const value = piece.replace(/\s+/g, " ").trim();
    if (!value) continue;
    if (value.length > INTEREST_MAX) {
      return { items, error: `Keep each one under ${INTEREST_MAX} characters. "${value.slice(0, 20)}..." is longer.` };
    }
    const key = value.toLowerCase();
    if (seen.has(key)) return { items, error: `"${value}" is on the list twice.` };
    seen.add(key);
    items.push(value);
  }
  if (items.length > INTERESTS_MAX) return { items, error: `Up to ${INTERESTS_MAX} at a time. That is ${items.length}.` };
  return { items };
}

/** The lines to put back in the editor's box after a save. */
export function interestsText(items: string[] | null | undefined): string {
  return (items ?? []).join("\n");
}

// ---------------------------------------------------------------
// The profile's own fields
// ---------------------------------------------------------------

export type ProfileField = "display_name" | "bio" | "location" | "website" | "interests" | "photo" | "form";

/**
 * A link a patron may put on the page. https only, and parsed rather than trusted: what renders is
 * what the URL parser understood. http, javascript, data and the rest never reach an href.
 */
export function profileLink(raw: string | null | undefined): string | null {
  const url = safeWebsite(raw);
  if (!url) return null;
  return url.startsWith("https://") ? url : null;
}

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v ? v : null));

export const ProfileDetails = z.object({
  display_name: z
    .string()
    .trim()
    .min(NAME_MIN, "Enter a name.")
    .max(NAME_MAX, `Keep the name under ${NAME_MAX} characters.`),
  bio: optional(BIO_MAX, `Keep the bio under ${BIO_MAX} characters.`),
  location: optional(LOCATION_MAX, `Keep the city or region under ${LOCATION_MAX} characters.`),
  website: z
    .string()
    .trim()
    .max(200, "Keep the link under 200 characters.")
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || profileLink(v) !== null, "Enter a full address starting with https://.")
    .transform((v) => (v === null ? null : profileLink(v))),
});

export type ProfileDetailsInput = z.infer<typeof ProfileDetails>;

// ---------------------------------------------------------------
// The username, and the year between changes
// ---------------------------------------------------------------

/**
 * The day the next username change is allowed: twelve calendar months after the current word was
 * claimed. Calendar months, not a fixed number of days, so a word taken on 29 February moves to
 * the last day of the following February rather than drifting.
 */
export function nextUsernameChange(setAt: string | Date | null | undefined): Date | null {
  if (!setAt) return null;
  const from = setAt instanceof Date ? setAt : new Date(setAt);
  if (Number.isNaN(from.getTime())) return null;
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + USERNAME_MONTHS);
  // Rolled past the end of a shorter month: pull it back to that month's last day.
  if (next.getUTCDate() < day) next.setUTCDate(0);
  return next;
}

/** Whether the word may move yet. An account that has never claimed one always may. */
export function usernameChangeAllowed(setAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  const next = nextUsernameChange(setAt);
  return next === null || now.getTime() >= next.getTime();
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function formatDay(date: Date): string {
  return dayFormat.format(date);
}

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "September 2026". A public page says the month, never the minute. */
export function formatMonth(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : monthFormat.format(date);
}

/** The year on "Patron since". */
export function yearOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : String(date.getUTCFullYear());
}

// ---------------------------------------------------------------
// Support, as the public page says it
// ---------------------------------------------------------------

export type SupportKind = "placement" | "backing";

/** Door Money's words for the two ways a patron puts money behind a run. */
export const SUPPORT_LABEL: Record<SupportKind, string> = {
  placement: "Placement",
  backing: "Backing",
};

/** The initials behind a patron with no photograph. Never more than two letters. */
export function initialsFor(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

/** "3 runs backed", "2 musicians supported": the only totals a public profile carries. */
export function impactTotals(activity: { actSlug: string; runTitle: string; actName: string }[]): string[] {
  if (activity.length === 0) return [];
  const runs = new Set(activity.map((a) => `${a.actSlug}::${a.runTitle}`)).size;
  const acts = new Set(activity.map((a) => a.actSlug)).size;
  return [
    `${runs} ${runs === 1 ? "run" : "runs"} backed`,
    `${acts} ${acts === 1 ? "musician" : "musicians"} supported`,
  ];
}
