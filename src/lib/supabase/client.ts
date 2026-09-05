"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser client, or null when Supabase is not configured.
 *
 * `configured()` in src/lib/boards.ts already lets the server fall back to the sample boards, so a
 * page can render with no Supabase at all. This says the same thing on the client: without the two
 * public values there is nothing live to subscribe to, and throwing here would take down a page
 * that had otherwise rendered.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
