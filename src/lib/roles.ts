/**
 * What an account can do here.
 *
 * Nobody chooses a side to get in. One account creates fundraisers, supports them, or does both,
 * so a new account is opened with both capabilities and keeps them. A role is a product
 * capability rather than an authorization boundary: it decides which action a page leads with,
 * never what the account is allowed to reach. Nothing takes a role away.
 *
 * `musician` is the role accounts made before Expansion Phase 2 carry. It is read everywhere
 * `organizer` is read and is never dropped from a row.
 *
 * See docs/DECISIONS.md, decision 10.
 */
import { z } from "zod";
import type { Intent } from "@/lib/intent";
import { UNIFIED_HOME } from "@/lib/intent";

export const ROLES = [
  {
    key: "organizer",
    /** The capability, named as the action it is. */
    label: "Create a fundraiser",
    blurb: "Say what the funding enables and what a sponsor receives, choose what to offer, and set your own prices.",
    /** The first step for an account that has not used this capability yet. */
    start: "/dashboard/act/new",
    /** The intent that leads with this capability. */
    intent: "creator",
  },
  {
    key: "patron",
    label: "Find something to support",
    blurb: "Sponsor a placement or back the work, and keep every sponsorship, backing and record in one place.",
    start: "/fundraisers",
    intent: "patron",
  },
] as const satisfies readonly { key: string; label: string; blurb: string; start: string; intent: Intent }[];

export type Role = (typeof ROLES)[number]["key"] | "musician";

const KEYS: readonly Role[] = ["musician", "organizer", "patron"];

export function isRole(value: string): value is Role {
  return (KEYS as readonly string[]).includes(value);
}

/** Roles arriving from anywhere outside the server: known keys only, in a stable order, never empty. */
export const RolesInput = z
  .array(z.string().trim())
  .transform((list) => KEYS.filter((k) => list.includes(k)))
  .refine((list) => list.length > 0, "Pick at least one, or both.");

/**
 * What every new account is opened with, whichever door it came through.
 *
 * Both capabilities, because the bassoonist who backs the band down the street is one person and
 * should not have to declare which one they are before they have seen the place. It goes through
 * RolesInput so the one guard that keeps a roles array known and non-empty is also the guard on
 * what a new account gets. The database holds the same floor: migration 0051.
 */
export const DEFAULT_ROLES: readonly Role[] = RolesInput.parse(["organizer", "patron"]);

export function hasRole(roles: string[] | null | undefined, role: Role) {
  return (roles ?? []).includes(role);
}

/**
 * Where to send an account once it is in.
 *
 * One landing for everybody. The dashboard is where both capabilities are offered, so an account
 * with no fundraiser yet is not pushed into creating one and an account that came here to support
 * work is not pushed away from the side with money on it. An explicit destination still wins:
 * safeNext in src/lib/auth.ts decides that before this is ever consulted.
 */
export function homeFor(account?: { roles?: string[] | null; hasAct?: boolean }) {
  void account;
  return UNIFIED_HOME;
}

// ---------------------------------------------------------------
// The bar across the top of the dashboard.
// ---------------------------------------------------------------

const MUSICIAN_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/act", label: "Organizer" },
  { href: "/dashboard/payouts", label: "Payouts" },
  // The widget, named for what it does. Dropped from the site nav (decision 14) and kept here,
  // because it is only worth anything to somebody who already has a fundraiser to embed. The
  // snippet itself is on the overview; this is the page that explains where to paste it.
  { href: "/widget", label: "On your site" },
] as const;

const PATRON_LINKS = [
  { href: "/patron", label: "Backed" },
  // One profile for the whole account, not a second one for a second person. dashboardNav in
  // src/lib/dashboardModel.ts is what the workspace actually renders; this flat list is what the
  // older shell took and is kept for callers that still pass it.
  { href: "/dashboard/profile", label: "Profile" },
] as const;
const ACCOUNT_LINK = { href: "/dashboard/account", label: "Account" } as const;

export type DashboardLink = { href: string; label: string };

/**
 * The pages an account can reach, from what it does rather than what it said at sign-up.
 *
 * An account that owns an act, or came here to play, gets the board pages. Backed and Profile are
 * always there: a musician who backs the band down the street should not have to change a setting
 * to see it, and for anyone who has backed nothing it reads as an invitation. The profile itself
 * stays private until the patron publishes it.
 */
export function dashboardLinks({ hasAct, roles }: { hasAct: boolean; roles: string[] }): DashboardLink[] {
  const musician = hasAct || roles.includes("musician") || roles.includes("organizer");
  return [...(musician ? MUSICIAN_LINKS : []), ...PATRON_LINKS, ACCOUNT_LINK];
}

/** What a dashboard page shows when it has not worked out the account's roles. */
export const DEFAULT_DASHBOARD_LINKS: DashboardLink[] = [...MUSICIAN_LINKS, ...PATRON_LINKS, ACCOUNT_LINK];

