/**
 * What a draft run still needs before its board can go public, in one place.
 *
 * The run dashboard reads this to draw the checklist and publishRun reads the same rules to decide,
 * so the list a musician looks at and the answer they get from the publish button cannot drift.
 * Pure: it takes rows that have already been read under the owner's session and returns words.
 *
 * Payout setup is on the checklist but never blocks. Door Money holds every payment on the platform
 * balance and transfers weekly (Phase 3), so a board can open before Stripe is finished; the money
 * simply waits. That is the existing rule and this does not change it.
 */
import { OTHER_KEY, OTHER_MIN, verificationPublishable, type VerificationChoice } from "@/lib/verification";

export type ReadinessAct = {
  name: string | null;
  city: string | null;
  bio: string | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
};

export type ReadinessRun = {
  title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  show_count: number | null;
  bidding_closes_at: string | null;
  status: string;
} & Partial<VerificationChoice>;

export type ReadinessInput = {
  act: ReadinessAct;
  run: ReadinessRun;
  /** Spots on this run, and how many of them take bids. */
  lotCount: number;
  auctionCount: number;
};

export type ReadinessRow = {
  key: "profile" | "run" | "lots" | "verification" | "payouts" | "publish";
  label: string;
  done: boolean;
  /** What is missing, or what is in place. One short line either way. */
  note: string;
  /** Where to go and fix it. Absent on the last row. */
  href?: string;
  /** True for payouts: shown incomplete, never in the way of publishing. */
  optional?: boolean;
};

const filled = (v: string | null | undefined) => Boolean(v && v.trim().length > 0);

export function profileComplete(act: ReadinessAct): boolean {
  return filled(act.name) && filled(act.city) && filled(act.bio);
}

export function runComplete(run: ReadinessRun): boolean {
  return filled(run.title) && filled(run.starts_on) && filled(run.ends_on) && (run.show_count ?? 0) >= 1;
}

export function verificationComplete(run: ReadinessRun): boolean {
  return verificationPublishable(run);
}

/**
 * Everything standing between this draft and a public board, in the order a musician would fix it.
 * Empty means publishing will go through. Each line names the thing and where it lives.
 */
export function publishBlockers({ act, run, lotCount, auctionCount }: ReadinessInput): string[] {
  const out: string[] = [];
  if (!filled(act.name) || !filled(act.city)) out.push("Finish the act's name and city on the act page.");
  else if (!filled(act.bio)) out.push("Add a short bio on the act page. The board leads with it.");
  if (!runComplete(run)) out.push("Finish the run: a name, both dates and a show count.");
  if (lotCount === 0) out.push("Add at least one spot before publishing.");
  if (auctionCount > 0 && !filled(run.bidding_closes_at)) out.push("Auction spots need a bidding close time. Set one on the run.");
  if (!verificationComplete(run)) {
    const pickedOther = (run.methods ?? []).includes(OTHER_KEY);
    const answer = run.other?.trim() ?? "";
    out.push(
      pickedOther && answer.length > 0 && answer.length < OTHER_MIN
        ? `Describe the other verification method in at least ${OTHER_MIN} characters.`
        : pickedOther
          ? "Describe the other verification method, or pick one from the list."
          : "Pick at least one way the placements will be recorded.",
    );
  }
  return out;
}

/** The six rows on the run dashboard, in order. */
export function readiness(input: ReadinessInput): ReadinessRow[] {
  const { act, run, lotCount, auctionCount } = input;
  const published = run.status === "open" || run.status === "live";
  const blockers = publishBlockers(input);
  const auctionsNeedClose = auctionCount > 0 && !filled(run.bidding_closes_at);

  return [
    {
      key: "profile",
      label: "Musician profile",
      done: profileComplete(act),
      note: profileComplete(act) ? `${act.name}, ${act.city}.` : filled(act.name) && filled(act.city) ? "A short bio is still missing." : "A name and a city are still missing.",
      href: "/dashboard/act",
    },
    {
      key: "run",
      label: "Run details",
      done: runComplete(run),
      note: runComplete(run) ? `${run.title}, ${run.show_count} ${run.show_count === 1 ? "date" : "dates"}.` : "A name, both dates and a show count.",
      href: "#run-details",
    },
    {
      key: "lots",
      label: "Placements",
      done: lotCount > 0 && !auctionsNeedClose,
      note:
        lotCount === 0
          ? "Nothing priced yet."
          : auctionsNeedClose
            ? `${lotCount} priced, but the auction spots need a bidding close time.`
            : `${lotCount} ${lotCount === 1 ? "spot" : "spots"} priced.`,
      href: "#placements",
    },
    {
      key: "verification",
      label: "Placement verification",
      done: verificationComplete(run),
      note: verificationComplete(run)
        ? `${(run.methods ?? []).length} ${(run.methods ?? []).length === 1 ? "method" : "methods"} chosen.`
        : "Nothing chosen yet.",
      href: "#verification",
    },
    {
      key: "payouts",
      label: "Payout setup",
      done: act.stripe_payouts_enabled,
      optional: true,
      note: act.stripe_payouts_enabled
        ? "Stripe is ready. Money moves every Friday."
        : act.stripe_account_id
          ? "Stripe still wants a few details. The board can open first; the money waits."
          : "Not set up. The board can open first; Door Money holds the money until it is.",
      href: "/dashboard/payouts",
    },
    {
      key: "publish",
      label: "Ready to publish",
      done: published || blockers.length === 0,
      note: published ? "The board is public." : blockers.length === 0 ? "Nothing left. Publish it below." : blockers[0],
    },
  ];
}
