import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { CATALOG, tierPlace } from "@/lib/catalog";
import type { SupportKind } from "@/lib/profile";

/**
 * Reading a patron's public profile, and reading what the patron themselves may put on it.
 *
 * Two kinds of read live here and they are deliberately different.
 *
 * The public page reads the sanitised views from migration 0023 through the ordinary anon client.
 * Those views carry a username, a name, some words and some already-public activity, and nothing
 * else: no email address, no account id, no Stripe id, no payment status, no amount. There is no
 * private column to forget to drop, because no private column is ever selected.
 *
 * The management page reads with the service role, the way the Backed page does, because
 * purchases, backings and bids have never been open to the browser. The caller proves the session
 * first and every row is filtered to that account's own patron rows before anything is shaped.
 */

const PHOTO_BUCKET = "patron-photos";
/** Long enough to render the page and be shared once. Short enough that hiding a profile bites. */
const PHOTO_TTL_SECONDS = 3600;

const PAID = ["held", "released", "partially_refunded"];

// ---------------------------------------------------------------
// The public page
// ---------------------------------------------------------------

export type PublicProfile = {
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  interests: string[];
  photoPath: string | null;
  patronSince: string;
};

export type PublicActivity = {
  kind: SupportKind;
  actName: string;
  actSlug: string;
  runTitle: string;
  runStatus: string;
  detail: string;
  supportedAt: string;
};

type ProfileRow = {
  username: string;
  display_name: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  interests: string[] | null;
  photo_path: string | null;
  patron_since: string;
};

/** The published profile at this username, or null. A private one reads exactly like a missing one. */
export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("public_patron_profiles")
    .select("username,display_name,bio,location,website,interests,photo_path,patron_since")
    .eq("username", username)
    .maybeSingle();
  const row = data as ProfileRow | null;
  if (!row) return null;
  return {
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    location: row.location,
    website: row.website,
    interests: row.interests ?? [],
    photoPath: row.photo_path,
    patronSince: row.patron_since,
  };
}

type ActivityRow = {
  kind: string;
  act_name: string;
  act_slug: string;
  run_title: string;
  run_status: string;
  detail: string | null;
  supported_at: string;
};

/** Only what this patron ticked, newest first. Never an amount, because the view holds none. */
export async function getPublicActivity(username: string): Promise<PublicActivity[]> {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("public_patron_activity")
    .select("kind,act_name,act_slug,run_title,run_status,detail,supported_at")
    .eq("username", username)
    .order("supported_at", { ascending: false });
  return ((data ?? []) as ActivityRow[]).map((r) => ({
    kind: r.kind === "backing" ? "backing" : "placement",
    actName: r.act_name,
    actSlug: r.act_slug,
    runTitle: r.run_title,
    runStatus: r.run_status,
    detail: r.kind === "backing" ? `A name on ${tierPlace(r.detail ?? "")}` : (r.detail ?? "Placement"),
    supportedAt: r.supported_at,
  }));
}

/** Every published profile, for the sitemap. A private one is not in the view, so it is not here. */
export async function listPublishedUsernames(): Promise<{ username: string; publishedAt: string | null }[]> {
  const sb = await supabaseServer();
  const { data } = await sb.from("public_patron_profiles").select("username,published_at");
  return ((data ?? []) as { username: string; published_at: string | null }[]).map((r) => ({
    username: r.username,
    publishedAt: r.published_at,
  }));
}

/**
 * A short-lived link to a profile photograph. The bucket is private, so this is the only way in and
 * a profile that goes back to private stops minting them. Callers only ask for published profiles.
 */
export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin().storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Where an old word points now, or null.
 *
 * Retired usernames are kept for good (migration 0023), so a link somebody wrote down a year ago
 * still lands on the right person. The map from an old word to an account is server-side only.
 */
export async function currentUsernameFor(retired: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("username_history").select("profile_id").eq("username", retired).maybeSingle();
  const profileId = (data as { profile_id: string } | null)?.profile_id;
  if (!profileId) return null;
  const { data: profile } = await admin.from("profiles").select("username").eq("id", profileId).maybeSingle();
  return (profile as { username: string | null } | null)?.username ?? null;
}

/** The board address an old one became, or null. Handle and board address move together. */
export async function currentSlugFor(retired: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("username_history").select("profile_id").eq("username", retired).maybeSingle();
  const profileId = (data as { profile_id: string } | null)?.profile_id;
  if (!profileId) return null;
  const { data: act } = await admin.from("acts").select("slug").eq("owner_id", profileId).order("created_at").limit(1).maybeSingle();
  return (act as { slug: string } | null)?.slug ?? null;
}

// ---------------------------------------------------------------
// The patron's own side
// ---------------------------------------------------------------

export type OwnProfile = {
  displayName: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  interests: string[];
  photoPath: string | null;
  published: boolean;
  patronSince: string;
};

/** This account's own profile row, under its own session. Null when it has never made one. */
export async function ownProfile(userId: string): Promise<OwnProfile | null> {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("patron_profiles")
    .select("display_name,bio,location,website,interests,photo_path,published,patron_since")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    display_name: string;
    bio: string | null;
    location: string | null;
    website: string | null;
    interests: string[] | null;
    photo_path: string | null;
    published: boolean;
    patron_since: string;
  };
  return {
    displayName: row.display_name,
    bio: row.bio,
    location: row.location,
    website: row.website,
    interests: row.interests ?? [],
    photoPath: row.photo_path,
    published: row.published,
    patronSince: row.patron_since,
  };
}

/**
 * The patron rows this account owns.
 *
 * Two ways in, and both of them are the account's own: rows already linked to it, and rows whose
 * contact address is the verified address on the session. A typed-in address is never enough.
 */
export async function patronIdsFor(userId: string, verifiedEmail: string | null): Promise<string[]> {
  const admin = supabaseAdmin();
  const byProfile = admin.from("patrons").select("id").eq("profile_id", userId);
  const byEmail = verifiedEmail ? admin.from("patrons").select("id").ilike("contact_email", verifiedEmail) : null;
  const [linked, addressed] = await Promise.all([
    byProfile,
    byEmail ?? Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  const ids = new Set<string>();
  for (const row of (linked.data ?? []) as { id: string }[]) ids.add(row.id);
  for (const row of ((addressed as { data: { id: string }[] | null }).data ?? [])) ids.add(row.id);
  return [...ids];
}

/**
 * Ties a patron's paid history to their account, on the server, on the verified address alone.
 *
 * claim_patron_rows only fills a row that has no owner yet (migration 0021), so a row already
 * belonging to somebody else is never taken, and several rows under one verified address all come
 * to the same account. Nothing financial is rewritten: only the link.
 */
export async function linkPatronRows(userId: string, verifiedEmail: string | null): Promise<number> {
  if (!verifiedEmail) return 0;
  const { data, error } = await supabaseAdmin().rpc("claim_patron_rows", { p_user_id: userId, p_email: verifiedEmail });
  if (error) {
    console.error("linking patron rows failed:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export type EligibleItem = {
  kind: SupportKind;
  /** The purchase or backing id. Used only inside the signed-in page, and checked again on write. */
  id: string;
  actName: string;
  actSlug: string;
  runTitle: string;
  runStatus: string;
  detail: string;
  supportedAt: string;
  /** Whether the patron has put this one on their public page. Off until they say so. */
  shown: boolean;
  /** Won through a bid the patron asked to keep anonymous, so it is not offered at all. */
  anonymous: boolean;
};

const surfaceName = (label: string | null, key: string) => label ?? CATALOG.find((c) => c.key === key)?.name ?? key;

/**
 * Everything this account could show, and whether each one is showing.
 *
 * Held or paid out only: a checkout nobody finished and a refunded placement are not support and
 * do not belong on a page about support. No amount is read, so none can be leaked to the browser.
 */
export async function eligibleActivity(userId: string, verifiedEmail: string | null): Promise<EligibleItem[]> {
  const patronIds = await patronIdsFor(userId, verifiedEmail);
  if (patronIds.length === 0) return [];

  const admin = supabaseAdmin();
  const [purchases, backings, shown] = await Promise.all([
    admin
      .from("purchases")
      .select("id,created_at,patron_id,lots!inner(id,label,surface_key,runs!inner(title,status,acts!inner(name,slug)))")
      .in("patron_id", patronIds)
      .in("payment_status", PAID)
      .order("created_at", { ascending: false }),
    admin
      .from("backings")
      .select("id,created_at,tier,runs!inner(title,status,acts!inner(name,slug))")
      .in("patron_id", patronIds)
      .in("payment_status", PAID)
      .order("created_at", { ascending: false }),
    admin.from("patron_profile_items").select("purchase_id,backing_id").eq("profile_id", userId),
  ]);

  type PurchaseRow = {
    id: string;
    created_at: string;
    patron_id: string;
    lots: { id: string; label: string | null; surface_key: string; runs: { title: string; status: string; acts: { name: string; slug: string } } };
  };
  type BackingRow = { id: string; created_at: string; tier: string; runs: { title: string; status: string; acts: { name: string; slug: string } } };

  const purchaseRows = (purchases.data ?? []) as unknown as PurchaseRow[];

  // An anonymous bid stays anonymous. A spot won through one is never offered for publication,
  // whatever else the patron ticks; the public view refuses it a second time.
  const anonymousLots = new Set<string>();
  const lotIds = purchaseRows.map((p) => p.lots.id);
  if (lotIds.length) {
    const { data } = await admin
      .from("bids")
      .select("lot_id")
      .in("lot_id", lotIds)
      .in("patron_id", patronIds)
      .eq("anonymous", true);
    for (const row of (data ?? []) as { lot_id: string }[]) anonymousLots.add(row.lot_id);
  }

  const shownPurchases = new Set<string>();
  const shownBackings = new Set<string>();
  for (const row of (shown.data ?? []) as { purchase_id: string | null; backing_id: string | null }[]) {
    if (row.purchase_id) shownPurchases.add(row.purchase_id);
    if (row.backing_id) shownBackings.add(row.backing_id);
  }

  const items: EligibleItem[] = [
    ...purchaseRows.map((p) => ({
      kind: "placement" as const,
      id: p.id,
      actName: p.lots.runs.acts.name,
      actSlug: p.lots.runs.acts.slug,
      runTitle: p.lots.runs.title,
      runStatus: p.lots.runs.status,
      detail: surfaceName(p.lots.label, p.lots.surface_key),
      supportedAt: p.created_at,
      shown: shownPurchases.has(p.id),
      anonymous: anonymousLots.has(p.lots.id),
    })),
    ...((backings.data ?? []) as unknown as BackingRow[]).map((b) => ({
      kind: "backing" as const,
      id: b.id,
      actName: b.runs.acts.name,
      actSlug: b.runs.acts.slug,
      runTitle: b.runs.title,
      runStatus: b.runs.status,
      detail: `A name on ${tierPlace(b.tier)}`,
      supportedAt: b.created_at,
      shown: shownBackings.has(b.id),
      anonymous: false,
    })),
  ];

  return items.sort((a, b) => b.supportedAt.localeCompare(a.supportedAt));
}

/**
 * When this account started backing musicians: the first thing it paid for, or the day it opened.
 * Only ever rendered as a year.
 */
export async function patronSinceFor(userId: string, verifiedEmail: string | null, accountCreatedAt: string): Promise<string> {
  const patronIds = await patronIdsFor(userId, verifiedEmail);
  if (patronIds.length === 0) return accountCreatedAt;
  const admin = supabaseAdmin();
  const [purchase, backing] = await Promise.all([
    admin.from("purchases").select("created_at").in("patron_id", patronIds).in("payment_status", PAID).order("created_at").limit(1).maybeSingle(),
    admin.from("backings").select("created_at").in("patron_id", patronIds).in("payment_status", PAID).order("created_at").limit(1).maybeSingle(),
  ]);
  const dates = [
    accountCreatedAt,
    (purchase.data as { created_at: string } | null)?.created_at,
    (backing.data as { created_at: string } | null)?.created_at,
  ].filter((d): d is string => Boolean(d));
  return dates.sort()[0];
}
