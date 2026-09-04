import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One patron row per (name, email). The same business bidding twice, or bidding and then buying,
 * is one patron. Used by checkout and by bidding, so they agree on who somebody is.
 */
export async function patronFor(sb: SupabaseClient, name: string, email: string) {
  const address = email.trim().toLowerCase();
  const { data: known } = await sb.from("patrons").select("id").ilike("contact_email", address).eq("name", name).maybeSingle();
  if (known?.id) return known.id as string;
  const { data: created, error } = await sb.from("patrons").insert({ name, contact_email: address }).select("id").single();
  if (error || !created) return null;
  return created.id as string;
}
