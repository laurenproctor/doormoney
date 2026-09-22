import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Per-request client that carries the visitor's session. Use in server components and actions.
 *
 * `experimental.recoveryCodes` only unlocks the `auth.mfa.recoveryCodes.*` methods in the client
 * library, which refuse to run at all without it. Whether the Auth server behind them answers is
 * a separate question and is asked at call time: src/lib/mfa.ts treats a refusal as "this project
 * does not have them" and the account page then offers the backup authenticator alone.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { experimental: { recoveryCodes: true } },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a server component; proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS. Server only, never import from client code.
 * Use for webhooks, payouts, and anything the widget writes cross-origin.
 */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
