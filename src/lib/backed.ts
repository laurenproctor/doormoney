import { supabaseAdmin } from "@/lib/supabase/server";
import { CATALOG } from "@/lib/catalog";

/**
 * What one account has put behind musicians: placements bought, runs backed, bids placed.
 *
 * Read with the service role on purpose. purchases, backings and bids have carried no client
 * policies since 0001, because they hold what a patron paid and what a mark is; opening them to
 * the browser to build this page would be the wrong trade. Instead the caller proves who is
 * signed in, this reads only the rows tied to that account, and the page returns the shaped
 * result. Nothing here is reachable without a session, and nothing widens RLS.
 *
 * The tie is patrons.profile_id, set at sign-up from the email address (migration 0021), plus a
 * fallback on the address itself for a patron who paid after signing up.
 */

export type BackedPlacement = {
  id: string;
  actName: string;
  actSlug: string;
  runTitle: string;
  runStatus: string;
  lotName: string;
  amountCents: number;
  paymentStatus: string;
  markStatus: string;
  wonAtAuction: boolean;
  createdAt: string;
};

export type BackedRun = {
  id: string;
  actName: string;
  actSlug: string;
  runTitle: string;
  tier: string;
  displayName: string;
  amountCents: number;
  paymentStatus: string;
  createdAt: string;
};

export type PlacedBid = {
  id: string;
  actName: string;
  actSlug: string;
  lotName: string;
  amountCents: number;
  anonymous: boolean;
  createdAt: string;
  /** Where this bid ended up: still the one to beat, outbid, won, or let go. */
  outcome: "leading" | "outbid" | "won" | "passed" | "closed";
  topCents: number;
};

export type Backed = {
  patronIds: string[];
  placements: BackedPlacement[];
  runs: BackedRun[];
  bids: PlacedBid[];
  /** Everything actually paid, placements and backings together. */
  totalCents: number;
};

const EMPTY: Backed = { patronIds: [], placements: [], runs: [], bids: [], totalCents: 0 };

const lotName = (label: string | null, surfaceKey: string) => label ?? CATALOG.find((c) => c.key === surfaceKey)?.name ?? surfaceKey;

/** The patron rows this account owns, by link or by address. */
async function patronIdsFor(userId: string, email: string | null | undefined) {
  const admin = supabaseAdmin();
  const byProfile = admin.from("patrons").select("id").eq("profile_id", userId);
  const byEmail = email ? admin.from("patrons").select("id").ilike("contact_email", email.trim()) : null;
  const [linked, addressed] = await Promise.all([byProfile, byEmail ?? Promise.resolve({ data: [] as { id: string }[] })]);
  const ids = new Set<string>();
  for (const row of (linked.data ?? []) as { id: string }[]) ids.add(row.id);
  for (const row of ((addressed as { data: { id: string }[] | null }).data ?? [])) ids.add(row.id);
  return [...ids];
}

export async function backedBy(userId: string, email: string | null | undefined): Promise<Backed> {
  const patronIds = await patronIdsFor(userId, email);
  if (patronIds.length === 0) return EMPTY;

  const admin = supabaseAdmin();
  const [purchases, backings, bids] = await Promise.all([
    admin
      .from("purchases")
      .select("id,amount_cents,payment_status,mark_status,created_at,lots!inner(label,surface_key,winner_bid_id,runs!inner(title,status,acts!inner(name,slug)))")
      .in("patron_id", patronIds)
      .order("created_at", { ascending: false }),
    admin
      .from("backings")
      .select("id,tier,amount_cents,display_name,payment_status,created_at,runs!inner(title,acts!inner(name,slug))")
      .in("patron_id", patronIds)
      .order("created_at", { ascending: false }),
    admin
      .from("bids")
      .select("id,amount_cents,anonymous,passed_at,created_at,lots!inner(id,label,surface_key,status,winner_bid_id,runs!inner(acts!inner(name,slug)))")
      .in("patron_id", patronIds)
      .order("created_at", { ascending: false }),
  ]);

  type PurchaseRow = {
    id: string; amount_cents: number; payment_status: string; mark_status: string; created_at: string;
    lots: { label: string | null; surface_key: string; winner_bid_id: string | null; runs: { title: string; status: string; acts: { name: string; slug: string } } };
  };
  type BackingRow = {
    id: string; tier: string; amount_cents: number; display_name: string; payment_status: string; created_at: string;
    runs: { title: string; acts: { name: string; slug: string } };
  };
  type BidRow = {
    id: string; amount_cents: number; anonymous: boolean; passed_at: string | null; created_at: string;
    lots: { id: string; label: string | null; surface_key: string; status: string; winner_bid_id: string | null; runs: { acts: { name: string; slug: string } } };
  };

  const placements: BackedPlacement[] = ((purchases.data ?? []) as unknown as PurchaseRow[]).map((p) => ({
    id: p.id,
    actName: p.lots.runs.acts.name,
    actSlug: p.lots.runs.acts.slug,
    runTitle: p.lots.runs.title,
    runStatus: p.lots.runs.status,
    lotName: lotName(p.lots.label, p.lots.surface_key),
    amountCents: p.amount_cents,
    paymentStatus: p.payment_status,
    markStatus: p.mark_status,
    wonAtAuction: Boolean(p.lots.winner_bid_id),
    createdAt: p.created_at,
  }));

  const runs: BackedRun[] = ((backings.data ?? []) as unknown as BackingRow[]).map((b) => ({
    id: b.id,
    actName: b.runs.acts.name,
    actSlug: b.runs.acts.slug,
    runTitle: b.runs.title,
    tier: b.tier,
    displayName: b.display_name,
    amountCents: b.amount_cents,
    paymentStatus: b.payment_status,
    createdAt: b.created_at,
  }));

  // How a bid ended needs the rest of the bidding on that lot, so ask for the tops in one go.
  const bidRows = (bids.data ?? []) as unknown as BidRow[];
  const lotIds = [...new Set(bidRows.map((b) => b.lots.id))];
  const tops = new Map<string, number>();
  if (lotIds.length) {
    const { data } = await admin.from("bids").select("lot_id,amount_cents,passed_at").in("lot_id", lotIds);
    for (const row of (data ?? []) as { lot_id: string; amount_cents: number; passed_at: string | null }[]) {
      if (row.passed_at) continue;
      tops.set(row.lot_id, Math.max(tops.get(row.lot_id) ?? 0, row.amount_cents));
    }
  }

  const placed: PlacedBid[] = bidRows.map((b) => {
    const top = tops.get(b.lots.id) ?? b.amount_cents;
    const open = b.lots.status === "open";
    const outcome: PlacedBid["outcome"] = b.passed_at
      ? "passed"
      : b.lots.winner_bid_id === b.id
        ? "won"
        : open
          ? b.amount_cents >= top
            ? "leading"
            : "outbid"
          : "closed";
    return {
      id: b.id,
      actName: b.lots.runs.acts.name,
      actSlug: b.lots.runs.acts.slug,
      lotName: lotName(b.lots.label, b.lots.surface_key),
      amountCents: b.amount_cents,
      anonymous: b.anonymous,
      createdAt: b.created_at,
      outcome,
      topCents: top,
    };
  });

  const paid = (status: string) => status === "held" || status === "released" || status === "partially_refunded";
  const totalCents =
    placements.filter((p) => paid(p.paymentStatus)).reduce((n, p) => n + p.amountCents, 0) +
    runs.filter((r) => paid(r.paymentStatus)).reduce((n, r) => n + r.amountCents, 0);

  return { patronIds, placements, runs, bids: placed, totalCents };
}
