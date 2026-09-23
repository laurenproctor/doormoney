import { SAMPLE_BOARDS } from "@/lib/sample";
import { CATALOG } from "@/lib/catalog";
import type { DiscoveryOffer } from "@/lib/discovery-filters";
import type { DiscoveryFundraiserRow } from "@/lib/discovery-query";
import { offerTermsOf, publicOfferTerms } from "@/lib/offer-terms";

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
 *   organizer_photo_url      the sample act's photo where it has one, which none does. Never a
 *                            stock image and never a picture of a stranger.
 *   placement_description    read from the sample lot's offer terms through the same public
 *                            projection the view uses (0056). None carries any, so null.
 *
 * So on a machine with no database the category, name, price, sale-method and closing filters work
 * and the rest correctly match nothing. That is the honest result, and a sample card is never
 * evidence that anything was persisted.
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
      organizer_photo_url: b.act.photoUrl ?? null,
    }));
}

/**
 * The option's name, the way the view reads it (`coalesce(l.label, s.name)`): the organizer's own
 * label, else the name of the template they chose. The chosen template is the option; a template
 * they did not tick is never named here.
 */
const nameOf = (label: string | null, surfaceKey: string) =>
  label ?? CATALOG.find((c) => c.key === surfaceKey)?.name ?? surfaceKey;

/** The placement, the way the view reads it: the public projection's own words, or nothing. */
function placementOf(offerTerms: unknown): string | null {
  const description = publicOfferTerms(offerTermsOf({ offer_terms: offerTerms })).placement?.description;
  const trimmed = typeof description === "string" ? description.trim() : "";
  return trimmed || null;
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
          name: nameOf(l.label, l.surfaceKey),
          priceCents: l.priceCents,
          saleMethod: l.mode,
          buyNowCents: l.buyNowCents ?? null,
          closesAt: l.mode === "auction" ? l.closesAt ?? b.run.biddingClosesAt : l.closesAt ?? null,
          placement: placementOf(l.offerTerms),
        })),
    );
}

export const SAMPLE_DISCOVERY: { rows: DiscoveryFundraiserRow[]; offers: DiscoveryOffer[]; live: false } = {
  rows: rows(),
  offers: offers(),
  live: false,
};
