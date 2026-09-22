"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { currentUser, safeNext } from "@/lib/auth";
import { SITE } from "@/lib/site";
import {
  MAX_TOTP_FACTORS,
  TOTP_CODE_LENGTH,
  TOTP_FRIENDLY_NAME,
  looksLikeTotpCode,
  mfaPending,
  nextFactorName,
  normalizeTotpCode,
  totpErrorMessage,
  unverifiedTotpFactorIds,
  verifiedTotpFactors,
} from "@/lib/mfa";

/*
  Turning two-factor authentication on, off, and passing it at sign-in.

  Everything here runs on the visitor's own session through the anon-key server client, which is
  the only client that may touch a factor: the service-role client would be acting as the Auth
  admin rather than as the person, and enrolling somebody's second factor for them is exactly the
  thing a second factor exists to prevent. `supabaseAdmin` is not imported in this file on purpose.

  The secret is never written down. It exists in the reply to `enroll`, travels to the browser once
  so the person can scan or type it, and is never logged, never returned twice and never stored by
  Door Money. Every failure below logs `error.message` and nothing else, because the QR code, the
  URI and the secret are all in the same object as the error.

  These actions use `currentUser` rather than `requireUser`: `requireUser` sends a session that has
  not passed its code to the verify screen, and the action that passes the code cannot be behind
  that gate.
*/

export type EnrollState = {
  ok: boolean;
  /** The QR image as Supabase returns it: an SVG document, turned into a data URL by the browser. */
  qrCode?: string;
  /** The same secret the QR encodes, for a phone that cannot scan. Shown once, stored nowhere. */
  secret?: string;
  /** Which of the two slots this is, so the panel can say whether it is the first or the backup. */
  name?: string;
  error?: string;
};

export type TotpState = {
  ok: boolean;
  message?: string;
  error?: string;
  /** The app this call added, so the panel can show the list without waiting for the page. */
  added?: string;
  /** The apps this call removed, for the same reason. */
  removed?: string[];
};

/**
 * A freshly issued set of recovery codes.
 *
 * The codes come back exactly once, from Supabase, and are shown once. Door Money does not store
 * them, cannot read them back and never logs them: losing this screen means issuing a new set.
 */
export type RecoveryCodesState = { ok: boolean; codes?: string[]; message?: string; error?: string };

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const ACCOUNT = "/dashboard/account";
const SIGN_IN = `/login?next=${encodeURIComponent(ACCOUNT)}`;
const CODE_WANTED = `Enter the ${TOTP_CODE_LENGTH}-digit code from the app.`;
const CODE_FIRST = "Enter the code from your authenticator app before changing this.";

/** The six digits, or null when what arrived is not six digits. */
function readCode(form: FormData): string | null {
  const code = normalizeTotpCode(str(form, "code"));
  return code.length === TOTP_CODE_LENGTH ? code : null;
}

/**
 * Starts enrollment: one unverified factor, its QR code and its secret.
 *
 * Nothing is protected yet. The factor stays unverified, and therefore unusable and invisible to
 * the sign-in gate, until a code proves the app holds the same secret.
 */
export async function startTotpEnrollment(): Promise<EnrollState> {
  const user = await currentUser();
  if (!user) redirect(SIGN_IN);

  const sb = await supabaseServer();

  /*
    A session that owes a code cannot set up a new factor.

    Without this, a password-only session on an account that already has a factor could enroll a
    second one it controls, verify it, and be raised to aal2 without ever answering the first. That
    is the whole protection handed over. The pages are already behind requireUser; this is the same
    gate on the action itself, because an action is a public endpoint.

    A backup authenticator is set up through this same action, from an aal2 session: somebody
    adding a second app has already answered the first one.
  */
  if (await mfaPending(sb, user)) return { ok: false, error: CODE_FIRST };

  const friendlyName = nextFactorName(user);
  if (!friendlyName) {
    return { ok: false, error: `There is room for ${MAX_TOTP_FACTORS} authenticator apps, and both are set up.` };
  }

  // A previous attempt that was never finished. Supabase refuses a second factor with the same
  // friendly name, so an abandoned one would block every later attempt.
  for (const factorId of unverifiedTotpFactorIds(user)) {
    const { error } = await sb.auth.mfa.unenroll({ factorId });
    if (error) console.error("mfa: could not clear an unfinished factor:", error.message);
  }

  const { data, error } = await sb.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
    issuer: SITE.name,
  });
  if (error || !data) {
    // The message only. The object beside it carries the secret.
    console.error("mfa: enrollment could not start:", error?.message);
    return { ok: false, error: "Two-factor authentication could not be set up just now. Try once more." };
  }

  return { ok: true, qrCode: data.totp.qr_code, secret: data.totp.secret, name: friendlyName };
}

/**
 * Finishes enrollment by proving the app holds the secret.
 *
 * The factor is read back from the session rather than taken from the form: the browser sends six
 * digits and nothing else, so no id from a page decides which factor is verified.
 */
export async function confirmTotpEnrollment(_prev: TotpState, form: FormData): Promise<TotpState> {
  const user = await currentUser();
  if (!user) redirect(SIGN_IN);

  const code = readCode(form);
  if (!code) return { ok: false, error: CODE_WANTED };

  const pending = unverifiedTotpFactorIds(user);
  const factorId = pending[0];
  if (!factorId) return { ok: false, error: "That setup has expired. Start again and scan a fresh code." };

  const sb = await supabaseServer();
  // The same gate as startTotpEnrollment, and the one that actually matters: verifying a factor
  // raises the session to aal2, so an account that already has one must answer that one first.
  if (await mfaPending(sb, user)) return { ok: false, error: CODE_FIRST };
  // challengeAndVerify is challenge + verify in one call, so the challenge is always fresh and a
  // slow typist never meets an expired one. A pass also raises this session to aal2.
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    console.error("mfa: enrollment verification refused:", error.message);
    return { ok: false, error: totpErrorMessage(error.message) };
  }

  revalidatePath(ACCOUNT);
  const already = verifiedTotpFactors(user);
  // The name the unverified factor was enrolled under is the one that just became real.
  const added = (user.factors ?? []).find((f) => f.id === factorId)?.friendly_name?.trim() || TOTP_FRIENDLY_NAME;
  return {
    ok: true,
    added,
    message:
      already.length > 0
        ? "The backup authenticator is set up. Either app's code will get you in."
        : "Two-factor authentication is on. Door Money will ask for a code after sign-in.",
  };
}

/**
 * Turns it off, and only for somebody holding the app right now.
 *
 * The code is the recent-authentication step: it is asked for even when the session already
 * passed one at sign-in, so a screen left open on a shared machine cannot be used to take the
 * factor off. Supabase itself wants an aal2 session to unenroll a verified factor, and the same
 * call that proves the code raises the session to it.
 */
export async function disableTotp(_prev: TotpState, form: FormData): Promise<TotpState> {
  const user = await currentUser();
  if (!user) redirect(SIGN_IN);

  const factors = verifiedTotpFactors(user);
  // Already off. Nothing to prove and nothing to remove.
  if (factors.length === 0) return { ok: true, message: "Two-factor authentication is off." };

  const code = readCode(form);
  if (!code) return { ok: false, error: CODE_WANTED };

  /*
    One app, or all of them.

    `only` names a single factor to drop, which is how a lost backup is replaced without turning
    the protection off. The name comes from the form, so it is matched against this account's own
    factors rather than trusted: an id from a page never decides what is removed.
  */
  const only = str(form, "only").trim();
  const chosen = only ? factors.filter((f) => f.name === only) : factors;
  if (chosen.length === 0) return { ok: false, error: "That app is not set up on this account." };

  const sb = await supabaseServer();
  // Any of the account's own factors proves the person is here. Trying each in turn is what lets
  // somebody who has only their backup app remove the first one.
  let proved = false;
  let lastMessage: string | undefined;
  for (const factor of factors) {
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (!error) {
      proved = true;
      break;
    }
    lastMessage = error.message;
  }
  if (!proved) {
    console.error("mfa: removal refused, code did not verify:", lastMessage);
    return { ok: false, error: totpErrorMessage(lastMessage) };
  }

  for (const factor of chosen) {
    const { error } = await sb.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      console.error("mfa: factor could not be removed:", error.message);
      return { ok: false, error: "The code was right, but the app could not be removed. Try once more." };
    }
  }
  // Anything half-finished goes with it, so the next attempt starts clean.
  for (const factorId of unverifiedTotpFactorIds(user)) {
    await sb.auth.mfa.unenroll({ factorId });
  }

  revalidatePath(ACCOUNT);
  const left = factors.length - chosen.length;
  return {
    ok: true,
    removed: chosen.map((f) => f.name),
    message:
      left > 0
        ? `${chosen[0].name} was removed. The other app still signs you in.`
        : "Two-factor authentication is off. Sign-in needs the password alone again.",
  };
}

/**
 * The code at sign-in.
 *
 * Until this passes, the session is at aal1 and `requireUser` sends it straight back here, so a
 * password alone reaches no page that needs an account. On a pass the session becomes aal2 and the
 * visitor goes wherever they were heading, which `safeNext` has already checked is inside the site.
 */
export async function verifySignInTotp(_prev: TotpState, form: FormData): Promise<TotpState> {
  const user = await currentUser();
  if (!user) redirect(SIGN_IN);

  const next = safeNext(str(form, "next"));
  const factors = verifiedTotpFactors(user);
  // The factor was removed from somewhere else while this screen was open. There is nothing left
  // to ask for, and the session is already as strong as it can get.
  if (factors.length === 0) redirect(next);

  const typed = str(form, "code").trim();
  const sb = await supabaseServer();

  /*
    One box, two kinds of code.

    Six digits is an authenticator code and is tried against each of the account's apps in turn,
    so whichever phone is to hand works. Anything else is treated as a recovery code, which the
    Auth server checks and burns. A wrong guess about which kind it is costs a refusal, never
    access: both calls are the server's to decide.
  */
  if (looksLikeTotpCode(typed)) {
    const code = normalizeTotpCode(typed);
    let lastMessage: string | undefined;
    for (const factor of factors) {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (!error) redirect(next);
      lastMessage = error.message;
    }
    console.error("mfa: sign-in code refused:", lastMessage);
    return { ok: false, error: totpErrorMessage(lastMessage) };
  }

  if (typed.length === 0) return { ok: false, error: CODE_WANTED };

  let recoveryFailed: string | undefined;
  try {
    const { error } = await sb.auth.mfa.recoveryCodes.verify({ code: typed });
    if (!error) redirect(next);
    recoveryFailed = error.message;
  } catch (error) {
    // The project has no recovery codes at all. Say what is true: this is not one.
    if (isRedirect(error)) throw error;
    recoveryFailed = error instanceof Error ? error.message : "unknown";
  }
  console.error("mfa: recovery code refused:", recoveryFailed);
  return { ok: false, error: "That was not a code this account recognizes. Enter the six digits from an authenticator app, or an unused recovery code." };
}

/** redirect() works by throwing, so a try block around a redirect has to let it past. */
function isRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && typeof (error as { digest?: unknown }).digest === "string" && (error as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}

/**
 * Issues recovery codes, for the day both authenticator apps are gone.
 *
 * Experimental in @supabase/auth-js 2.116.0 and unavailable on a project whose Auth server has no
 * such endpoint, so every failure is reported as "not available here" rather than as a bug: the
 * backup authenticator is the recovery plan that always works, and this is the extra one.
 *
 * `replace` is the deliberate second press. Generating a new set voids the old one, so it is never
 * something that happens because a button was clicked twice.
 */
export async function issueRecoveryCodes(_prev: RecoveryCodesState, form: FormData): Promise<RecoveryCodesState> {
  const user = await currentUser();
  if (!user) redirect(SIGN_IN);

  const sb = await supabaseServer();
  // The same gate the enrollment actions carry: a session that owes its code changes nothing.
  if (await mfaPending(sb, user)) return { ok: false, error: CODE_FIRST };
  if (verifiedTotpFactors(user).length === 0) {
    return { ok: false, error: "Set up an authenticator app first. Recovery codes are the way back when that app is gone." };
  }

  const replace = str(form, "replace") === "yes";
  try {
    const { data, error } = replace
      ? await sb.auth.mfa.recoveryCodes.regenerate()
      : await sb.auth.mfa.recoveryCodes.generate();
    if (error || !data) {
      console.error("mfa: recovery codes could not be issued:", error?.message);
      // A set already exists, which only Replace may overwrite.
      if (error && /exist|conflict|already/i.test(error.message)) {
        return { ok: false, error: "This account already has recovery codes. Use Replace to issue a new set, which voids the old one." };
      }
      return { ok: false, error: "Recovery codes are not available on this project. The backup authenticator is the way back." };
    }
    revalidatePath(ACCOUNT);
    return {
      ok: true,
      codes: data.codes,
      message: replace ? "A new set. The old codes no longer work." : "Save these somewhere only you can reach.",
    };
  } catch (error) {
    // The client refuses outright when the API is not enabled or not built in.
    console.error("mfa: recovery codes unsupported:", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: "Recovery codes are not available on this project. The backup authenticator is the way back." };
  }
}
