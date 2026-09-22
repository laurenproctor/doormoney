"use server";
import { revalidatePath } from "next/cache";
import { requireUser, currentProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail, newsletterWelcome } from "@/lib/email";
import {
  NEWSLETTER_SOURCE_ACCOUNT,
  findNewsletterRow,
  newsletterConfigured,
  normalizeEmail,
  type NewsletterRow,
} from "@/lib/newsletter";
import { SITE } from "@/lib/site";

/*
  What Door Money sends, decided from the account it sends to.

  The public form (src/app/actions/newsletter.ts) is untouched and stays the way an address with no
  account joins the list. These two are its signed-in counterpart: same table, same token, same
  `unsubscribed_at` the weekly sender reads, and no address typed into a form.

  Three rules hold this together:

  - **The session is the authority.** Nothing here reads a profile id, an email address or a row id
    from the browser. The address is the one on the verified session, and the owner is that
    session's user id.
  - **Nothing is claimed from somebody else.** A row already owned by another account is left
    exactly as it is, including its `unsubscribed_at`, and the caller is told.
  - **Both are idempotent.** Subscribing while subscribed writes nothing and says so; the same for
    unsubscribing while unsubscribed. No second row is ever created: the address is unique on
    lower(email) (migration 0009), so a race surfaces as 23505 and is read as "already on the
    list" rather than as a failure.

  A welcome email goes out for a genuinely new row and never for a re-enabled one, so somebody
  turning the switch off and on again is not welcomed twice.
*/

export type CommunicationsState = {
  ok: boolean;
  /** Where the switch stands after this ran, so the control can show the truth without a reload. */
  subscribed?: boolean;
  message?: string;
  error?: string;
};

const UNAVAILABLE = "That did not save. Try once more.";
const NOT_YOURS = "That address is on the list under another account. Tell Door Money and it will be sorted out.";

/** The address on the verified session, which is the only one either action will act on. */
async function accountEmail(userId: string, sessionEmail: string | null | undefined): Promise<string | null> {
  const fromSession = normalizeEmail(sessionEmail);
  if (fromSession) return fromSession;
  // A session with no address on it is not something this app makes, but the profile row carries
  // the same address and answering from it is better than failing silently.
  return normalizeEmail((await currentProfile(userId))?.email);
}

/** Whoever this row belongs to, it is not this account: leave every column of it alone. */
function belongsToAnother(row: NewsletterRow | null, userId: string): boolean {
  return Boolean(row && row.profile_id && row.profile_id !== userId);
}

/**
 * Puts this account on the new-fundraisers list, or claims the row it already has.
 *
 * An address that subscribed from the footer before the account existed is picked up here rather
 * than duplicated: the row keeps its id, its token and the date it joined, and gains an owner.
 */
export async function subscribeAccountNewsletter(): Promise<CommunicationsState> {
  const user = await requireUser("/dashboard/account");
  if (!newsletterConfigured()) return { ok: false, error: UNAVAILABLE };

  const email = await accountEmail(user.id, user.email);
  if (!email) return { ok: false, error: "This account has no email address to subscribe." };

  const db = supabaseAdmin();
  const profile = await currentProfile(user.id);
  // A name is optional: the email opens with it where there is one and without it where there is
  // not, exactly as it does for an address collected before the public form asked for a name.
  const firstName = profile?.first_name?.trim() || null;

  const existing = await findNewsletterRow({ userId: user.id, email });
  if (belongsToAnother(existing, user.id)) return { ok: false, error: NOT_YOURS };

  if (existing) {
    if (existing.unsubscribed_at === null && existing.profile_id === user.id) {
      return { ok: true, subscribed: true, message: "Already on the list." };
    }
    // One write, and only over the columns this account owns: the switch, the owner, and a name
    // where the row has none. An existing name is left alone, because the list is where it was
    // typed and this is not a name editor.
    const patch: Record<string, unknown> = { unsubscribed_at: null, profile_id: user.id };
    if (!existing.first_name && firstName) patch.first_name = firstName;
    const { error } = await db.from("newsletter").update(patch).eq("id", existing.id);
    if (error) {
      console.error("newsletter subscribe failed:", error.code, error.message);
      return { ok: false, error: UNAVAILABLE };
    }
    revalidatePath("/dashboard/account");
    // No welcome. This address has had one, or joined without wanting one.
    return { ok: true, subscribed: true, message: "Subscribed. The next one arrives the week a fundraiser opens." };
  }

  const { data, error } = await db
    .from("newsletter")
    .insert({ email, first_name: firstName, profile_id: user.id, source: NEWSLETTER_SOURCE_ACCOUNT })
    .select("unsubscribe_token")
    .single();

  if (error?.code === "23505") {
    // Something inserted the same address between the read above and this write. It is on the
    // list either way, so flip it on and claim it only if nobody else has.
    const again = await findNewsletterRow({ userId: user.id, email });
    if (belongsToAnother(again, user.id)) return { ok: false, error: NOT_YOURS };
    if (again) {
      await db.from("newsletter").update({ unsubscribed_at: null, profile_id: user.id }).eq("id", again.id);
      revalidatePath("/dashboard/account");
      return { ok: true, subscribed: true, message: "Subscribed. The next one arrives the week a fundraiser opens." };
    }
    return { ok: false, error: UNAVAILABLE };
  }
  if (error || !data) {
    console.error("newsletter subscribe insert failed:", error?.code, error?.message);
    return { ok: false, error: UNAVAILABLE };
  }

  revalidatePath("/dashboard/account");
  // A genuinely new address, so it gets the one welcome, carrying its own unsubscribe link. A
  // failed send never fails the subscription: the switch on the account page is the record.
  const unsubscribeUrl = `${SITE.url}/newsletter/unsubscribe?t=${data.unsubscribe_token}`;
  const sent = await sendEmail(newsletterWelcome({ to: email, firstName, unsubscribeUrl }));
  if (!sent.sent) console.warn(`newsletter welcome not sent to ${email}: ${sent.reason}`);
  return { ok: true, subscribed: true, message: "Subscribed. The next one arrives the week a fundraiser opens." };
}

/**
 * Takes this account off the list, the same way the link at the foot of the email does.
 *
 * The row stays, with its token, so the public unsubscribe link keeps working and coming back is
 * a clean flip rather than a new record.
 */
export async function unsubscribeAccountNewsletter(): Promise<CommunicationsState> {
  const user = await requireUser("/dashboard/account");
  if (!newsletterConfigured()) return { ok: false, error: UNAVAILABLE };

  const email = await accountEmail(user.id, user.email);
  const existing = await findNewsletterRow({ userId: user.id, email });
  if (belongsToAnother(existing, user.id)) return { ok: false, error: NOT_YOURS };

  // Never on the list, or already off it. Nothing to write, and nothing to apologize for.
  if (!existing) return { ok: true, subscribed: false, message: "Not subscribed." };
  if (existing.unsubscribed_at !== null && existing.profile_id === user.id) {
    return { ok: true, subscribed: false, message: "Not subscribed." };
  }

  const db = supabaseAdmin();
  const patch: Record<string, unknown> = { profile_id: user.id };
  if (existing.unsubscribed_at === null) patch.unsubscribed_at = new Date().toISOString();
  const { error } = await db.from("newsletter").update(patch).eq("id", existing.id);
  if (error) {
    console.error("newsletter unsubscribe failed:", error.code, error.message);
    return { ok: false, error: UNAVAILABLE };
  }

  revalidatePath("/dashboard/account");
  return { ok: true, subscribed: false, message: "Unsubscribed. No more new-fundraisers email." };
}
