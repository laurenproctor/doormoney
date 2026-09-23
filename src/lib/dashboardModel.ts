/**
 * What the musician's dashboard shows, worked out from rows the database already holds.
 *
 * Pure on purpose: no Supabase, no request, nothing server-only, so tests/dashboard.test.ts can
 * run the arithmetic and the mappings without a database. src/lib/dashboard.ts does the reading
 * and hands its rows through here.
 *
 * Every number below is integer cents, and every one of them is derived from something recorded.
 * There is no goal column, so there is no percent to goal. There is no ledger, so nothing here is
 * an available balance. A price on an unsold lot is an asking price, not money, and never counts.
 */
import { categoryWords } from "@/lib/category-words";
import { runPath } from "@/lib/urls";

/* ---------------------------------------------------------------------------------------------
   Lifecycle
   --------------------------------------------------------------------------------------------- */

export type RunStatus = "draft" | "open" | "live" | "closed" | "cancelled";

/**
 * The database word on the left, the word a musician reads on the right. "closed" is the only one
 * that changes meaning in the telling: the fundraiser is over and done, so it reads Complete.
 */
export const LIFECYCLE_LABELS: Record<RunStatus, string> = {
  draft: "Draft",
  open: "Open",
  live: "Live",
  closed: "Complete",
  cancelled: "Cancelled",
};

export function lifecycleLabel(status: string): string {
  return LIFECYCLE_LABELS[status as RunStatus] ?? "Draft";
}

/**
 * The strip along the top. Cancelled is deliberately absent: it is an ending, not a stage, and
 * drawing it as the last step would suggest every fundraiser passes through it.
 *
 * There is no Fulfillment step either. Nothing in the database records one, and inventing a status
 * the rows cannot back would make the strip lie. Work still outstanding is shown as work, next to
 * the show it belongs to.
 */
export const LIFECYCLE_STEPS: readonly RunStatus[] = ["draft", "open", "live", "closed"];

/** Which step a fundraiser is on, or null when it is cancelled and on none of them. */
export function lifecycleIndex(status: string): number | null {
  const i = LIFECYCLE_STEPS.indexOf(status as RunStatus);
  return i === -1 ? null : i;
}

/* ---------------------------------------------------------------------------------------------
   Money
   --------------------------------------------------------------------------------------------- */

export type SettledRow = { amount_cents: number; refunded_cents: number; payment_status: string };

/** Anything past requires_payment has been charged, whatever happened to it afterwards. */
export function isSettled(paymentStatus: string): boolean {
  return paymentStatus !== "requires_payment";
}

/** What is left of one payment after refunds. Never negative, however the columns drift. */
export function netCents(row: SettledRow): number {
  if (!isSettled(row.payment_status)) return 0;
  return Math.max(0, row.amount_cents - row.refunded_cents);
}

/**
 * Gross raised: every purchase and backing that was actually charged, less what went back.
 * A fully refunded row nets to zero and stays in the sum rather than being filtered out, so the
 * arithmetic is the same whichever way a refund was recorded.
 */
export function raisedCents(rows: SettledRow[]): number {
  return rows.reduce((total, row) => total + netCents(row), 0);
}

export type PayoutRow = { amount_cents: number; status: string };
export type PayoutTotals = { paidCents: number; scheduledCents: number; pausedCents: number };

/**
 * The payout schedule, grouped.
 *
 * "skipped" is left out of all three: those are slices a refund cancelled, so counting them would
 * promise money that is no longer going anywhere. None of these is a balance; they are what the
 * schedule says has gone, is going, and has been stopped.
 */
export function groupPayouts(rows: PayoutRow[]): PayoutTotals {
  const totals: PayoutTotals = { paidCents: 0, scheduledCents: 0, pausedCents: 0 };
  for (const row of rows) {
    if (row.status === "paid") totals.paidCents += row.amount_cents;
    else if (row.status === "scheduled") totals.scheduledCents += row.amount_cents;
    else if (row.status === "paused") totals.pausedCents += row.amount_cents;
  }
  return totals;
}

/* ---------------------------------------------------------------------------------------------
   Dates. Postgres date columns are calendar days, so they are compared as calendar days in UTC
   and never turned into local time, where a timezone west of UTC would read yesterday.
   --------------------------------------------------------------------------------------------- */

/** "2026-09-12" as UTC midnight, or null when it is not a date at all. */
export function utcDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const DAY = 86_400_000;

/** Whole days from today to the last date, floored at zero. The last day counts as one. */
export function daysRemaining(endsOn: string, today: Date): number {
  const end = utcDay(endsOn);
  if (end === null) return 0;
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((end - now) / DAY));
}

/* ---------------------------------------------------------------------------------------------
   Shows
   --------------------------------------------------------------------------------------------- */

export type ShowRow = {
  id: string;
  played_on: string;
  venue: string | null;
  city: string | null;
  played: boolean;
  attendance: number | null;
  photo_url: string | null;
};

/** The next date the musician has to be somewhere: the earliest show still to come. */
export function upcomingShow(shows: ShowRow[], today: Date): ShowRow | null {
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ahead = shows
    .filter((s) => {
      const day = utcDay(s.played_on);
      return day !== null && day >= now;
    })
    .sort((a, b) => (utcDay(a.played_on) ?? 0) - (utcDay(b.played_on) ?? 0));
  return ahead[0] ?? null;
}

export function playedCount(shows: ShowRow[]): number {
  return shows.filter((s) => s.played).length;
}

/* ---------------------------------------------------------------------------------------------
   Sponsorship work
   --------------------------------------------------------------------------------------------- */

export type LogoState = "waiting" | "review" | "approved" | "declined";

/** The logo, in the musician's words. Driven by purchases.mark_status and nothing else. */
export const LOGO_LABELS: Record<LogoState, string> = {
  waiting: "Waiting for logo",
  review: "Needs review",
  approved: "Approved",
  declined: "Declined and refunded",
};

/**
 * The same four states for any category. `mark_status` means "the organizer accepted the sponsor's
 * materials", whatever they are, and only music calls them a logo. Music's labels are LOGO_LABELS,
 * unchanged; every other category, and one nobody has named yet, says "materials".
 */
export function materialsLabels(categoryKey: string | null | undefined): Record<LogoState, string> {
  return { ...LOGO_LABELS, waiting: `Waiting for ${categoryWords(categoryKey).materials}` };
}

export function logoState(markStatus: string): LogoState {
  if (markStatus === "submitted") return "review";
  if (markStatus === "approved") return "approved";
  if (markStatus === "declined") return "declined";
  return "waiting";
}

/** What happened to the money, in the musician's words. */
export function paymentLabel(paymentStatus: string): string {
  switch (paymentStatus) {
    case "held":
      return "Paid, held";
    case "released":
      return "Paid out";
    case "refunded":
      return "Refunded";
    case "partially_refunded":
      return "Partly refunded";
    default:
      return "Awaiting payment";
  }
}

export type WorkRow = {
  id: string;
  sponsor: string;
  option: string;
  amountCents: number;
  logo: LogoState;
  paymentStatus: string;
  markNote: string | null;
  markText: string | null;
  markUrl: string | null;
};

/**
 * The one action worth offering on a row.
 *
 * A submitted logo is the only thing the musician has to decide, so it is the only row that gets a
 * decision. Everything else links to the record, which already exists for every purchase and shows
 * the dates, the rooms and the money. There is no proof to upload against a purchase: nothing in
 * the schema stores one, so offering it would be a button that cannot work.
 */
export type WorkAction = { kind: "review"; label: string } | { kind: "record"; label: string; href: string };

export function workAction(row: WorkRow, categoryKey: string | null | undefined = "music"): WorkAction {
  if (row.logo === "review") return { kind: "review", label: `Review ${categoryWords(categoryKey).materials}` };
  return { kind: "record", label: "View record", href: `/record/${row.id}` };
}

export type WorkFilter = "all" | LogoState;

export function filterWork(rows: WorkRow[], query: string, filter: WorkFilter): WorkRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter !== "all" && row.logo !== filter) return false;
    if (!needle) return true;
    return row.sponsor.toLowerCase().includes(needle) || row.option.toLowerCase().includes(needle);
  });
}

/** Badge numbers, counted off the rows themselves so they cannot disagree with the table. */
export function workCounts(rows: WorkRow[]): Record<WorkFilter, number> {
  const counts: Record<WorkFilter, number> = { all: rows.length, waiting: 0, review: 0, approved: 0, declined: 0 };
  for (const row of rows) counts[row.logo] += 1;
  return counts;
}

/* ---------------------------------------------------------------------------------------------
   What is worth doing before the next show
   --------------------------------------------------------------------------------------------- */

export type PrepItem = { key: string; label: string; href: string; count: number };

/** "1 logo" and "2 logos", so a count of one does not read like a typo. */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Preparation, derived rather than remembered.
 *
 * Every line is a count of rows that are in a state somebody can act on, and a link to where that
 * work is done. Nothing here is a checkbox: the schema records no completion, so a tick would be a
 * claim that survives nothing. An item disappears when the rows it counted stop being in that
 * state, which is the only honest version of "done".
 *
 * The last two only appear when the fundraiser promised them. Asking for attendance on a
 * fundraiser that never offered attendance estimates would be inventing an obligation.
 */
export function preparationItems(input: {
  work: WorkRow[];
  shows: ShowRow[];
  runId: string;
  promisedAttendance: boolean;
  promisedShowPhotos: boolean;
}): PrepItem[] {
  const { work, shows, runId, promisedAttendance, promisedShowPhotos } = input;
  const runHref = `/dashboard/runs/${runId}`;
  const items: PrepItem[] = [];

  const toReview = work.filter((w) => w.logo === "review").length;
  if (toReview) items.push({ key: "review", label: `${plural(toReview, "logo", "logos")} waiting for your review`, href: "#sponsorship-work", count: toReview });

  const noLogo = work.filter((w) => w.logo === "waiting" && isSettled(w.paymentStatus)).length;
  if (noLogo) items.push({ key: "no-logo", label: `paid ${plural(noLogo, "sponsorship", "sponsorships")} with no logo yet`, href: "#sponsorship-work", count: noLogo });

  const missingPlace = shows.filter((s) => !s.venue?.trim() || !s.city?.trim()).length;
  if (missingPlace) items.push({ key: "place", label: `${plural(missingPlace, "show", "shows")} missing a venue or city`, href: `${runHref}#shows`, count: missingPlace });

  if (promisedAttendance) {
    const missing = shows.filter((s) => s.played && s.attendance === null).length;
    if (missing) items.push({ key: "attendance", label: `played ${plural(missing, "show", "shows")} with no attendance recorded`, href: `${runHref}#shows`, count: missing });
  }

  if (promisedShowPhotos) {
    const missing = shows.filter((s) => s.played && !s.photo_url).length;
    if (missing) items.push({ key: "photo", label: `played ${plural(missing, "show", "shows")} with no photo yet`, href: `${runHref}#shows`, count: missing });
  }

  return items;
}

/* ---------------------------------------------------------------------------------------------
   Where the sidebar goes
   --------------------------------------------------------------------------------------------- */

export type NavItem = { href: string; label: string };
export type NavSection = { title: string; items: NavItem[] };

/**
 * The sidebar: the two ways of taking part, and the one account behind both.
 *
 * **Creating** and **Supporting** are the participation modes, not two accounts and not two
 * identities. There used to be an "Organizer profile" in one and a "Patron profile" in the other,
 * which read as two profiles for two people. There is one Profile now, at /dashboard/profile, and
 * it holds all three parts: who the account holder is, what they organize, and what they support.
 * /dashboard/act still edits the organizer's own record and is reached from there.
 *
 * The labels are the Desk register's: Today, Fundraisers, Money, Backed by you. Short, sentence
 * case, and named for the destination rather than for the reader ("Home" told nobody what was on
 * it). The addresses under them did not move.
 *
 * The widget is not a destination here. It is one organizer's embed snippet for one fundraiser,
 * so it belongs beside that fundraiser, under Share, rather than in the list of places to go.
 * /dashboard/widget is still a route, because sent links point at it.
 */
export function dashboardNav({ hasAct, roles }: { hasAct: boolean; roles: readonly string[] }): NavSection[] {
  // "organizer" is the role Expansion Phase 2 writes; "musician" is the one accounts made before it
  // carry. Either means somebody who raises money here, and owning an act settles it regardless.
  const organizer = hasAct || roles.includes("organizer") || roles.includes("musician");
  const sections: NavSection[] = [];

  if (organizer) {
    sections.push({
      title: "Creating",
      items: [
        { href: "/dashboard", label: "Today" },
        { href: "/dashboard/runs", label: "Fundraisers" },
        { href: "/dashboard/payouts", label: "Money" },
      ],
    });
  }

  // Always there. Somebody who raises money and backs the band down the street should not have to
  // change a setting to see it, and for anyone who has backed nothing it reads as an invitation.
  sections.push({ title: "Supporting", items: [{ href: "/patron", label: "Backed by you" }] });

  // One profile, one account. The profile comes first: it is the identity, and the account page
  // behind it is the email address, the password and what Door Money sends.
  sections.push({
    title: "Account",
    items: [
      { href: "/dashboard/profile", label: "Profile" },
      { href: "/dashboard/account", label: "Settings" },
    ],
  });
  return sections;
}

/**
 * Pages that belong to a nav item without living under its address.
 *
 * The organizer's own record is edited at /dashboard/act, which is older than the one Profile it
 * is now part of. The address stays (sent links, saveAct's redirect), and the sidebar says where
 * the reader is rather than going blank.
 */
const NAV_HOME: Record<string, string> = {
  "/dashboard/act": "/dashboard/profile",
  "/dashboard/act/new": "/dashboard/profile",
  // The patron page's own workspace. It is one part of Profile, not a fourth thing in the sidebar.
  "/dashboard/profile/patron": "/dashboard/profile",
};

/** The section a path belongs to, so one nav item is marked current on child routes too. */
export function currentNavHref(pathname: string, sections: NavSection[]): string | null {
  const all = sections.flatMap((s) => s.items.map((i) => i.href));
  const adopted = NAV_HOME[pathname];
  if (adopted && all.includes(adopted)) return adopted;
  const exact = all.find((href) => href === pathname);
  if (exact) return exact;
  // /dashboard/runs/<id> lights Fundraisers; /dashboard on its own must not light everything.
  const nested = all
    .filter((href) => href !== "/dashboard" && pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length);
  return nested[0] ?? null;
}

/* ---------------------------------------------------------------------------------------------
   Looking at the fundraiser
   --------------------------------------------------------------------------------------------- */

export type PreviewTarget = { kind: "preview" | "public"; path: string; label: string };

/**
 * Where "Preview" goes, and what "Share" copies.
 *
 * A draft has no public address yet, so it goes to the private preview. Anything published goes to
 * the address patrons actually use. Sharing a draft would hand somebody a 404, so the caller is
 * told which kind it is and can withhold the share control.
 */
export function previewTarget(run: { id: string; slug: string; status: string }, actSlug: string): PreviewTarget {
  if (run.status === "draft") {
    return { kind: "preview", path: `/dashboard/runs/${run.id}/preview`, label: "Preview draft" };
  }
  return { kind: "public", path: runPath(actSlug, run.slug), label: "View fundraiser" };
}

export function isShareable(status: string): boolean {
  return status === "open" || status === "live" || status === "closed";
}

/** Newest first, and never a cancelled one: the selector offers what can still be worked on. */
export function selectableRuns<T extends { status: string; starts_on: string }>(runs: T[]): T[] {
  return runs
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => (utcDay(b.starts_on) ?? 0) - (utcDay(a.starts_on) ?? 0));
}

/** The one to show when nothing was asked for: the newest that is still running, else the newest. */
export function defaultRun<T extends { status: string; starts_on: string }>(runs: T[]): T | null {
  const usable = selectableRuns(runs);
  return usable.find((r) => r.status === "open" || r.status === "live") ?? usable[0] ?? null;
}
