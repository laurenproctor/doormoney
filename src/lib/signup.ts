/**
 * What the sign-up form checks before it posts.
 *
 * The server is still the authority. SignUpInput in src/app/actions/auth.ts parses every field
 * again and nothing reaches Supabase without passing it. This exists so the page can answer at
 * once: clear an error the moment it stops being true, and put the cursor on the control that
 * needs attention instead of leaving it on the body.
 *
 * The rules and the wording here are deliberately the server's, and tests/signup.test.ts pins
 * them against it so the two copies cannot drift in silence. Where the two differ at all, this
 * one is the looser: a value this accepts and the server refuses comes back as a server error,
 * which the form shows. The reverse would be a field nobody can submit.
 */
import { ROLES } from "@/lib/roles";

export type SignUpField = "roles" | "first_name" | "last_name" | "email" | "password";

/** Reading order. A blocked submission puts focus on the first of these that failed. */
export const SIGNUP_FIELDS: readonly SignUpField[] = ["roles", "first_name", "last_name", "email", "password"];

/** One stable id per message, so aria-describedby names the message and nothing else. */
export function errorId(field: SignUpField | "form"): string {
  return `signup-${field.replace(/_/g, "-")}-error`;
}

/** Mirrors Password in src/app/actions/auth.ts. bcrypt stops reading at 72 bytes. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 60;

export type SignUpValues = {
  roles: readonly string[];
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

export type SignUpErrors = Partial<Record<SignUpField, string>>;

const ROLE_KEYS: readonly string[] = ROLES.map((r) => r.key);

/**
 * Deliberately loose. The server's zod email check is the strict one; this only has to catch the
 * address with no @ in it before a round trip, and must never refuse something zod would take.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The message for one field, or undefined when that field is fine. */
export function validateField(field: SignUpField, values: SignUpValues): string | undefined {
  switch (field) {
    case "roles":
      return values.roles.some((r) => ROLE_KEYS.includes(r)) ? undefined : "Pick at least one, or both.";
    case "first_name": {
      const v = values.first_name.trim();
      if (v.length < 1) return "Enter a first name.";
      return v.length > NAME_MAX ? `Keep the first name under ${NAME_MAX} characters.` : undefined;
    }
    case "last_name": {
      const v = values.last_name.trim();
      if (v.length < 1) return "Enter a last name.";
      return v.length > NAME_MAX ? `Keep the last name under ${NAME_MAX} characters.` : undefined;
    }
    case "email":
      return EMAIL_RE.test(values.email.trim()) ? undefined : "Enter a valid email address.";
    case "password":
      if (values.password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
      return values.password.length > PASSWORD_MAX ? `Keep the password under ${PASSWORD_MAX} characters.` : undefined;
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
