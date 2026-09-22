/**
 * What the dashboard home shows about an organizer's own sponsorships.
 *
 * Deliberately small. The per-fundraiser cockpit already exists at /dashboard/runs/<id>, so this
 * is the summary a returning account needs to decide where to go: what exists, where each one
 * stands, and whether anything is waiting. It is three queries whatever the number of
 * fundraisers, never one read per row.
 *
 * The role split is the one the rest of the dashboard uses. `runs` and `lots` are read under the
 * account's own session, so row level security scopes them to fundraisers this account owns.
 * `purchases` has carried no client policies since 0001 and is read with the service role, the
 * way src/lib/dashboard.ts reads it: the filter names this act's own fundraisers, so nothing is
 * widened, and only totals and counts leave this function.
 *
 * Nothing here invents a number. A fundraiser with no goal reports `goalCents: null` and the page
 * draws no progress; a fundraiser with no priced option reports `lowestPriceCents: null` and the
 * page says nothing about price.
 */
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { isSettled, netCents } from "@/lib/dashboardModel";

export type HomeSponsorship = {
  id: string;
  slug: string | null;
  title: string;
  /** The stored status. `lifecycleLabel` turns it into a word. */
  status: string;
  categoryKey: string;
  /** runs.fundraising_ends_on. Never the activity end date, and never an option's closing time. */
  closesOn: string | null;
  /** Null unless the organizer set one. No goal, no progress bar. */
  goalCents: number | null;
  /** Settled money on this fundraiser, refunds already taken off. */
  raisedCents: number;
  optionCount: number;
  lowestPriceCents: number | null;
  /** Sponsors whose materials are waiting on this organizer's answer. */
  waitingCount: number;
};

export type HomeSponsorships = {
  rows: HomeSponsorship[];
  /** True when a read failed, so the page can say a figure may be missing rather than zero. */
  failed: boolean;
};

const EMPTY: HomeSponsorships = { rows: [], failed: false };

type RunRow = {
  id: string;
  slug: string | null;
  title: string | null;
  status: string;
  category_key: string | null;
  fundraising_ends_on: string | null;
  goal_cents: number | null;
};

type LotRow = { run_id: string; price_cents: number | null };

type PurchaseRow = {
  amount_cents: number;
  refunded_cents: number;
  payment_status: string;
  mark_status: string;
  lots: { run_id: string } | null;
};

/**
 * Every fundraiser this act owns, newest first, with the few figures the home shows.
 *
 * Cancelled ones are left out: they are an ending rather than work in progress, and the list is
 * about what is live enough to act on.
 */
export async function loadHomeSponsorships(actId: string | null): Promise<HomeSponsorships> {
  if (!actId) return EMPTY;

  const sb = await supabaseServer();
  const { data: runData, error: runError } = await sb
    .from("runs")
    .select("id,slug,title,status,category_key,fundraising_ends_on,goal_cents")
    .eq("act_id", actId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (runError) {
    console.error("dashboard home: runs query failed:", runError.message);
    return { rows: [], failed: true };
  }

  const runs = (runData ?? []) as RunRow[];
  if (runs.length === 0) return EMPTY;
  const ids = runs.map((r) => r.id);

  // Both filtered to the fundraisers above, so neither read reaches past this act.
  const [lotResult, purchaseResult] = await Promise.all([
    sb.from("lots").select("run_id,price_cents").in("run_id", ids),
    supabaseAdmin()
      .from("purchases")
      .select("amount_cents,refunded_cents,payment_status,mark_status,lots!inner(run_id)")
      .in("lots.run_id", ids),
  ]);

  let failed = false;
  for (const [what, result] of [["lots", lotResult], ["purchases", purchaseResult]] as const) {
    if (result.error) {
      console.error(`dashboard home: ${what} query failed:`, result.error.message);
      failed = true;
    }
  }

  const options = new Map<string, { count: number; lowest: number | null }>();
  for (const lot of (lotResult.data ?? []) as LotRow[]) {
    const seen = options.get(lot.run_id) ?? { count: 0, lowest: null };
    seen.count += 1;
    if (typeof lot.price_cents === "number" && (seen.lowest === null || lot.price_cents < seen.lowest)) {
      seen.lowest = lot.price_cents;
    }
    options.set(lot.run_id, seen);
  }

  const money = new Map<string, { raised: number; waiting: number }>();
  for (const row of ((purchaseResult.data ?? []) as unknown as PurchaseRow[])) {
    const runId = row.lots?.run_id;
    if (!runId) continue;
    const seen = money.get(runId) ?? { raised: 0, waiting: 0 };
    if (isSettled(row.payment_status)) seen.raised += netCents(row);
    if (row.mark_status === "submitted") seen.waiting += 1;
    money.set(runId, seen);
  }

  const rows = runs.map<HomeSponsorship>((run) => {
    const option = options.get(run.id);
    const paid = money.get(run.id);
    return {
      id: run.id,
      slug: run.slug,
      title: run.title?.trim() || "Untitled sponsorship",
      status: run.status,
      categoryKey: run.category_key ?? "music",
      closesOn: run.fundraising_ends_on,
      goalCents: run.goal_cents,
      raisedCents: paid?.raised ?? 0,
      optionCount: option?.count ?? 0,
      lowestPriceCents: option?.lowest ?? null,
      waitingCount: paid?.waiting ?? 0,
    };
  });

  return { rows, failed };
}

/**
 * What is missing from the organizer's public record, as short prompts.
 *
 * Only what the account can actually act on, and only things a sponsor would notice. Payout setup
 * is last because it never blocks a fundraiser: Door Money holds the money either way and the
 * share waits until Stripe is finished.
 */
export function profileGaps(act: {
  bio: string | null;
  photo_url: string | null;
  city: string | null;
  website: string | null;
  instagram: string | null;
  audience_description: string | null;
  stripe_payouts_enabled: boolean;
} | null): { label: string; href: string }[] {
  if (!act) return [];
  const blank = (value: string | null) => !value || value.trim().length === 0;
  const gaps: { label: string; href: string }[] = [];
  if (blank(act.photo_url)) gaps.push({ label: "Add a photo", href: "/dashboard/act" });
  if (blank(act.bio)) gaps.push({ label: "Add a short bio", href: "/dashboard/act" });
  if (blank(act.audience_description)) gaps.push({ label: "Describe your audience", href: "/dashboard/act" });
  if (blank(act.city)) gaps.push({ label: "Add a location", href: "/dashboard/act" });
  if (blank(act.website) && blank(act.instagram)) gaps.push({ label: "Add a link", href: "/dashboard/act" });
  if (!act.stripe_payouts_enabled) gaps.push({ label: "Set up payouts", href: "/dashboard/payouts" });
  return gaps;
}
