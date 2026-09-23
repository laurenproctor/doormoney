/**
 * What the dashboard home shows about an organizer's own sponsorships.
 *
 * Deliberately small. The per-fundraiser cockpit already exists at /dashboard/runs/<id>, so this
 * is the summary a returning account needs to decide where to go: what exists, where each one
 * stands, whether anything is waiting, and how far a draft has come. It is four reads whatever the
 * number of fundraisers, never one read per row.
 *
 * The role split is the one the rest of the dashboard uses. `runs`, `lots` and `shows` are read
 * under the account's own session, so row level security scopes them to fundraisers this account
 * owns, and the category registry is the same two columns anon may read.
 * `purchases` has carried no client policies since 0001 and is read with the service role, the
 * way src/lib/dashboard.ts reads it: the filter names this act's own fundraisers, so nothing is
 * widened, and only totals and counts leave this function.
 *
 * Nothing here invents a number. A fundraiser with no goal reports `goalCents: null` and the page
 * draws no progress; a fundraiser with no priced option reports `lowestPriceCents: null` and the
 * page says nothing about price.
 */
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { isSettled, netCents, upcomingShow, type ShowRow } from "@/lib/dashboardModel";
import { periodLine } from "@/lib/periods";
import { draftProgress, readiness, type ReadinessAct } from "@/lib/readiness";

/** What a fundraiser's period covers, and the next date on it. Both absent where nothing is set. */
export type HomeNextDate = { on: string; city: string | null };

/** Where a draft has got to, in the same steps the fundraiser's own checklist counts. */
export type HomeDraftStep = { done: number; total: number; label: string | null; note: string | null; href: string | null };

export type HomeSponsorship = {
  id: string;
  slug: string | null;
  title: string;
  /** The stored status. `lifecycleLabel` turns it into a word. */
  status: string;
  categoryKey: string;
  /** "18 shows, Oct 3 to Nov 2", or null where the fundraiser has neither a count nor dates. */
  period: string | null;
  /** The next dated event, for a category that has them. Music is the only one today. */
  nextDate: HomeNextDate | null;
  /** Set on a draft and nothing else: money says nothing about one, so its progress does. */
  draftStep: HomeDraftStep | null;
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
  kind: string | null;
  starts_on: string | null;
  ends_on: string | null;
  show_count: number | null;
  bidding_closes_at: string | null;
  purpose: string | null;
  audience_description: string | null;
  sponsor_promise: string | null;
  verification_methods: string[] | null;
  verification_other: string | null;
};

type LotRow = { run_id: string; price_cents: number | null; mode: string | null };

type PurchaseRow = {
  amount_cents: number;
  refunded_cents: number;
  payment_status: string;
  mark_status: string;
  lots: { run_id: string } | null;
};

/** Just enough of the organizer for a draft's own checklist to be counted. */
export type HomeAct = ReadinessAct & { id: string };

/**
 * Every fundraiser this act owns, newest first, with the few figures the home shows.
 *
 * Cancelled ones are left out: they are an ending rather than work in progress, and the list is
 * about what is live enough to act on.
 *
 * Four reads whatever the number of fundraisers, and the fourth is the dates: a category with no
 * dated events simply has no rows in it. A draft is counted against the same readiness rules its
 * own page draws and publishRun enforces, so the step a home page shows and the step the
 * fundraiser shows cannot disagree.
 */
export async function loadHomeSponsorships(act: HomeAct | null, today: Date = new Date()): Promise<HomeSponsorships> {
  if (!act) return EMPTY;
  const actId = act.id;

  const sb = await supabaseServer();
  const { data: runData, error: runError } = await sb
    .from("runs")
    .select(
      "id,slug,title,status,category_key,fundraising_ends_on,goal_cents,kind,starts_on,ends_on,show_count,bidding_closes_at,purpose,audience_description,sponsor_promise,verification_methods,verification_other",
    )
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

  // All filtered to the fundraisers above, so no read reaches past this act. The category registry
  // is the exception and is the same list anon may read: a key and whether it may publish.
  const [lotResult, purchaseResult, showResult, categoryResult] = await Promise.all([
    sb.from("lots").select("run_id,price_cents,mode").in("run_id", ids),
    supabaseAdmin()
      .from("purchases")
      .select("amount_cents,refunded_cents,payment_status,mark_status,lots!inner(run_id)")
      .in("lots.run_id", ids),
    sb.from("shows").select("id,run_id,played_on,venue,city,played,attendance,photo_url").in("run_id", ids).order("played_on"),
    sb.from("fundraiser_categories").select("key,publish_enabled"),
  ]);

  let failed = false;
  for (const [what, result] of [["lots", lotResult], ["purchases", purchaseResult], ["shows", showResult], ["categories", categoryResult]] as const) {
    if (result.error) {
      console.error(`dashboard home: ${what} query failed:`, result.error.message);
      failed = true;
    }
  }

  const options = new Map<string, { count: number; auctions: number; lowest: number | null }>();
  for (const lot of (lotResult.data ?? []) as LotRow[]) {
    const seen = options.get(lot.run_id) ?? { count: 0, auctions: 0, lowest: null };
    seen.count += 1;
    if (lot.mode === "auction") seen.auctions += 1;
    if (typeof lot.price_cents === "number" && (seen.lowest === null || lot.price_cents < seen.lowest)) {
      seen.lowest = lot.price_cents;
    }
    options.set(lot.run_id, seen);
  }

  const dates = new Map<string, ShowRow[]>();
  for (const show of (showResult.data ?? []) as (ShowRow & { run_id: string })[]) {
    dates.set(show.run_id, [...(dates.get(show.run_id) ?? []), show]);
  }

  const publishable = new Map<string, boolean>();
  for (const row of (categoryResult.data ?? []) as { key: string; publish_enabled: boolean }[]) {
    publishable.set(row.key, row.publish_enabled === true);
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
    const categoryKey = run.category_key ?? "music";
    const title = run.title?.trim() || "Untitled sponsorship";
    const next = upcomingShow(dates.get(run.id) ?? [], today);
    return {
      id: run.id,
      slug: run.slug,
      title,
      status: run.status,
      categoryKey,
      period: periodLine({ title, categoryKey, kind: run.kind, showCount: run.show_count, startsOn: run.starts_on, endsOn: run.ends_on }),
      nextDate: next ? { on: next.played_on, city: next.city } : null,
      draftStep: run.status === "draft" ? step(act, run, option?.count ?? 0, option?.auctions ?? 0, publishable.get(categoryKey) === true) : null,
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
 * How far one draft has come, from the rules its own page draws.
 *
 * `readiness` is given the same rows publishRun reads, so the step here and the checklist there
 * cannot drift. Payout setup is not in the count: it never blocks a publish.
 */
function step(act: HomeAct, run: RunRow, lotCount: number, auctionCount: number, categoryPublishable: boolean): HomeDraftStep {
  const { done, total, next } = draftProgress(
    readiness({
      act,
      run: {
        category_key: run.category_key ?? "music",
        title: run.title,
        starts_on: run.starts_on,
        ends_on: run.ends_on,
        show_count: run.show_count,
        bidding_closes_at: run.bidding_closes_at,
        status: run.status,
        purpose: run.purpose,
        audience_description: run.audience_description,
        sponsor_promise: run.sponsor_promise,
        methods: run.verification_methods ?? [],
        other: run.verification_other,
      },
      lotCount,
      auctionCount,
      categoryPublishable,
    }),
  );
  // A checklist anchor belongs to the fundraiser's own page; anything else is already an address.
  const href = next?.href ? (next.href.startsWith("#") ? `/dashboard/runs/${run.id}${next.href}` : next.href) : null;
  return { done, total, label: next?.label ?? null, note: next?.note ?? null, href };
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
