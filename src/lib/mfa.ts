import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Two-factor authentication, through Supabase Auth's own TOTP factors.
 *
 * An authenticator app and nothing else: no SMS, no phone number, no paid provider. Supabase
 * holds the factor and the secret; Door Money's database never sees either, and neither does any
 * log. What this file holds is the two questions the rest of the app asks: does this account have
 * a factor, and has this session passed it yet.
 *
 * The second question is the assurance level on the session's own access token. Supabase writes
 * `aal1` when a password or an email link signed somebody in, and `aal2` once a factor has been
 * verified in that session, so "signed in" and "signed in and past the code" are two different
 * states and the app can tell them apart.
 *
 * Pure on purpose: no next/navigation and no server-only import, so src/proxy.ts can use it on
 * the edge and src/lib/auth.ts can use it on a page.
 */

/** What the factor is called in the authenticator app and on the account page. */
export const TOTP_FRIENDLY_NAME = "Authenticator app";

/**
 * Two apps, not one.
 *
 * A single authenticator is a single point of failure: the phone goes in a river and the account
 * goes with it. A second factor on another device, or in a password manager, is the recovery plan
 * that needs no new concept and no stored secret of ours. Supabase refuses two factors with the
 * same friendly name, so the names are a fixed list and the next free one is taken.
 */
export const TOTP_FACTOR_NAMES = [TOTP_FRIENDLY_NAME, "Backup authenticator"] as const;
export const MAX_TOTP_FACTORS = TOTP_FACTOR_NAMES.length;

/** Where a session that has not passed its code is sent. */
export const MFA_VERIFY_PATH = "/login/verify";

/** The verify screen, carrying wherever the visitor was heading. */
export function mfaVerifyPath(next?: string | null): string {
  return next ? `${MFA_VERIFY_PATH}?next=${encodeURIComponent(next)}` : MFA_VERIFY_PATH;
}

export type TotpFactor = {
  id: string;
  /** What to call it on the account page. Never the secret, which is not in this shape at all. */
  name: string;
  addedAt: string;
};

function totpFactors(user: User | null | undefined, status: "verified" | "unverified") {
  return (user?.factors ?? []).filter((f) => f.factor_type === "totp" && f.status === status);
}

/** The factors this account can actually be challenged on. */
export function verifiedTotpFactors(user: User | null | undefined): TotpFactor[] {
  return totpFactors(user, "verified").map((f) => ({
    id: f.id,
    name: f.friendly_name?.trim() || TOTP_FRIENDLY_NAME,
    addedAt: f.created_at,
  }));
}

/**
 * Factors started and never finished.
 *
 * Somebody who opens the setup panel and closes the tab leaves one behind. It protects nothing, it
 * takes the friendly name Supabase refuses to reuse, and it is cleared before the next attempt.
 */
export function unverifiedTotpFactorIds(user: User | null | undefined): string[] {
  return totpFactors(user, "unverified").map((f) => f.id);
}

export function hasTotp(user: User | null | undefined): boolean {
  return verifiedTotpFactors(user).length > 0;
}

/** The name for the next factor, or null when both slots are taken. */
export function nextFactorName(user: User | null | undefined): string | null {
  const taken = new Set(verifiedTotpFactors(user).map((f) => f.name));
  return TOTP_FACTOR_NAMES.find((name) => !taken.has(name)) ?? null;
}

/**
 * Which of the two things somebody typed into the one code box.
 *
 * A TOTP code is six digits and nothing else. A recovery code is longer and may carry letters and
 * separators, which the Auth server ignores. Guessing here only decides which call is tried; a
 * wrong guess is refused by the server, not let through.
 */
export function looksLikeTotpCode(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  return !/[a-z]/i.test(value) && normalizeTotpCode(value).length === TOTP_CODE_LENGTH;
}

/**
 * The assurance level of the session's own token, or null when it cannot be read.
 *
 * `getAuthenticatorAssuranceLevel` reads the `aal` claim of the access token the session already
 * carries. The token was verified by `getUser()` before anything here is asked, so the claim is
 * the Auth server's word rather than the cookie's.
 */
async function sessionLevel(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    // Never the factor, never the token: only that the read failed.
    console.error("mfa: assurance level unreadable:", error.message);
    return null;
  }
  return data?.currentLevel ?? null;
}

/**
 * True when this account has a factor and this session has not passed it.
 *
 * Fails closed. A level that cannot be read is not `aal2`, so an account with a factor is asked
 * for its code rather than waved through: the cost of being wrong is one six-digit code, and the
 * cost of the other mistake is the whole point of the factor.
 */
export async function mfaPending(sb: SupabaseClient, user: User | null | undefined): Promise<boolean> {
  if (!user || !hasTotp(user)) return false;
  return (await sessionLevel(sb)) !== "aal2";
}

/** The code, as people type it: six digits, spaces and dashes ignored. */
export function normalizeTotpCode(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export const TOTP_CODE_LENGTH = 6;

/**
 * What went wrong, in words somebody can act on.
 *
 * Supabase's own messages name factors and challenges, which mean nothing to the person holding
 * the phone. The message is never specific about *which* part was wrong, because telling somebody
 * their code was the right length but the wrong number helps whoever is guessing.
 */
export function totpErrorMessage(message: string | undefined): string {
  const text = message ?? "";
  if (/rate|too many|limit/i.test(text)) return "Too many attempts. Wait a minute and try the code showing then.";
  if (/expired|not valid anymore|challenge/i.test(text)) return "That code has expired. Enter the one showing in the app now.";
  if (/invalid|incorrect|does not match|mismatch/i.test(text)) return "That code did not match. Check the app and enter the current one.";
  if (/aal2|assurance/i.test(text)) return "Enter the current six-digit code to confirm this change.";
  return "That did not work. Enter the code showing in the app now.";
}

// ---------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------

/**
 * One-time codes for the day both apps are gone.
 *
 * The API is experimental in @supabase/auth-js 2.116.0: it is off unless the client is built with
 * `experimental: { recoveryCodes: true }` (src/lib/supabase/server.ts), and the Auth server behind
 * a given project may not have the endpoint at all. So nothing here assumes it works. `known` is
 * false when the status could not be read, and the account page then says what it can rather than
 * claiming the feature is missing: generating is the real test, and it reports its own failure.
 *
 * Codes are shown once, by Supabase, at the moment they are generated. Door Money never stores
 * them, never reads them back and never logs them.
 */
export type RecoveryCodesStanding = { known: boolean; total: number; remaining: number };

export async function recoveryCodesStanding(sb: SupabaseClient): Promise<RecoveryCodesStanding> {
  try {
    const { data, error } = await sb.auth.mfa.recoveryCodes.getStatus();
    if (error || !data) return { known: false, total: 0, remaining: 0 };
    return { known: true, total: data.total, remaining: data.remaining };
  } catch (error) {
    // The client throws rather than returning an error when the flag is off or the build is older.
    console.error("mfa: recovery code status unavailable:", error instanceof Error ? error.message : "unknown");
    return { known: false, total: 0, remaining: 0 };
  }
}
