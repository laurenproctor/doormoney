import type { SupabaseClient } from "@supabase/supabase-js";
import { RESERVED_SLUGS, SLUG_RE } from "@/lib/slug";

/**
 * A musician's handle. It is the sign-in name and the board address at once:
 * whoever holds `gutter-hymns` signs in as that and their board is at /board/gutter-hymns.
 * So a handle has to pass the same rules a slug does, and the two share one namespace.
 */

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

/** What is wrong with this handle, in words a musician can act on, or null when nothing is. */
export function usernameProblem(username: string) {
  if (username.length < 3) return "The username needs at least 3 characters.";
  if (username.length > 40) return "Keep the username under 40 characters.";
  if (!SLUG_RE.test(username)) return "Letters, digits and hyphens only, starting and ending with a letter or digit.";
  if (RESERVED_SLUGS.has(username)) return "That username is reserved. Pick another.";
  return null;
}

/**
 * Is the handle already somebody's, either as a sign-in name or as a board address?
 * Needs the service-role client: RLS shows an account only its own profile row.
 * `exceptUserId` lets an account keep the handle it already holds.
 */
export async function usernameTaken(admin: SupabaseClient, username: string, exceptUserId?: string) {
  const profiles = admin.from("profiles").select("id").eq("username", username).limit(1);
  const acts = admin.from("acts").select("owner_id").eq("slug", username).limit(1);
  const [{ data: profileRows }, { data: actRows }] = await Promise.all([profiles, acts]);

  const heldByProfile = (profileRows ?? []).some((r) => r.id !== exceptUserId);
  const heldByAct = (actRows ?? []).some((r) => !exceptUserId || r.owner_id !== exceptUserId);
  return heldByProfile || heldByAct;
}

/** The address to sign in with, for a given handle. Null when nobody holds it. */
export async function emailForUsername(admin: SupabaseClient, username: string) {
  const { data } = await admin.from("profiles").select("email").eq("username", username).maybeSingle();
  const email = (data as { email: string } | null)?.email;
  return email ? email.toLowerCase() : null;
}

/** The handle on an account, if it has one yet. */
export async function usernameFor(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
  return (data as { username: string | null } | null)?.username ?? null;
}
