/**
 * The sections of one fundraiser's workspace, as addresses.
 *
 * `?tab=` rather than state, so the page stays a server component, a section can be sent to
 * somebody and the back button works. Which tabs exist depends on the fundraiser: a category with
 * no dated events has no dates tab, and a draft holds no sponsorship so it has nothing to deliver.
 *
 * Pure. The words for the dated tab come from src/lib/periods.ts, so a season's tab says Gigs and
 * a residency's says Nights; "Shows" is music's word for music's kind and nobody else's default.
 */
import type { DeskTab } from "@/components/desk";

export const FUNDRAISER_TABS = ["overview", "options", "delivery", "dates", "details"] as const;
export type FundraiserTab = (typeof FUNDRAISER_TABS)[number];

export function isFundraiserTab(value: unknown): value is FundraiserTab {
  return typeof value === "string" && (FUNDRAISER_TABS as readonly string[]).includes(value);
}

/** `?tab=options`, read and refused rather than echoed. A repeated parameter takes the first. */
export function tabFromParam(param: string | string[] | undefined): FundraiserTab | null {
  const value = Array.isArray(param) ? param[0] : param;
  return isFundraiserTab(value) ? value : null;
}

export type TabCounts = {
  /** Sponsorship options priced on this fundraiser. */
  options: number;
  /** Sponsorships waiting on the organizer: materials to answer, or delivery still to document. */
  deliveryWaiting: number;
  /** Whether there is anything to deliver against at all. No sponsorships, no tab. */
  hasDelivery: boolean;
  /** Dated events, where the category has any. Music is the only one today. */
  dates: number | null;
  /** What those dates are called, already capitalized: Shows, Gigs, Nights. */
  datesLabel: string;
};

/**
 * The tab row. Only the delivery count is ever coloured: sponsorships waiting on an answer is a
 * different fact from options existing, and nothing else on this row is anybody's deadline.
 */
export function fundraiserTabs(counts: TabCounts, href: (tab: FundraiserTab) => string): DeskTab[] {
  const tabs: DeskTab[] = [
    { key: "overview", href: href("overview"), label: "Overview" },
    { key: "options", href: href("options"), label: "Options", count: counts.options || null },
  ];
  if (counts.hasDelivery) {
    tabs.push({
      key: "delivery",
      href: href("delivery"),
      label: "Delivery",
      count: counts.deliveryWaiting || null,
      tone: "attention",
    });
  }
  if (counts.dates !== null) {
    tabs.push({ key: "dates", href: href("dates"), label: counts.datesLabel, count: counts.dates || null });
  }
  tabs.push({ key: "details", href: href("details"), label: "Details" });
  return tabs;
}

/** The tab actually drawn: the one asked for when it exists, and Overview when it does not. */
export function currentTab(asked: FundraiserTab | null, tabs: readonly DeskTab[]): FundraiserTab {
  return asked && tabs.some((t) => t.key === asked) ? asked : "overview";
}

/**
 * Where a readiness step is fixed, now that the workspace is in tabs.
 *
 * The checklist's own anchors (`#run-details`, `#placements`, `#verification`) belong to sections
 * that are only drawn while their tab is open, so a link to one from anywhere else would land on
 * a page with nothing to scroll to. The organizer page is an address of its own and is left alone.
 */
const READINESS_TAB: Record<string, FundraiserTab> = { run: "details", lots: "options", verification: "details" };

export function readinessHref(runId: string, row: { key: string; href?: string | null }): string | null {
  const tab = READINESS_TAB[row.key];
  if (tab) return `/dashboard/runs/${runId}?tab=${tab}`;
  return row.href && !row.href.startsWith("#") ? row.href : null;
}
