/**
 * What the dashboard home shows about an organizer's own sponsorships.
 *
 * Deliberately small. The per-fundraiser cockpit already exists at /dashboard/runs/<id>, so this
 * is the summary a returning account needs to decide where to go: what exists, where each one
 * stands, whether anything is waiting, and how far a draft has come. It is six reads whatever the
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
import { isSettled, lifecycleLabel, netCents, upcomingShow, type ShowRow } from "@/lib/dashboardModel";
import type { SearchJump } from "@/components/dashboard/WorkspaceSearch";
import { periodLine } from "@/lib/periods";
import { draftProgress, readiness, type ReadinessAct } from "@/lib/readiness";
import { incompleteOffers, type OfferReadinessLot } from "@/lib/offer-readiness";
import { catalogTemplates } from "@/lib/opportunities";

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
  /**
   * Money taken on this fundraiser: every sponsorship and every backing that was charged, refunds
   * already off. Bids are not in it and never are, because a bid is a hold on a card, not money
   * taken. It is the same sum src/lib/dashboard.ts reports for one fundraiser, so the figure on
   * Today, the figure on the Money page and the figure on the fundraiser's own page agree.
   */
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

/**
 * A spot, with everything the publish gate asks of it.
 *
 * The offer-terms columns are here because the draft's step count is the publish rule: an option
 * whose offer is unfinished does not publish, so it does not count as a finished step either
 * (src/lib/offer-readiness.ts, and migrations 0060 and 0061, which hold the same rule in SQL).
 */
type LotRow = OfferReadinessLot & { run_id: string; price_cents: number | null; mode: string | null };

/** Only the name is read off a template here, to say which option is unfinished. */
type TemplateName = { key: string; name: string };

type PurchaseRow = {
  amount_cents: number;
  refunded_cents: number;
  payment_status: string;
  mark_status: string;
  lots: { run_id: string } | null;
};

/** A backing through the widget. The other half of the money one fundraiser has taken. */
type BackingRow = { run_id: string; amount_cents: number; refunded_cents: number; payment_status: string };

/** Just enough of the organizer for a draft's own checklist to be counted. */
export type HomeAct = ReadinessAct & { id: string };

/**
 * Every fundraiser this act owns, newest first, with the few figures the home shows.
 *
 * Cancelled ones are left out: they are an ending rather than work in progress, and the list is
 * about what is live enough to act on.
 *
 * Six reads whatever the number of fundraisers, and the third is the dates: a category with no
 * dated events simply has no rows in it. A draft is counted against the same readiness rules its
 * own page draws and publishRun enforces, offer terms included, so the step a home page shows and
 * the step the fundraiser shows cannot disagree.
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
  const [lotResult, purchaseResult, showResult, categoryResult, templateResult, backingResult] = await Promise.all([
    sb.from("lots").select("run_id,price_cents,mode,surface_key,status,reach_estimate,reach_basis,offer_terms,exclusive,terms_grandfathered").in("run_id", ids),
    supabaseAdmin()
      .from("purchases")
      .select("amount_cents,refunded_cents,payment_status,mark_status,lots!inner(run_id)")
      .in("lots.run_id", ids),
    sb.from("shows").select("id,run_id,played_on,venue,city,played,attendance,photo_url").in("run_id", ids).order("played_on"),
    sb.from("fundraiser_categories").select("key,publish_enabled"),
    sb.from("surfaces").select("key,name"),
    // The other half of what a fundraiser has taken. Read with the service role for the reason
    // purchases are: backings left the Data API in migration 0029, the filter names this act's own
    // fundraisers, and only a total per fundraiser leaves this function.
    supabaseAdmin().from("backings").select("run_id,amount_cents,refunded_cents,payment_status").in("run_id", ids),
  ]);

  let failed = false;
  for (const [what, result] of [["lots", lotResult], ["purchases", purchaseResult], ["shows", showResult], ["categories", categoryResult], ["templates", templateResult], ["backings", backingResult]] as const) {
    if (result.error) {
      console.error(`dashboard home: ${what} query failed:`, result.error.message);
      failed = true;
    }
  }

  // The spots themselves, not only their counts: a draft's step is the publish rule, and that rule
  // asks each spot whether its offer is finished.
  const spots = new Map<string, LotRow[]>();
  const options = new Map<string, { count: number; auctions: number; lowest: number | null }>();
  for (const lot of (lotResult.data ?? []) as LotRow[]) {
    spots.set(lot.run_id, [...(spots.get(lot.run_id) ?? []), lot]);
    const seen = options.get(lot.run_id) ?? { count: 0, auctions: 0, lowest: null };
    seen.count += 1;
    if (lot.mode === "auction") seen.auctions += 1;
    if (typeof lot.price_cents === "number" && (seen.lowest === null || lot.price_cents < seen.lowest)) {
      seen.lowest = lot.price_cents;
    }
    options.set(lot.run_id, seen);
  }

  // Names only, so an unfinished option can be named. The catalog stands in where the read failed
  // or the registry is empty, the same fallback loadTemplates uses; a template with neither is
  // named by its key rather than left blank.
  const templateRows = (templateResult.data ?? []) as TemplateName[];
  const templates: TemplateName[] = templateRows.length > 0 ? templateRows : catalogTemplates().map((t) => ({ key: t.key, name: t.name }));

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
  for (const row of ((backingResult.data ?? []) as BackingRow[])) {
    const seen = money.get(row.run_id) ?? { raised: 0, waiting: 0 };
    if (isSettled(row.payment_status)) seen.raised += netCents(row);
    money.set(row.run_id, seen);
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
      draftStep: run.status === "draft" ? draftStep(act, run, spots.get(run.id) ?? [], templates, publishable.get(categoryKey) === true) : null,
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
 *
 * The spots are passed whole rather than counted, because counting them was the bug. Until
 * 2026-09-23 this handed `readiness` a lot count and nothing else, so the options step went done
 * the moment one spot existed and Today told an organizer "4 of 4 steps done" about a draft
 * publishRun would refuse for an unfinished offer. `incompleteOffers` is the same function
 * publishBlockers is given on the fundraiser's own page and in publishRun.
 *
 * Exported for its own test: everything above it needs a database and this needs nothing.
 */
export function draftStep(
  act: HomeAct,
  run: RunRow,
  lots: readonly LotRow[],
  templates: readonly TemplateName[],
  categoryPublishable: boolean,
): HomeDraftStep {
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
      lotCount: lots.length,
      auctionCount: lots.filter((l) => l.mode === "auction").length,
      categoryPublishable,
      incompleteOffers: incompleteOffers(lots, templates),
    }),
  );
  // A checklist anchor belongs to the fundraiser's own page; anything else is already an address.
  const href = next?.href ? (next.href.startsWith("#") ? `/dashboard/runs/${run.id}${next.href}` : next.href) : null;
  return { done, total, label: next?.label ?? null, note: next?.note ?? null, href };
}

/**
 * Every fundraiser this account owns, as somewhere the top bar's search can send them.
 *
 * Title and status only: the search matches on the title and the hint tells two drafts of similar
 * names apart. One small read, for the pages that do not already hold the rows; a page that does
 * (Today, and the Money page) builds the same list out of what it read and asks for nothing.
 *
 * Cancelled ones are left out, the same way loadHomeSponsorships leaves them out: a search that
 * offers an ending as a destination is offering the wrong thing.
 */
export async function loadFundraiserJumps(actId: string | null): Promise<SearchJump[]> {
  if (!actId) return [];
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("runs")
    .select("id,title,status")
    .eq("act_id", actId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(JUMP_LIMIT);
  if (error) {
    console.error("dashboard search: runs query failed:", error.message);
    return [];
  }
  return ((data ?? []) as { id: string; title: string | null; status: string }[]).map((run) =>
    jumpTo({ id: run.id, title: run.title, status: run.status }),
  );
}

/** As many as one account is likely to have. Past this the search is not how somebody finds one. */
const JUMP_LIMIT = 50;

/** One fundraiser, as a destination. Shared so the two ways of building the list say the same thing. */
export function jumpTo(run: { id: string; title: string | null; status: string; period?: string | null }): SearchJump {
  return {
    label: run.title?.trim() || "Untitled sponsorship",
    href: `/dashboard/runs/${run.id}`,
    hint: [lifecycleLabel(run.status), run.period].filter(Boolean).join(" \u00b7 "),
  };
}
