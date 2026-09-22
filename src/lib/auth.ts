import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { mfaPending, mfaVerifyPath } from "@/lib/mfa";

/** The signed-in auth user, or null. Server only. */
export async function currentUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/**
 * The account behind the request, or a redirect to the way in.
 *
 * Two gates, not one. A visitor with no session goes to sign in. A visitor whose account has a
 * two-factor app and whose session has not passed its code goes to the code screen: a password
 * alone is half a sign-in, and this is where that is enforced for every page and every action
 * that asks who is signed in. `next` survives both, so the visitor lands where they meant to.
 *
 * src/proxy.ts does the same before the page runs, for the paths it matches. This is the one that
 * covers the rest, and it is the one a server action meets.
 */
export async function requireUser(next = "/dashboard") {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user ?? null;
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (await mfaPending(sb, user)) redirect(mfaVerifyPath(next));
  return user;
}

export type Profile = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  roles: string[];
  /** When the current username was claimed. The next change is allowed twelve months after it. */
  username_set_at: string | null;
};

/**
 * The signed-in account's own profile row.
 *
 * Reads with the service role because profiles comes off the public Data API in 0022: it holds
 * email addresses, and the column grant left behind covers only the handle. Safe on the same
 * terms as ownedAct above: userId comes from a verified session, and it is the only filter.
 */
export async function currentProfile(userId: string): Promise<Profile | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("profiles").select("id,email,first_name,last_name,username,roles,username_set_at").eq("id", userId).maybeSingle();
  if (!data) return null;
  const row = data as Partial<Profile> & { id: string; email: string };
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    username: row.username ?? null,
    roles: row.roles ?? [],
    username_set_at: row.username_set_at ?? null,
  };
}

export type OwnedAct = {
  id: string;
  slug: string;
  name: string;
  type: "touring_band" | "house_act" | "soloist" | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  bio: string | null;
  photo_url: string | null;
  instagram: string | null;
  website: string | null;
  /** What the organizer is: a person, a team, a company. Never a category (migration 0043). */
  entity_kind: string | null;
  /** The audience or community the organizer reaches, in their own words. Not a fundraiser's. */
  audience_description: string | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
  founding: boolean;
};

/**
 * The act this user owns, if any. One act per account, enforced by acts_one_per_owner (0022).
 *
 * Reads with the service role because stripe_account_id and stripe_payouts_enabled came off the
 * public Data API in 0022. Safe: userId comes from a verified session, and it is the only filter.
 */
export async function ownedAct(userId: string): Promise<OwnedAct | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("acts")
    .select("id,slug,name,type,city,region,country_code,bio,photo_url,instagram,website,entity_kind,audience_description,stripe_account_id,stripe_payouts_enabled,founding")
    .eq("owner_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as OwnedAct | null) ?? null;
}

/** Only relative paths inside the site are safe to redirect to after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

