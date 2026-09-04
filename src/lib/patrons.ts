import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One patron row per (name, email). The same business bidding twice, or bidding and then buying,
 * is one patron. Used by checkout and by bidding, so they agree on who somebody is.
 *
 * `profileId` ties the row to an account, and is only ever passed by a caller that has already
 * proved two things on the server: that somebody is signed in, and that the address on the payment
 * is the verified address on that session. A row that already belongs to an account is left alone,
 * so nobody inherits somebody else's history by typing their address. See migration 0021.
 */
export async function patronFor(sb: SupabaseClient, name: string, email: string, profileId?: string | null) {
  const address = email.trim().toLowerCase();
  const { data: known } = await sb.from("patrons").select("id,profile_id").ilike("contact_email", address).eq("name", name).maybeSingle();
  if (known?.id) {
    if (profileId && !known.profile_id) {
      await sb.from("patrons").update({ profile_id: profileId }).eq("id", known.id).is("profile_id", null);
    }
    return known.id as string;
  }
  const { data: created, error } = await sb
    .from("patrons")
    .insert({ name, contact_email: address, profile_id: profileId ?? null })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id as string;
}

/**
 * The signed-in account paying under its own verified address, or null.
 *
 * Never the address on the form: a typed address proves nothing. Returns null in a third-party
 * frame, where the session cookie does not travel, and the payment goes through unlinked as it
 * always has.
 */
export function payingProfileId(
  user: { id: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null } | null,
  payingEmail: string,
): string | null {
  if (!user?.email) return null;
  if (!(user.email_confirmed_at ?? user.confirmed_at)) return null;
  return user.email.trim().toLowerCase() === payingEmail.trim().toLowerCase() ? user.id : null;
}
