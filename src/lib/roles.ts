/**
 * What an account is here to do.
 *
 * A person can be both, and often is: the bassoonist who backs the band down the street signs in
 * once. So a role is never exclusive and is never taken away. It is stated at sign-up and gained
 * afterwards by doing the thing, listing an act or backing a run.
 *
 * See docs/DECISIONS.md, decision 10.
 */
import { z } from "zod";

export const ROLES = [
  {
    key: "musician",
    /** On the sign-up card. What the person is, not what the system calls them. */
    label: "I play",
    blurb: "Open a board, price the spots, get paid weekly through the run.",
    /** Where an account with this role and nothing else belongs after signing in. */
    home: "/dashboard",
  },
  {
    key: "patron",
    label: "I back musicians",
    blurb: "Take a placement or back a run, and keep a record of every one.",
    home: "/patron",
  },
] as const;

export type Role = (typeof ROLES)[number]["key"];

const KEYS: readonly Role[] = ROLES.map((r) => r.key);

export function isRole(value: string): value is Role {
  return (KEYS as readonly string[]).includes(value);
}

/** What the sign-up form sends. At least one, because the answer decides where they land. */
export const RolesInput = z
  .array(z.string().trim())
  .transform((list) => KEYS.filter((k) => list.includes(k)))
  .refine((list) => list.length > 0, "Pick at least one, or both.");

export function hasRole(roles: string[] | null | undefined, role: Role) {
  return (roles ?? []).includes(role);
}

/**
 * Where to send an account after it signs in.
 *
 * What they own beats what they said: an account that owns an act goes to the act dashboard even
 * if it only ever ticked "I back musicians", because the board is the thing with money on it.
 */
export function homeFor({ roles, hasAct }: { roles: string[] | null | undefined; hasAct: boolean }) {
  if (hasAct) return "/dashboard";
  if (hasRole(roles, "musician")) return "/dashboard";
  if (hasRole(roles, "patron")) return "/patron";
  return "/dashboard";
}

// ---------------------------------------------------------------
// The bar across the top of the dashboard.
// ---------------------------------------------------------------

const MUSICIAN_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/act", label: "The act" },
  { href: "/dashboard/payouts", label: "Payouts" },
] as const;

const PATRON_LINKS = [
  { href: "/patron", label: "Backed" },
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
  const musician = hasAct || roles.includes("musician");
  return [...(musician ? MUSICIAN_LINKS : []), ...PATRON_LINKS, ACCOUNT_LINK];
}

/** What a dashboard page shows when it has not worked out the account's roles. */
export const DEFAULT_DASHBOARD_LINKS: DashboardLink[] = [...MUSICIAN_LINKS, ...PATRON_LINKS, ACCOUNT_LINK];
