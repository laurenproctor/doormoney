import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/** The signed-in auth user, or null. Server only. */
export async function currentUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/** Redirects to the sign-in page when nobody is signed in. `next` is where to land after the link. */
export async function requireUser(next = "/dashboard") {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  roles: string[];
  /** When the current username was claimed. The next change is allowed twelve months after it. */
  username_set_at: string | null;
};

/**
 * The signed-in account's own profile row. RLS shows an account only its own, so this is
 * safe under the visitor's session and needs no service role.
 */
export async function currentProfile(userId: string): Promise<Profile | null> {
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("id,email,display_name,username,roles,username_set_at").eq("id", userId).maybeSingle();
  if (!data) return null;
  const row = data as Partial<Profile> & { id: string; email: string };
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name ?? null,
    username: row.username ?? null,
    roles: row.roles ?? [],
    username_set_at: row.username_set_at ?? null,
  };
}

export type OwnedAct = {
  id: string;
  slug: string;
  name: string;
  type: "touring_band" | "house_act" | "soloist";
  city: string;
  bio: string | null;
  photo_url: string | null;
  instagram: string | null;
  website: string | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
  founding: boolean;
};

/** The act this user owns, if any. One act per account for now. */
export async function ownedAct(userId: string): Promise<OwnedAct | null> {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("acts")
    .select("id,slug,name,type,city,bio,photo_url,instagram,website,stripe_account_id,stripe_payouts_enabled,founding")
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
