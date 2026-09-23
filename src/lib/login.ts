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
import { z } from "zod";
import { parseIntent, type Intent } from "@/lib/intent";

export const LOGIN_MESSAGES = {
  handle_missing: "Enter your email or username.",
  password_missing: "Enter your password.",
  email_missing: "Enter your email address.",
  email_invalid: "Enter a valid email address.",
  mismatch: "That email or username and password do not match.",
  link_expired: "That link has expired. Send a new one.",
} as const;

/** Blank is the only thing the page can be sure about before it posts. */
export function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * What the one-time link form posts, read the way every other form in the auth action is read:
 * a field that is not there is an empty string, never null. FormData.get answers null for an
 * absent field, and a schema that says "optional" means undefined, not null, so reading the form
 * directly refused every request the moment the schema grew a field the form does not send. That
 * is how the sign-in link stopped working on 2026-09-22 without a single error reaching a log.
 *
 * Pure, so tests/login.test.ts can post a form at it. The action only sends the email.
 */
const field = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const LinkRequest = z.object({
  email: z.string().trim().email(),
  next: z.string().optional(),
  // Anything this does not recognise is dropped rather than refused: a stale link should still
  // send somebody their way in.
  intent: z.string().optional().transform(parseIntent),
});

export type LinkRequest =
  | { ok: true; email: string; next: string | undefined; intent: Intent | null }
  | { ok: false; error: string };

/** The email lowercased, the destination if the form named one, and the intent if it is a real one. */
export function readLinkRequest(form: FormData): LinkRequest {
  const parsed = LinkRequest.safeParse({ email: field(form, "email"), next: field(form, "next") || undefined, intent: field(form, "intent") });
  if (!parsed.success) {
    // The email is the only thing here that can fail, and the sentence is ours, never the library's.
    return { ok: false, error: isBlank(field(form, "email")) ? LOGIN_MESSAGES.email_missing : LOGIN_MESSAGES.email_invalid };
  }
  return { ok: true, email: parsed.data.email.toLowerCase(), next: parsed.data.next, intent: parsed.data.intent };
}
