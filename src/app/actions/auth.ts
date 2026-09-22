"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";
import { safeNext } from "@/lib/auth";
import { emailForUsername, normalizeUsername } from "@/lib/username";
import { DEFAULT_ROLES } from "@/lib/roles";
import { homeForIntent, parseIntent } from "@/lib/intent";
import { mfaVerifyPath } from "@/lib/mfa";
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, SIGNUP_MESSAGES } from "@/lib/signup";

/*
  Four ways in, one account behind them all:
  - a username (or the email on the account) and a password,
  - a one-time email link, for anyone who would rather not keep a password,
  - a sign-up that claims the handle and sets the first password,
  - a reset, for a password that is gone.
*/

export type LoginState = { ok: boolean; email?: string; error?: string };
export type PasswordState = { error?: string };
export type SignUpField = "first_name" | "last_name" | "email" | "password" | "form";
export type SignUpState = { ok: boolean; email?: string; confirm?: boolean; errors?: Partial<Record<SignUpField, string>> };
export type ResetState = { ok: boolean; error?: string };

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

// The limits and the wording come from @/lib/signup, which the sign-up page also runs, so the
// answer the page gives at once and the one this makes are the same answer. bcrypt stops reading
// at 72 bytes, so anything past PASSWORD_MAX is not really part of the password.
const Password = z
  .string()
  .min(PASSWORD_MIN, SIGNUP_MESSAGES.password_short)
  .max(PASSWORD_MAX, SIGNUP_MESSAGES.password_long);

// ---------------------------------------------------------------
// The email link. Unchanged, and still the way in for anyone with no password set.
// ---------------------------------------------------------------

const LinkInput = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  next: z.string().optional(),
  // Anything this does not recognise is dropped rather than refused: a stale link should still
  // send somebody their way in.
  intent: z.string().optional().transform(parseIntent),
});

/**
 * Sends a one-time sign-in link. Creates the account on first use, and an account created this
 * way is opened with the same capabilities as one created with a password: the trigger in
 * migration 0051 gives it both, because nothing here asks a new account to pick a side.
 */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = LinkInput.safeParse({ email: form.get("email"), next: form.get("next"), intent: form.get("intent") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  const email = parsed.data.email.toLowerCase();
  // An explicit destination wins. Without one the intent decides which action the dashboard
  // leads with, and with neither everybody lands on the same unified dashboard.
  const next = safeNext(parsed.data.next, homeForIntent(parsed.data.intent));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE.url}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) {
    console.error("magic link failed:", error.message);
    if (/rate|limit/i.test(error.message)) return { ok: false, error: "Too many links sent to that address. Try again in a few minutes." };
    // Usually the address: the mail sender refuses domains it cannot deliver to.
    if (/sending.*email|smtp|mail/i.test(error.message)) return { ok: false, error: "That address did not accept the link. Check it, or sign in with a username and password." };
    return { ok: false, error: "That link did not send. Try once more." };
  }
  return { ok: true, email };
}

// ---------------------------------------------------------------
// Password sign-in
// ---------------------------------------------------------------

const SignInInput = z.object({
  handle: z.string().trim().min(1, "Enter an email address or username."),
  password: z.string().min(1, "Enter the password."),
  next: z.string().optional(),
});

/** The handle field takes either the email on the account or a musician's board address. */
async function addressFor(handle: string) {
  if (handle.includes("@")) return handle.toLowerCase();
  return emailForUsername(supabaseAdmin(), normalizeUsername(handle));
}

/** Signs in with a username or email and a password. Redirects on success. */
export async function signIn(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const parsed = SignInInput.safeParse({ handle: str(form, "handle"), password: str(form, "password"), next: str(form, "next") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a username and password." };
  const next = safeNext(parsed.data.next);

  const email = await addressFor(parsed.data.handle);
  // No account for that handle. Same words as a wrong password, so the form never
  // confirms which usernames exist and which do not.
  if (!email) return { error: "That username and password do not match an account." };

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      return { error: "That account is not confirmed yet. The confirmation link is in the inbox for that address." };
    }
    if (/rate|limit|too many/i.test(error.message)) {
      return { error: "Too many attempts on that account. Try again in a few minutes." };
    }
    console.error("password sign-in failed:", error.message);
    return { error: "That username and password do not match an account." };
  }

  /*
    The password was right. Whether that is the whole sign-in depends on the account: one with a
    verified authenticator factor is at aal1 until a code is entered, so it goes to the code screen
    carrying its destination rather than to the destination itself. listFactors returns only
    verified factors, so a half-finished enrollment stops nobody.
  */
  const { data: factors, error: factorError } = await sb.auth.mfa.listFactors();
  if (factorError) console.error("sign-in: factors unreadable:", factorError.message);
  const guarded = (factors?.totp.length ?? 0) > 0 || Boolean(factorError);

  // Outside the branch above: redirect throws, and must not be caught.
  redirect(guarded ? mfaVerifyPath(next) : next);
}

// ---------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------

const SignUpInput = z.object({
  // No board address here. An organizer picks that on the organizer page, where it means
  // something, and somebody here to support work never needs one at all. See docs/DECISIONS.md,
  // decisions 8 and 10.
  //
  // No roles either. Nobody declares a side to get in: every account is opened able to create
  // fundraisers and to support them, and DEFAULT_ROLES below is what that means.
  //
  // Whoever holds an account is a person, and both names are optional here. A band's name is on
  // the act, a business's name is on the patron row, and both of those are what a fundraiser page
  // or a receipt shows. A name that is given still has to fit.
  first_name: z.string().trim().max(NAME_MAX, SIGNUP_MESSAGES.first_name_long),
  last_name: z.string().trim().max(NAME_MAX, SIGNUP_MESSAGES.last_name_long),
  email: z.string().trim().email(SIGNUP_MESSAGES.email),
  password: Password,
  next: z.string().optional(),
  // Context, not permission: it decides which action the dashboard leads with and nothing else.
  intent: z.string().optional().transform(parseIntent),
});

/**
 * Opens the account. One question: how to reach the person. Everything else can wait.
 *
 * The capabilities ride along in the auth user's metadata, so the profile row is written with
 * both of them and any name in one go. Somebody who has already paid for something under this
 * address picks that history up at the same moment (claim_patron_rows, migration 0021).
 */
export async function signUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const parsed = SignUpInput.safeParse({
    first_name: str(form, "first_name"),
    last_name: str(form, "last_name"),
    email: str(form, "email"),
    password: str(form, "password"),
    next: str(form, "next"),
    intent: str(form, "intent"),
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors as Partial<Record<SignUpField, string[]>>;
    const errors: SignUpState["errors"] = {};
    for (const k of Object.keys(fields) as SignUpField[]) errors[k] = fields[k]?.[0];
    return { ok: false, errors };
  }

  const email = parsed.data.email.toLowerCase();
  /*
    Where a new account lands, when nothing sent it here with a destination of its own.

    One landing for everybody: the dashboard, which offers both capabilities and pushes nobody
    into creating a fundraiser they did not come for. The intent rides along in the address so
    that page can lead with the action the visitor came for, and it changes nothing else.

    An explicit next still wins, which is what keeps a starter-kit link landing on its form.
    The destination rides on the confirmation link while email confirmation is on, and is used
    directly when it is off.
  */
  const next = safeNext(parsed.data.next, homeForIntent(parsed.data.intent));
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      // The profile trigger reads these: the capabilities, both names, and any patron rows
      // already paid for under this address. An empty name is stored as no name at all.
      data: { first_name: parsed.data.first_name, last_name: parsed.data.last_name, roles: DEFAULT_ROLES },
      emailRedirectTo: `${SITE.url}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // Supabase reports a trigger failure as a plain database error.
    if (/database error|duplicate|unique/i.test(error.message)) {
      return { ok: false, errors: { form: "That did not save. Try once more." } };
    }
    if (/already registered|already exists/i.test(error.message)) {
      return { ok: false, errors: { email: "There is already an account for that email address." } };
    }
    if (/rate|limit|too many/i.test(error.message)) {
      return { ok: false, errors: { form: "Too many sign-ups from here. Try again in a few minutes." } };
    }
    // The confirmation did not send, so the account was rolled back. Usually the
    // address itself: the mail sender refuses domains it cannot deliver to.
    if (/sending.*email|smtp|mail/i.test(error.message)) {
      console.error("sign-up blocked, confirmation email would not send:", error.message);
      return { ok: false, errors: { email: "That address did not accept the confirmation email. Check it, or use another." } };
    }
    console.error("sign-up failed:", error.message);
    return { ok: false, errors: { form: "That did not save. Try once more." } };
  }

  // Supabase returns a user with no identities when the address already has an account,
  // rather than saying so outright. Say so, because somebody trying to sign up needs to know.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return { ok: false, errors: { email: "There is already an account for that email address." } };
  }

  // A session here means confirmations are off and the account is already in.
  if (data.session) redirect(next);
  return { ok: true, email, confirm: true };
}

// ---------------------------------------------------------------
// Forgotten password
// ---------------------------------------------------------------

const ForgotInput = z.object({ handle: z.string().trim().min(1, "Enter a username or email address.") });

/**
 * Sends the reset link. Reports the same thing whether or not the account exists,
 * so the form cannot be used to find out who has one.
 */
export async function requestPasswordReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const parsed = ForgotInput.safeParse({ handle: str(form, "handle") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a username or email address." };

  const email = await addressFor(parsed.data.handle);
  if (email) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE.url}/auth/callback?next=${encodeURIComponent("/reset")}`,
    });
    // A failure here goes to the log and no further. Reporting it would tell whoever
    // typed the name that the account is real, which is the one thing this form must not do.
    if (error) console.error("password reset failed:", error.message);
  }
  return { ok: true };
}

const NewPasswordInput = z
  .object({ password: Password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match.", path: ["password"] });

/**
 * Sets a new password. Used by the reset link and by an account changing its own.
 * The reset link signs the visitor in first, so both cases are the same write.
 */
export async function updatePassword(_prev: ResetState, form: FormData): Promise<ResetState> {
  const sb = await supabaseServer();
  const { data: session } = await sb.auth.getUser();
  if (!session.user) {
    return { ok: false, error: "That reset link has expired or was already used. Ask for a fresh one." };
  }

  const parsed = NewPasswordInput.safeParse({ password: str(form, "password"), confirm: str(form, "confirm") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pick a longer password." };

  const { error } = await sb.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (/different from the old password|same.*password/i.test(error.message)) {
      return { ok: false, error: "That is the current password already. Pick a different one." };
    }
    // Supabase asks for a fresh sign-in when "secure password change" is on.
    if (/reauthentication|nonce/i.test(error.message)) {
      return { ok: false, error: "Sign in again, then change the password. The reset link by email also works." };
    }
    console.error("password update failed:", error.message);
    return { ok: false, error: "That did not save. Try once more." };
  }
  return { ok: true };
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}
