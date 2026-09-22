/**
 * The wording the sign-in page and the sign-in action share.
 *
 * Written once, the way src/lib/signup.ts does it, so the answer the page gives at once and the
 * one the server gives after a round trip are the same sentence. The page only ever checks for an
 * empty box; everything else is the server's to decide.
 *
 * MISMATCH is deliberately one sentence for two different facts: no account for that handle, and
 * the wrong password on an account that exists. Telling them apart would let this form be used to
 * find out who has an account.
 */
export const LOGIN_MESSAGES = {
  handle_missing: "Enter your email or username.",
  password_missing: "Enter your password.",
  email_missing: "Enter your email address.",
  mismatch: "That email or username and password do not match.",
  link_expired: "That link has expired. Send a new one.",
} as const;

/** Blank is the only thing the page can be sure about before it posts. */
export function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
