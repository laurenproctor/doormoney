import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

/*
  The one gate on Door Money staff.

  Two things have to be true before a session is staff: the address is on ADMIN_EMAILS, and the
  address has been confirmed. Until 2026-09-23 only the first was asked, and the local config
  ships with email confirmation off, so anyone who signed up with an address on the list, without
  owning it, got /admin and the service-role actions behind it (removing another account's
  two-factor app among them). Confirmation is what ties the address to the person, so it is part
  of the decision now.

  The user it decides on comes from `requireUser`, which asks Supabase through `auth.getUser()`:
  the server verifies the session and answers with the account as it is, `email_confirmed_at`
  included. Never decide from the session cookie's own claims: they are only what the browser
  sent.

  Every page and every server action that is for staff goes through `requireAdmin`, and nothing
  reads ADMIN_EMAILS for a decision anywhere else. The digest in src/lib/weekly.ts reads the list
  to know who to write to, which is not a decision about access.
*/

/** The shape of the decision: the two fields of a Supabase user that it reads. */
export type AdminCandidate = { email?: string | null; email_confirmed_at?: string | null };

/** Comma-separated addresses, trimmed and lower-cased, with empty entries dropped. */
export function parseAdminEmails(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** The addresses in ADMIN_EMAILS. Empty when the variable is missing or blank: then nobody is staff. */
export function adminEmails() {
  return parseAdminEmails(process.env.ADMIN_EMAILS);
}

/**
 * Whether this account is Door Money staff: a confirmed email that is on the list. Pure, so the
 * rule can be tested without a session; `admins` defaults to the environment.
 */
export function isAdminUser(user: AdminCandidate | null | undefined, admins: Set<string> = adminEmails()): boolean {
  if (!user || !user.email_confirmed_at) return false;
  const email = user.email?.trim().toLowerCase() ?? "";
  return email.length > 0 && admins.has(email);
}

/**
 * The staff account behind the request, or a 404. Anyone else gets a 404, not a hint. Call it
 * first in every admin page and every admin server action, before any input is read: an action
 * refuses on its own and never relies on the page being unreachable.
 */
export async function requireAdmin() {
  const user = await requireUser("/admin");
  if (!isAdminUser(user)) notFound();
  return user;
}
