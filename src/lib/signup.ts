/**
 * What the sign-up form checks before it posts.
 *
 * The server is still the authority. SignUpInput in src/app/actions/auth.ts parses every field
 * again and nothing reaches Supabase without passing it. This exists so the page can answer at
 * once: clear an error the moment it stops being true, and put the cursor on the control that
 * needs attention instead of leaving it on the body.
 *
 * The limits and the wording live here and the server imports them, so there is one copy of
 * both. What is still two copies is the checking itself: EMAIL_RE below is deliberately looser
 * than the server's zod email check, because a value this accepts and the server refuses comes
 * back as a server error the form shows, while the reverse would be a field nobody can submit.
 */
import { isRole } from "@/lib/roles";

export type SignUpField = "roles" | "first_name" | "last_name" | "email" | "password";

/** Reading order. A blocked submission puts focus on the first of these that failed. */
export const SIGNUP_FIELDS: readonly SignUpField[] = ["roles", "first_name", "last_name", "email", "password"];

/** One stable id per message, so aria-describedby names the message and nothing else. */
export function errorId(field: SignUpField | "form"): string {
  return `signup-${field.replace(/_/g, "-")}-error`;
}

/** bcrypt stops reading at 72 bytes, so anything past that is not really part of the password. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 60;

/**
 * The wording, written once.
 *
 * Both copies of the rules read these: validateField below, for the answer the page gives at
 * once, and SignUpInput in src/app/actions/auth.ts, for the one that actually decides. They used
 * to be two sets of literals in two files, kept together by a test that read auth.ts as text and
 * matched its zod calls with a regular expression. Sharing the strings is what that test wanted;
 * this is it, so the test is gone.
 */
export const SIGNUP_MESSAGES = {
  roles: "Pick at least one, or both.",
  first_name_missing: "Enter a first name.",
  first_name_long: `Keep the first name under ${NAME_MAX} characters.`,
  last_name_missing: "Enter a last name.",
  last_name_long: `Keep the last name under ${NAME_MAX} characters.`,
  email: "Enter a valid email address.",
  password_short: `Use at least ${PASSWORD_MIN} characters.`,
  password_long: `Keep the password under ${PASSWORD_MAX} characters.`,
} as const;

export type SignUpValues = {
  roles: readonly string[];
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

export type SignUpErrors = Partial<Record<SignUpField, string>>;



/**
 * Deliberately loose. The server's zod email check is the strict one; this only has to catch the
 * address with no @ in it before a round trip, and must never refuse something zod would take.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The message for one field, or undefined when that field is fine. */
export function validateField(field: SignUpField, values: SignUpValues): string | undefined {
  switch (field) {
    case "roles":
      return values.roles.some((r) => isRole(r)) ? undefined : SIGNUP_MESSAGES.roles;
    case "first_name": {
      const v = values.first_name.trim();
      if (v.length < 1) return SIGNUP_MESSAGES.first_name_missing;
      return v.length > NAME_MAX ? SIGNUP_MESSAGES.first_name_long : undefined;
    }
    case "last_name": {
      const v = values.last_name.trim();
      if (v.length < 1) return SIGNUP_MESSAGES.last_name_missing;
      return v.length > NAME_MAX ? SIGNUP_MESSAGES.last_name_long : undefined;
    }
    case "email":
      return EMAIL_RE.test(values.email.trim()) ? undefined : SIGNUP_MESSAGES.email;
    case "password":
      if (values.password.length < PASSWORD_MIN) return SIGNUP_MESSAGES.password_short;
      return values.password.length > PASSWORD_MAX ? SIGNUP_MESSAGES.password_long : undefined;
  }
}

/** Every message the form can raise on its own, keyed by field. Empty means it may post. */
export function validateSignUp(values: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {};
  for (const field of SIGNUP_FIELDS) {
    const message = validateField(field, values);
    if (message) errors[field] = message;
  }
  return errors;
}

/** The field to send focus to, in reading order, or null when nothing is wrong. */
export function firstInvalid(errors: SignUpErrors): SignUpField | null {
  return SIGNUP_FIELDS.find((f) => errors[f]) ?? null;
}

