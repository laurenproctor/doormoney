import { SAMPLE_BOARDS } from "@/lib/sample";
import type { DiscoveryOffer } from "@/lib/discovery-filters";
import type { DiscoveryFundraiserRow } from "@/lib/discovery-query";

/**
 * The discovery page with no database behind it.
 *
 * src/lib/boards.ts stands in with SAMPLE_BOARDS so the app runs in a fresh checkout (README, "Run
 * it"), and discovery does the same rather than showing an empty page that looks like a bug. This
 * is derived from those same boards, so the two can never drift apart.
 *
 * **It says only what the sample can honestly say.** The sample boards predate the discovery
 * contract and carry none of its fields, so every one of them is left empty here:
 *
 *   activity_mode            null. Nobody said, and "in person" would be a guess.
 *   activity_locations       empty. The sample acts have a city, but that is the *organizer's*
 *                            city, and an activity location is a different fact (0053). Copying
 *                            one into the other is exactly the mistake the contract forbids.
 *   activity_country_codes   empty, because it is derived from the locations.
 *   discovery_tags           empty. No sample organizer chose any.
 *   purpose / audience /     null where the sample board does not set them.
 *   sponsor_promise
 *
 * So on a machine with no database the category, price, sale-method and closing filters work and
 * the rest correctly match nothing. That is the honest result, and a sample card is never evidence
 * that anything was persisted.
 */

/**
 * One timestamp for every sample fundraiser.
 *
 * Not a claim that either was created then. The sort needs a comparable value, and giving both the
 * same one means "newest" falls through to the stable id tie-break, which is the truth: the sample
 * records no creation order.
 */
const SAMPLE_CREATED_AT = "1970-01-01T00:00:00.000Z";

function rows(): DiscoveryFundraiserRow[] {
  return Object.values(SAMPLE_BOARDS)
    .filter((b) => b.run)
    .map((b) => ({
      id: b.act.slug,
      slug: b.run.slug,
      organizer_slug: b.act.slug,
      organizer_name: b.act.name,
      title: b.run.title,
      category_key: b.run.categoryKey,
      status: b.run.status ?? "open",
      activity_mode: null,
      activity_locations: [],
      activity_country_codes: [],
      discovery_tags: [],
      purpose: b.run.purpose ?? null,
      audience_description: b.run.audienceDescription ?? null,
      sponsor_promise: b.run.sponsorPromise ?? null,
      fundraising_starts_on: null,
      fundraising_ends_on: null,
      bidding_closes_at: b.run.biddingClosesAt,
      created_at: SAMPLE_CREATED_AT,
    }));
}

/**
 * Offers, under the same two rules the views apply: only options still open, and the close time is
 * the option's own, falling back to the fundraiser's bidding clock for a bidding option only.
 */
function offers(): DiscoveryOffer[] {
  return Object.values(SAMPLE_BOARDS)
    .filter((b) => b.run)
    .flatMap((b) =>
      b.lots
        .filter((l) => l.status === "open")
        .map((l) => ({
          id: l.id,
          runId: b.act.slug,
          name: l.label ?? l.surfaceKey,
          priceCents: l.priceCents,
          saleMethod: l.mode,
          buyNowCents: l.buyNowCents ?? null,
          closesAt: l.mode === "auction" ? l.closesAt ?? b.run.biddingClosesAt : l.closesAt ?? null,
        })),
    );
}

export const SAMPLE_DISCOVERY: { rows: DiscoveryFundraiserRow[]; offers: DiscoveryOffer[]; live: false } = {
  rows: rows(),
  offers: offers(),
  live: false,
};
