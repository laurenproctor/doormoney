import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { lotName } from "@/lib/purchases";
import type { OwnedAct } from "@/lib/auth";
import {
  defaultRun,
  groupPayouts,
  logoState,
  playedCount,
  preparationItems,
  daysRemaining,
  raisedCents,
  selectableRuns,
  upcomingShow,
  type PayoutTotals,
  type PrepItem,
  type ShowRow,
  type WorkRow,
} from "@/lib/dashboardModel";

/*
  Everything the dashboard reads, in one place and on the server.

  Server-only by construction rather than by marker: this imports src/lib/supabase/server.ts, which
  imports next/headers, which throws the moment a client component pulls it in. That is the same
  guarantee the "server-only" package sells, without adding a dependency for it.

  Two rules hold this together. Every query is scoped to the act the signed-in user owns, and
  nothing private crosses into a client component: no email addresses, no Stripe ids, no patron
  ids, no funding tokens. What comes back is already shaped for the screen, so the components do
  not know a column name.

  src/lib/dashboardModel.ts does the arithmetic and the mappings and has no database in it, which
  is what lets tests/dashboard.test.ts check the sums.
*/

export type DashboardRun = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  startsOn: string;
  endsOn: string;
  status: string;
  showCount: number;
};

export type DashboardMetrics = {
  raisedCents: number;
  sponsorshipsSold: number;
  patrons: number;
  showsPlayed: number;
  showsTotal: number;
  daysLeft: number;
};

export type DashboardView = {
  act: { name: string; slug: string; city: string | null };
  runs: DashboardRun[];
  selected: DashboardRun | null;
  metrics: DashboardMetrics | null;
  work: WorkRow[];
  shows: ShowRow[];
  nextShow: ShowRow | null;
  preparation: PrepItem[];
  payouts: PayoutTotals;
  payoutRows: number;
  /** A query failed. The screen says so rather than drawing zeroes that look like facts. */
  failed: boolean;
};

type RunRow = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  starts_on: string;
  ends_on: string;
  status: string;
  show_count: number;
  verification_methods: string[] | null;
};

const shapeRun = (r: RunRow): DashboardRun => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  kind: r.kind,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  status: r.status,
  showCount: r.show_count,
});

/** What a purchase row looks like once PostgREST has embedded the lot and the patron's name. */
type PurchaseRow = {
  id: string;
  amount_cents: number;
  refunded_cents: number;
  payment_status: string;
  mark_status: string;
  mark_text: string | null;
  mark_url: string | null;
  mark_note: string | null;
  patron_id: string;
  lots: { label: string | null; surface_key: string; run_id: string } | null;
  patron_names: { name: string } | null;
};

/**
 * The whole dashboard for one act, and one of its fundraisers.
 *
 * `selectedRunId` comes from the query string and is never trusted: it only matches a fundraiser
 * this act owns, because the runs query is already filtered by act_id, and anything else falls
 * back to the default.
 */
export async function loadDashboard(act: OwnedAct, selectedRunId?: string): Promise<DashboardView> {
  const empty: DashboardView = {
    act: { name: act.name, slug: act.slug, city: act.city },
    runs: [],
    selected: null,
    metrics: null,
    work: [],
    shows: [],
    nextShow: null,
    preparation: [],
    payouts: { paidCents: 0, scheduledCents: 0, pausedCents: 0 },
    payoutRows: 0,
    failed: false,
  };

  const sb = await supabaseServer();

  const { data: runRows, error: runsError } = await sb
    .from("runs")
    .select("id,slug,title,kind,starts_on,ends_on,status,show_count,verification_methods")
    .eq("act_id", act.id)
    .order("starts_on", { ascending: false });

  if (runsError) {
    console.error("dashboard runs query failed:", runsError.message);
    return { ...empty, failed: true };
  }

  const all = (runRows ?? []) as RunRow[];
  const usable = selectableRuns(all);
  const chosen = usable.find((r) => r.id === selectedRunId) ?? (defaultRun(usable) as RunRow | null);
  const runs = usable.map(shapeRun);

  /*
    The payout schedule belongs to the act, not to one fundraiser, so it is read either way.

    Through the service role, because migration 0029 took payout_schedule off the Data API
    altogether: an authenticated read of it returns a permission error, which would have put the
    failure banner on this page on every single load. The filter is the act the signed-in user
    owns, and only three totals and a row count leave this function.
  */
  const payoutResult = await supabaseAdmin().from("payout_schedule").select("amount_cents,status").eq("act_id", act.id);
  if (payoutResult.error) console.error("dashboard payout query failed:", payoutResult.error.message);
  const payoutRows = payoutResult.data ?? [];
  const payouts = groupPayouts(payoutRows);

  if (!chosen) {
    return { ...empty, runs, payouts, payoutRows: payoutRows.length };
  }

  /*
    Purchases and backings come through the service role. patron_names left the Data API in
    migration 0022, so an authenticated read cannot resolve who bought a sponsorship, and 0029
    closed backings the same way it closed the payout schedule. Both filters name this act's own
    fundraiser, so the service role widens nothing: it is the only role that can read these at all.

    What leaves this function is a sponsor's display name, amounts and states. The patron ids,
    email addresses and Stripe ids stop here, and the patron count is reduced to a number below.
  */
  const [lotsResult, purchaseResult, backingResult, showResult] = await Promise.all([
    sb.from("lots").select("id,status").eq("run_id", chosen.id),
    supabaseAdmin()
      .from("purchases")
      .select(
        "id,amount_cents,refunded_cents,payment_status,mark_status,mark_text,mark_url,mark_note,patron_id,lots!inner(label,surface_key,run_id),patron_names(name)",
      )
      .eq("lots.run_id", chosen.id)
      .order("created_at"),
    supabaseAdmin().from("backings").select("amount_cents,refunded_cents,payment_status,patron_id").eq("run_id", chosen.id),
    sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", chosen.id).order("played_on"),
  ]);

  const failed = Boolean(lotsResult.error || purchaseResult.error || backingResult.error || showResult.error);
  for (const [what, result] of [
    ["lots", lotsResult],
    ["purchases", purchaseResult],
    ["backings", backingResult],
    ["shows", showResult],
  ] as const) {
    if (result.error) console.error(`dashboard ${what} query failed:`, result.error.message);
  }

  const purchases = (purchaseResult.data ?? []) as unknown as PurchaseRow[];
  const backings = (backingResult.data ?? []) as { amount_cents: number; refunded_cents: number; payment_status: string; patron_id: string }[];
  const shows = (showResult.data ?? []) as ShowRow[];

  const work: WorkRow[] = purchases.map((p) => ({
    id: p.id,
    sponsor: p.patron_names?.name ?? "A patron",
    option: p.lots ? lotName(p.lots) : "Sponsorship",
    amountCents: Math.max(0, p.amount_cents - p.refunded_cents),
    logo: logoState(p.mark_status),
    paymentStatus: p.payment_status,
    markNote: p.mark_note,
    markText: p.mark_text,
    markUrl: p.mark_url,
  }));

  // Both sides of the money, netted the same way.
  const settled = [
    ...purchases.map((p) => ({ amount_cents: p.amount_cents, refunded_cents: p.refunded_cents, payment_status: p.payment_status })),
    ...backings.map((b) => ({ amount_cents: b.amount_cents, refunded_cents: b.refunded_cents, payment_status: b.payment_status })),
  ];

  // Counted server-side and returned as a number: no patron id leaves this function.
  const patronIds = new Set<string>();
  for (const p of purchases) if (p.payment_status !== "requires_payment") patronIds.add(p.patron_id);
  for (const b of backings) if (b.payment_status !== "requires_payment") patronIds.add(b.patron_id);

  const sold = (lotsResult.data ?? []).filter((l) => l.status === "sold").length;
  const methods = chosen.verification_methods ?? [];

  return {
    act: { name: act.name, slug: act.slug, city: act.city },
    runs,
    selected: shapeRun(chosen),
    metrics: {
      raisedCents: raisedCents(settled),
      sponsorshipsSold: sold,
      patrons: patronIds.size,
      showsPlayed: playedCount(shows),
      showsTotal: shows.length || chosen.show_count,
      daysLeft: 0, // filled by the caller, which knows "now"
    },
    work,
    shows,
    nextShow: null, // filled by the caller, for the same reason
    preparation: preparationItems({
      work,
      shows,
      runId: chosen.id,
      promisedAttendance: methods.includes("attendance_estimates"),
      promisedShowPhotos: methods.includes("selected_show_photos"),
    }),
    payouts,
    payoutRows: payoutRows.length,
    failed,
  };
}

/**
 * The two values that depend on the clock, applied where the clock is known.
 *
 * Kept out of loadDashboard so the loader stays a pure read and the page decides what "today"
 * means, which is also what makes both of them testable in dashboardModel.
 */
export function withToday(view: DashboardView, today: Date): DashboardView {
  if (!view.selected || !view.metrics) return view;
  return {
    ...view,
    metrics: { ...view.metrics, daysLeft: daysRemaining(view.selected.endsOn, today) },
    nextShow: upcomingShow(view.shows, today),
  };
}
