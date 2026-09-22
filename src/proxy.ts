import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { signInPath } from "@/lib/urls";
import { MFA_VERIFY_PATH, mfaPending, mfaVerifyPath } from "@/lib/mfa";

/**
 * Paths a session that has not passed its two-factor code may still reach.
 *
 * /auth is where a link becomes a session in the first place, and it decides for itself where to
 * send somebody afterwards. /reset is the recovery path: whoever followed a password reset link
 * must be able to set the password even though the code screen is still ahead of them.
 */
const MFA_EXEMPT = new Set(["/reset", MFA_VERIFY_PATH]);

/** Nothing to do on these once somebody is already signed in, and where to send them instead. */
const GUEST_ONLY: Record<string, string> = {
  "/login": "/dashboard",
  "/signup": "/dashboard",
  "/forgot": "/dashboard",
  // The old patron door. Somebody already in belongs on the dashboard, which offers both sides,
  // not at a door they came through once.
  "/patron/signup": "/dashboard",
};

/**
 * Keeps the Supabase session fresh on the pages that use it and sends
 * signed-out visitors from the dashboard to the sign-in page.
 * Marketing pages are not matched, so they stay static.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && (path.startsWith("/dashboard") || path.startsWith("/admin"))) {
    // The query string comes back too, so a link to a starter kit survives signing in.
    return NextResponse.redirect(new URL(signInPath(path, request.nextUrl.search), request.nextUrl.origin));
  }
  /*
    Signed in, with a two-factor app, and this session has not answered it yet. Everything this
    proxy matches is either a page that needs an account or a door somebody already inside has no
    use for, so both go to the code screen carrying where they were heading. Nothing about the
    session is trusted for this: mfaPending reads the assurance level off the token getUser has
    just verified.
  */
  if (user && !path.startsWith("/auth") && !MFA_EXEMPT.has(path) && (await mfaPending(supabase, user))) {
    const heading = GUEST_ONLY[path] ?? `${path}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(mfaVerifyPath(heading), request.nextUrl.origin));
  }

  if (user && GUEST_ONLY[path]) {
    const to = request.nextUrl.clone();
    to.pathname = GUEST_ONLY[path];
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // /patron/signup only: /patron/<username> is a public page and stays out of the session refresh.
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/login/verify", "/signup", "/patron/signup", "/forgot", "/reset", "/auth/:path*"],
};
