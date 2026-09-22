/**
 * Where somebody said they were heading when they opened an account.
 *
 * Intent is context, never permission. Every account can create fundraisers and support them, so
 * this only decides which action a page leads with and where a new account lands when nothing
 * else sent it somewhere. An unknown value is dropped rather than refused: a stale link should
 * still open the sign-up form, it just opens it with no opinion about what comes first.
 *
 * See docs/DECISIONS.md, decision 10: one account, either job, or both.
 */

export const INTENTS = ["creator", "patron", "explore"] as const;
export type Intent = (typeof INTENTS)[number];

/** The unified landing every newly authenticated account reaches when nothing names a destination. */
export const UNIFIED_HOME = "/dashboard";

/** The intent, or null for anything this does not recognise. The only place a value is trusted. */
export function parseIntent(value: unknown): Intent | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (INTENTS as readonly string[]).includes(trimmed) ? (trimmed as Intent) : null;
}

/**
 * Where a new account lands, carrying its intent so the dashboard can lead with the right action.
 * An explicit destination beats this everywhere it is used; see safeNext in src/lib/auth.ts.
 */
export function homeForIntent(intent: Intent | null | undefined): string {
  return intent ? `${UNIFIED_HOME}?intent=${intent}` : UNIFIED_HOME;
}

/**
 * A link into the one sign-up form. `next` is expected to have been checked already (safeNext in
 * src/lib/auth.ts): this builds an address, it does not decide what is safe to redirect to.
 */
export function signupPath(intent?: Intent | null, next?: string | null): string {
  const params = new URLSearchParams();
  if (intent) params.set("intent", intent);
  if (next) params.set("next", next);
  const query = params.toString();
  return query ? `/signup?${query}` : "/signup";
}
