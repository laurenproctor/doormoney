import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

/**
 * Where the sign-in link lands, and the reset link with it. Supabase sends either a
 * PKCE `code` or a `token_hash` with a `type`; both become a session here, then the
 * visitor goes on to `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

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
  const to = new URL(failed ? dead : next, url.origin);
  return NextResponse.redirect(to);
}
