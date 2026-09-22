"use server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/newsletter";

/*
  Taking two-factor authentication off somebody else's account.

  This is the support path behind every "lost the phone" sentence on the site, and it is the one
  place the service role touches a factor. It is not part of the MFA flow: an account holder can
  never reach it, and it can never enroll or verify anything. It only deletes, which is the one
  operation that cannot let an attacker in by itself, because the password still stands between
  them and the account.

  Three things hold it shut:

  - **requireAdmin**, which is requireUser plus the ADMIN_EMAILS list. requireUser now carries the
    two-factor gate itself, so an owner with a factor has answered their own code before they can
    take anybody else's off.
  - **The whole address, typed.** The form matches one profile by exact normalized email. No id, no
    partial match, no picking from a list, so a slip cannot land on the wrong account.
  - **Deleting logs the account out.** Supabase ends every session on a verified factor it removes,
    so whoever asked for this has to sign in again and can set the factor up afresh.

  What this does not do is leave a trail. There is no audit table on this project yet, so the only
  record is the server log line below. Whoever builds Phase 7's admin actions should give this one
  a row of its own.
*/

export type AdminMfaState = { ok: boolean; message?: string; error?: string };

export async function removeAccountTotp(_prev: AdminMfaState, form: FormData): Promise<AdminMfaState> {
  const admin = await requireAdmin();

  const raw = form.get("email");
  const email = normalizeEmail(typeof raw === "string" ? raw : null);
  if (!email) return { ok: false, error: "Enter the whole email address on the account." };

  const db = supabaseAdmin();
  const { data: matches, error: lookupError } = await db.from("profiles").select("id,email").ilike("email", email);
  if (lookupError) {
    console.error("admin mfa: profile lookup failed:", lookupError.message);
    return { ok: false, error: "That lookup failed. Try once more." };
  }
  // Exact, after normalizing: ilike is case-insensitive but treats _ and % as wildcards, and an
  // address may contain an underscore. The comparison below is what actually decides.
  const found = (matches ?? []).filter((row) => normalizeEmail((row as { email: string }).email) === email);
  if (found.length === 0) return { ok: false, error: "No account has that address." };
  if (found.length > 1) return { ok: false, error: "More than one account carries that address. Sort it out in Supabase." };

  const userId = (found[0] as { id: string }).id;
  const { data: factors, error: listError } = await db.auth.admin.mfa.listFactors({ userId });
  if (listError) {
    console.error("admin mfa: factor list failed:", listError.message);
    return { ok: false, error: "The factors on that account could not be read." };
  }

  const totp = (factors?.factors ?? []).filter((f) => f.factor_type === "totp");
  if (totp.length === 0) return { ok: true, message: "That account has no authenticator app set up. Nothing to remove." };

  for (const factor of totp) {
    const { error } = await db.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
    if (error) {
      console.error("admin mfa: factor could not be deleted:", error.message);
      return { ok: false, error: "One of the factors would not delete. Try once more." };
    }
  }

  // The only record this leaves. Addresses, never a secret: there is none to leak here anyway.
  console.warn(`admin mfa: ${admin.email} removed ${totp.length} authenticator factor(s) from ${email}`);
  return {
    ok: true,
    message: `Removed ${totp.length} authenticator ${totp.length === 1 ? "app" : "apps"} from ${email}. That account is signed out everywhere and can sign in with its password.`,
  };
}
