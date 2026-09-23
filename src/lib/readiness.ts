/**
 * What a draft fundraiser still needs before it can go public, in one place.
 *
 * The fundraiser dashboard reads this to draw the checklist and publishRun reads the same rules to
 * decide, so the list an organizer looks at and the answer they get from the publish button cannot
 * drift. Pure: it takes rows that have already been read under the owner's session and returns
 * words. The database says the same thing again in guard_fundraiser_foundation (migration 0041),
 * because a gate that only exists in TypeScript is not a gate.
 *
 * Two gates, not one. Music is held to the gate it has always been held to: a performance format,
 * both dates and a show count. That gate predates the product contract and the fundraisers already
 * published under it have to keep passing it. Every other category is held to the contract's own
 * test instead, which is the one that makes a sponsorship judgeable: what the money enables, who it
 * reaches, and what the sponsor receives. Neither gate is the other's default.
 *
 * Payout setup is on the checklist but never blocks. Door Money holds every payment on the platform
 * balance and transfers weekly, so a fundraiser can open before Stripe is finished; the money
 * simply waits. That is the existing rule and this does not change it.
 */
import { organizerNoun } from "@/lib/categories";
import { incompleteOfferSentence, type IncompleteOffer } from "@/lib/offer-readiness";
import { OTHER_KEY, OTHER_MIN, verificationPublishable, type VerificationChoice } from "@/lib/verification";

export type ReadinessAct = {
  name: string | null;
  city: string | null;
  bio: string | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
};

export type ReadinessRun = {
  category_key?: string;
  title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  show_count: number | null;
  bidding_closes_at: string | null;
  status: string;
  /** What the funding enables, who it reaches, what a sponsor receives. The shared gate. */
  purpose?: string | null;
  audience_description?: string | null;
  sponsor_promise?: string | null;
} & Partial<VerificationChoice>;

export type ReadinessInput = {
  act: ReadinessAct;
  run: ReadinessRun;
  /** Spots on this fundraiser, and how many of them take bids. */
  lotCount: number;
  auctionCount: number;
  /**
   * Whether this category may leave draft status at all, from fundraiser_categories.publish_enabled.
   * Required rather than defaulted: a category that has never been considered is not publishable,
   * and a default of true here would be the quiet way that stops being true.
   */
  categoryPublishable: boolean;
  /**
   * Sponsorship options still missing terms the product contract asks for before a purchase
   * (src/lib/offer-readiness.ts). Computed by the caller from the lots, and empty for a fundraiser
   * that has been published before, so nothing already sold is held to a rule written later.
   */
  incompleteOffers?: readonly IncompleteOffer[];
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
const isMusic = (run: ReadinessRun) => (run.category_key ?? "music") === "music";
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The organizer page, by category.
 *
 * A city is required of a musician because every music fundraiser published so far has one and the
 * board prints it. Nowhere else: the product contract is explicit that location is optional and
 * that no fundraiser gets an invented one.
 */
export function profileComplete(act: ReadinessAct, run?: ReadinessRun): boolean {
  const cityNeeded = !run || isMusic(run);
  return filled(act.name) && filled(act.bio) && (!cityNeeded || filled(act.city));
}

/** The fundraiser's own details, under whichever of the two gates applies. */
export function runComplete(run: ReadinessRun): boolean {
  if (!filled(run.title)) return false;
  return isMusic(run)
    ? filled(run.starts_on) && filled(run.ends_on) && (run.show_count ?? 0) >= 1
    : filled(run.purpose) && filled(run.audience_description) && filled(run.sponsor_promise);
}

export function verificationComplete(run: ReadinessRun): boolean {
  return verificationPublishable(run);
}

/** What the fundraiser row still wants, named one by one. */
function runMissing(run: ReadinessRun): string {
  if (isMusic(run)) return "A name, both dates and a show count.";
  const missing = [
    !filled(run.title) && "a name",
    !filled(run.purpose) && "what the funding enables",
    !filled(run.audience_description) && "who it reaches",
    !filled(run.sponsor_promise) && "what a sponsor receives",
  ].filter((v): v is string => typeof v === "string");
  return `${capitalize(missing.join(", "))}.`;
}

/**
 * Everything between this draft and a public fundraiser, in the order an organizer would fix it.
 * Empty means publishing will go through. Each line names the thing and where it lives.
 */
export function publishBlockers({ act, run, lotCount, auctionCount, categoryPublishable, incompleteOffers = [] }: ReadinessInput): string[] {
  const out: string[] = [];
  const noun = organizerNoun(run.category_key ?? "music");
  if (!categoryPublishable) out.push("This category can hold drafts. Publishing is not open for it yet.");
  if (!filled(act.name) || (isMusic(run) && !filled(act.city))) out.push(`Finish the ${isMusic(run) ? "name and city" : "name"} on the ${noun} page.`);
  else if (!filled(act.bio)) out.push(`Add a short bio on the ${noun} page. The fundraiser leads with it.`);
  if (!runComplete(run)) out.push(`Finish the fundraiser: ${runMissing(run).charAt(0).toLowerCase()}${runMissing(run).slice(1)}`);
  if (lotCount === 0) out.push("Add at least one sponsorship option before publishing.");
  // A partial option saves as a private draft. It does not publish: a sponsor has to be able to read
  // every term before they pay, and an option whose terms are missing is not yet an offer.
  for (const offer of incompleteOffers) out.push(incompleteOfferSentence(offer));
  if (auctionCount > 0 && !filled(run.bidding_closes_at)) out.push("Sponsorship options open to bids need a bidding close time. Set one below.");
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

/** The six rows on the fundraiser dashboard, in order. */
export function readiness(input: ReadinessInput): ReadinessRow[] {
  const { act, run, lotCount, auctionCount, incompleteOffers = [] } = input;
  const published = run.status === "open" || run.status === "live";
  const blockers = publishBlockers(input);
  const auctionsNeedClose = auctionCount > 0 && !filled(run.bidding_closes_at);
  const profileDone = profileComplete(act, run);
  const noun = organizerNoun(run.category_key ?? "music");
  const placeName = [act.name, isMusic(run) ? act.city : null].filter(Boolean).join(", ");

  return [
    {
      key: "profile",
      label: `${capitalize(noun)} profile`,
      done: profileDone,
      note: profileDone
        ? `${placeName}.`
        : filled(act.name) && (!isMusic(run) || filled(act.city))
          ? "A short bio is still missing."
          : isMusic(run)
            ? "A name and a city are still missing."
            : "A name is still missing.",
      href: "/dashboard/act",
    },
    {
      key: "run",
      label: "Fundraiser details",
      done: runComplete(run),
      note: runComplete(run)
        ? isMusic(run)
          ? `${run.title}, ${run.show_count} ${run.show_count === 1 ? "date" : "dates"}.`
          : `${run.title}. The funding, the audience and the sponsor's side are all answered.`
        : runMissing(run),
      href: "#run-details",
    },
    {
      key: "lots",
      label: "Sponsorships",
      done: lotCount > 0 && !auctionsNeedClose && incompleteOffers.length === 0,
      note:
        lotCount === 0
          ? "Nothing priced yet."
          : incompleteOffers.length > 0
            ? `${incompleteOffers.length === 1 ? `${incompleteOffers[0].name} still needs` : `${incompleteOffers.length} options still need`} the terms a sponsor reads before paying: ${incompleteOffers[0].missing.slice(0, 3).map((m) => m.charAt(0).toLowerCase() + m.slice(1)).join("; ")}${incompleteOffers[0].missing.length > 3 ? "; and more" : ""}.`
            : auctionsNeedClose
              ? `${lotCount} priced, but the options open to bids need a bidding close time.`
              : `${lotCount} ${lotCount === 1 ? "sponsorship option" : "sponsorship options"} priced.`,
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
          ? "Stripe still wants a few details. The fundraiser can open first; the money waits."
          : "Not set up. The fundraiser can open first; Door Money holds the money until it is.",
      href: "/dashboard/payouts",
    },
    {
      key: "publish",
      label: "Ready to publish",
      done: published || blockers.length === 0,
      note: published ? "The fundraiser is public." : blockers.length === 0 ? "Nothing left. Publish it below." : blockers[0],
    },
  ];
}

/**
 * How far a draft has come, as a step out of the steps that hold it back.
 *
 * Payout setup and the last row are left out of the count on purpose: Stripe never blocks a
 * publish, and "Ready to publish" is the consequence of the four above it rather than a fifth
 * thing to do. `next` is the first one still open, which is the one sentence a draft can be
 * summed up in.
 */
export function draftProgress(rows: ReadinessRow[]): { done: number; total: number; next: ReadinessRow | null } {
  const steps = rows.filter((r) => !r.optional && r.key !== "publish");
  return {
    done: steps.filter((r) => r.done).length,
    total: steps.length,
    next: steps.find((r) => !r.done) ?? null,
  };
}
