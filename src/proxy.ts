import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Nothing to do on these once somebody is already signed in, and where to send them instead. */
const GUEST_ONLY: Record<string, string> = {
  "/login": "/dashboard",
  "/signup": "/dashboard",
  "/forgot": "/dashboard",
  // A patron who is already in belongs on their profile, not at the door they came through.
  "/patron/signup": "/dashboard/profile",
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
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(to);
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
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/signup", "/patron/signup", "/forgot", "/reset", "/auth/:path*"],
};
