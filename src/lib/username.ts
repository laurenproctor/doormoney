import type { SupabaseClient } from "@supabase/supabase-js";
import { RESERVED_SLUGS, SLUG_RE } from "@/lib/slug";

/**
 * A handle. For a musician it is the sign-in name and the board address at once: whoever holds
 * `gutter-hymns` signs in as that and their board is at /board/gutter-hymns. For a patron it is the
 * address of their public profile. One namespace either way, so a handle has to pass the same rules
 * a slug does.
 *
 * Whether a word is free, and whether it may move yet, is decided by `claim_username` in migration
 * 0024 rather than here: those two questions have to be answered and acted on in one transaction,
 * or two people racing for one word can both be told yes.
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
