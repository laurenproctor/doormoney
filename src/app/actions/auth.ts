"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";
import { safeNext } from "@/lib/auth";
import { emailForUsername, normalizeUsername, usernameProblem, usernameTaken } from "@/lib/username";

/*
  Four ways in, one account behind them all:
  - a username (or the email on the account) and a password,
  - a one-time email link, for anyone who would rather not keep a password,
  - a sign-up that claims the handle and sets the first password,
  - a reset, for a password that is gone.
*/

export type LoginState = { ok: boolean; email?: string; error?: string };
export type PasswordState = { error?: string };
export type SignUpField = "username" | "email" | "password" | "form";
export type SignUpState = { ok: boolean; email?: string; confirm?: boolean; errors?: Partial<Record<SignUpField, string>> };
export type ResetState = { ok: boolean; error?: string };

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

// bcrypt stops reading at 72 bytes, so anything past that is not really part of the password.
const Password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Keep the password under 72 characters.");

// ---------------------------------------------------------------
// The email link. Unchanged, and still the way in for anyone with no password set.
// ---------------------------------------------------------------

const LinkInput = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  next: z.string().optional(),
});

/** Sends a one-time sign-in link. Creates the account on first use. */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = LinkInput.safeParse({ email: form.get("email"), next: form.get("next") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  const email = parsed.data.email.toLowerCase();
  const next = safeNext(parsed.data.next);
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
  handle: z.string().trim().min(1, "Enter a username or email address."),
  password: z.string().min(1, "Enter the password."),
  next: z.string().optional(),
});

/** The handle field takes either a username or the email on the account. */
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
  // Outside the branch above: redirect throws, and must not be caught.
  redirect(next);
}

// ---------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------

const SignUpInput = z.object({
  username: z.string().trim().toLowerCase(),
  email: z.string().trim().email("Enter a valid email address."),
  password: Password,
  next: z.string().optional(),
});

/**
 * Claims a handle and opens the account. The handle rides along in the auth user's
 * metadata so the profile row and its username are written together, which is what
 * stops two people claiming one word at the same moment.
 */
export async function signUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const parsed = SignUpInput.safeParse({
    username: str(form, "username"),
    email: str(form, "email"),
    password: str(form, "password"),
    next: str(form, "next"),
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors as Partial<Record<SignUpField, string[]>>;
    const errors: SignUpState["errors"] = {};
    for (const k of Object.keys(fields) as SignUpField[]) errors[k] = fields[k]?.[0];
    return { ok: false, errors };
  }

  const username = normalizeUsername(parsed.data.username);
  const problem = usernameProblem(username);
  if (problem) return { ok: false, errors: { username: problem } };

  const admin = supabaseAdmin();
  if (await usernameTaken(admin, username)) {
    return { ok: false, errors: { username: "That username is taken. Pick another." } };
  }

  const email = parsed.data.email.toLowerCase();
  const next = safeNext(parsed.data.next);
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      data: { username },
      emailRedirectTo: `${SITE.url}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // The profile trigger raises a unique violation when a handle was claimed in the
    // seconds since the check above. Supabase reports it as a database error.
    if (/database error|username already taken|duplicate|unique/i.test(error.message)) {
      return { ok: false, errors: { username: "That username was just taken. Pick another." } };
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
