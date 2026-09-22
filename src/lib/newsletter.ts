import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The new-fundraisers list, from the account's side.
 *
 * Two kinds of subscriber share one table. An **anonymous** one is an address and nothing else:
 * they subscribed from the footer, they may never open an account, and `profile_id` stays null
 * for them forever. An **account** subscriber is the same row with an owner on it, claimed the
 * first time somebody deliberately subscribes or unsubscribes from their own account page.
 *
 * The table is off the Data API (migration 0029), so every read and write here goes through the
 * service role. That is safe on the usual terms: the account's id comes from a verified session
 * and is the only thing that decides which row is touched.
 *
 * One list, one switch. `unsubscribed_at` is what the weekly sender reads, and null means send.
 * Where a second kind of mail would live is written out in migration 0052; it is not this table's
 * second nullable column, and nothing here should be read as a topic.
 */

export type NewsletterRow = {
  id: string;
  email: string;
  first_name: string | null;
  profile_id: string | null;
  unsubscribed_at: string | null;
  unsubscribe_token: string;
};

/** What the account page is allowed to know. No token, no row id, no other account's address. */
export type NewsletterStanding = {
  /** False when there is no database to ask, so a page can say so rather than guess. */
  configured: boolean;
  subscribed: boolean;
  /** The address is on the list under somebody else's account, so this account must not move it. */
  ownedByAnother: boolean;
};

export const NEWSLETTER_SOURCE_ACCOUNT = "account";
/** Where a row came from when the box on the sign-up form was left ticked. */
export const NEWSLETTER_SOURCE_SIGNUP = "signup";

/**
 * One address, in the one form the table stores.
 *
 * Migration 0052 lowercased every stored address and both writers lowercase on the way in, so an
 * exact match is a reliable match. Anything without an @ is not an address and answers null
 * rather than being looked up.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  return value.includes("@") ? value : null;
}

/** True when the service role is available. The list cannot be read or written without it. */
export function newsletterConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const COLUMNS = "id,email,first_name,profile_id,unsubscribed_at,unsubscribe_token";

/**
 * This account's row, by owner first and address second.
 *
 * The owner is the stronger claim, so it is asked first. The address is how a row subscribed from
 * the footer before the account existed is found at all, and it is the account's own verified
 * address, never one typed into a form.
 */
export async function findNewsletterRow({ userId, email }: { userId: string; email: string | null }): Promise<NewsletterRow | null> {
  const db = supabaseAdmin();
  const { data: owned } = await db.from("newsletter").select(COLUMNS).eq("profile_id", userId).maybeSingle();
  if (owned) return owned as NewsletterRow;
  if (!email) return null;
  const { data: byEmail } = await db.from("newsletter").select(COLUMNS).eq("email", email).maybeSingle();
  return (byEmail as NewsletterRow | null) ?? null;
}

/** Whether this account gets the email, for the account page to state in words. */
export async function newsletterStanding({ userId, email }: { userId: string; email: string | null }): Promise<NewsletterStanding> {
  if (!newsletterConfigured()) return { configured: false, subscribed: false, ownedByAnother: false };
  try {
    const row = await findNewsletterRow({ userId, email });
    if (!row) return { configured: true, subscribed: false, ownedByAnother: false };
    return {
      configured: true,
      subscribed: row.unsubscribed_at === null,
      ownedByAnother: row.profile_id !== null && row.profile_id !== userId,
    };
  } catch (error) {
    // A list that cannot be read is not worth a broken account page. The card says it cannot tell.
    console.error("newsletter standing failed:", error instanceof Error ? error.message : error);
    return { configured: false, subscribed: false, ownedByAnother: false };
  }
}

/**
 * Puts a brand-new account on the list, at the moment it is created.
 *
 * Called only when the box on the sign-up form was left ticked, and never on its own. The row is
 * owned from the start, because the address is the one the account was opened with.
 *
 * No welcome email: the account is already receiving a confirmation, and two pieces of mail for
 * one action is how a first impression goes wrong. Every later send carries the unsubscribe link,
 * and the account page has the switch.
 *
 * Never throws and never fails the sign-up. An account that exists without a newsletter row is a
 * fine outcome; an account that failed to open because a mailing list was busy is not.
 */
export async function subscribeNewAccount({
  userId,
  email,
  firstName,
}: {
  userId: string;
  email: string | null;
  firstName: string | null;
}): Promise<void> {
  if (!newsletterConfigured() || !email) return;
  try {
    const db = supabaseAdmin();
    const { error } = await db
      .from("newsletter")
      .insert({ email, first_name: firstName, profile_id: userId, source: NEWSLETTER_SOURCE_SIGNUP });
    if (!error) return;
    // The address was already on the list, from the footer or from an account that came before.
    // Turn it back on and claim it only if nobody else holds it.
    if (error.code === "23505") {
      await db.from("newsletter").update({ unsubscribed_at: null }).eq("email", email).not("unsubscribed_at", "is", null);
      await db.from("newsletter").update({ profile_id: userId }).eq("email", email).is("profile_id", null);
      return;
    }
    console.error("newsletter: sign-up subscription failed:", error.code, error.message);
  } catch (error) {
    console.error("newsletter: sign-up subscription threw:", error instanceof Error ? error.message : "unknown");
  }
}
