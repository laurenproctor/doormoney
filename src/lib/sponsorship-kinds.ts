/**
 * The kinds of sponsorship a template can be, in words.
 *
 * Two questions a sponsor asks that a template's name does not answer. What is my side of it:
 * money, my product, or my service? And what carries my name: a space, an event, or something a
 * guest meets in person? Hospitality is where the difference matters first, because a spirits brand
 * sponsoring a cart may be paying for it, pouring on it, or both.
 *
 * One fact sits under all six and is said wherever they are shown: Door Money moves money. Product
 * and services a sponsor supplies are real and welcome, and they are an agreement between the
 * organizer and the sponsor. Door Money does not hold, value, release or refund them, so no page
 * may describe an in-kind contribution as something a sponsor buys here.
 *
 * Words only. Which kinds a template suits is said beside the template in src/lib/catalog.ts, and a
 * template with none listed simply shows none. Not a category, and not a sale method.
 *
 * Pure, and importable from a client component.
 */
export const SPONSORSHIP_KINDS = {
  cash: {
    label: "Cash sponsorship",
    line: "The sponsor pays through Door Money, and the money funds the work.",
  },
  product: {
    label: "Product or beverage sponsorship",
    line: "The sponsor's product is what guests are served or see. The sponsor may also supply it.",
  },
  service: {
    label: "Service sponsorship",
    line: "The sponsor's service is part of the program, such as travel, printing or design.",
  },
  space: {
    label: "Venue or space sponsorship",
    line: "A room, a patio, a counter or a table carries the sponsor's name.",
  },
  event: {
    label: "Event sponsorship",
    line: "The sponsor is named on a dated program: a dinner, a series, a residency.",
  },
  guest_experience: {
    label: "Branded guest experience",
    line: "Something a guest meets in person carries the sponsor's name, such as a cart or a course.",
  },
} as const;

export type SponsorshipKind = keyof typeof SPONSORSHIP_KINDS;

/** The kinds where a sponsor may hand over something that is not money. */
export const IN_KIND: readonly SponsorshipKind[] = ["product", "service"];

/** Said once wherever a product or service kind is shown. */
export const IN_KIND_NOTE =
  "Door Money handles the payment and nothing else. Product or services a sponsor supplies are agreed between the organizer and the sponsor.";

export function sponsorshipKindLabels(kinds: readonly SponsorshipKind[] | null | undefined): string[] {
  return (kinds ?? []).map((kind) => SPONSORSHIP_KINDS[kind].label);
}

export function hasInKind(kinds: readonly SponsorshipKind[] | null | undefined): boolean {
  return (kinds ?? []).some((kind) => IN_KIND.includes(kind));
}
