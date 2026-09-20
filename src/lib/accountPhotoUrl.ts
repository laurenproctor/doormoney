import { supabaseAdmin } from "@/lib/supabase/server";
import { ACCOUNT_PHOTO_BUCKET, ownsPhotoPath } from "@/lib/accountPhoto";

/** Long enough to render the account page. The link is minted per view and never stored. */
const PHOTO_TTL_SECONDS = 3600;

/**
 * The stored path of this account's photo, or null.
 *
 * Read on its own rather than inside currentProfile (src/lib/auth.ts): every signed-in page
 * depends on that read, and a column it names has to exist. This one answers null when it cannot
 * answer, so the code can ship before migration 0042 lands and the account page still renders.
 *
 * Service role because photo_path is in no browser grant. Safe on the same terms as
 * currentProfile: userId comes from a verified session, and it is the only filter.
 */
export async function accountPhotoPathFor(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from("profiles").select("photo_path").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  const path = (data as { photo_path: string | null }).photo_path;
  return ownsPhotoPath(userId, path) ? path : null;
}

/**
 * A short-lived link to this account's own photo, or null. The bucket is private, so this is the
 * only way in, and it is only ever minted for the account holder looking at their own page.
 */
export async function accountPhotoUrl(userId: string): Promise<string | null> {
  const path = await accountPhotoPathFor(userId);
  if (!path) return null;
  const { data, error } = await supabaseAdmin().storage.from(ACCOUNT_PHOTO_BUCKET).createSignedUrl(path, PHOTO_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
