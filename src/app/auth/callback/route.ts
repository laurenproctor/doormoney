import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";
import { homeForIntent, parseIntent } from "@/lib/intent";
import { mfaVerifyPath } from "@/lib/mfa";

/**
 * Where the sign-in link lands, and the reset link with it. Supabase sends either a
 * PKCE `code` or a `token_hash` with a `type`; both become a session here, then the
 * visitor goes on to `next`.
 *
 * `next` usually carries the intent already, because the action that sent the link folded it in.
 * A link that carries the intent separately is honoured too, and only when there is no safe
 * `next` of its own: an explicit destination always wins.
 *
 * An email link is a sign-in like any other, so an account with a two-factor app still owes its
 * code afterwards. The one exception is the password reset, which has to stay reachable: whoever
 * lost their password may also be the person who cannot answer the code, and the reset changes
 * the password without weakening the factor, which still guards every page behind it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"), homeForIntent(parseIntent(url.searchParams.get("intent"))));

  const sb = await supabaseServer();
  let failed = false;
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) console.error("auth callback: code exchange failed:", error.message);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) console.error("auth callback: verifyOtp failed:", error.message);
    failed = Boolean(error);
  } else {
    failed = true;
  }

  // A dead reset link belongs back at the reset form, not at sign-in.
  const dead = next === "/reset" ? "/forgot?error=link" : "/login?error=link";

  let destination = next;
  if (!failed && next !== "/reset") {
    const { data: factors, error: factorError } = await sb.auth.mfa.listFactors();
    if (factorError) console.error("auth callback: factors unreadable:", factorError.message);
    // Fails closed: a factor that cannot be read is treated as a factor that exists.
    if ((factors?.totp.length ?? 0) > 0 || factorError) destination = mfaVerifyPath(next);
  }

  const to = new URL(failed ? dead : destination, url.origin);
  return NextResponse.redirect(to);
}
