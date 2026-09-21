/**
 * The domain, as the interface sees it.
 *
 * These are the contracts between data and design. A page loads rows (from `acts`, `runs`, `lots`,
 * `patron_profiles`: the tables keep their names), turns them into these views, and hands them to
 * the semantic components in src/components/domain. A redesign may change every one of those
 * components, their layout, type, color and order, and must not need to change anything here.
 *
 * What is deliberately absent: database ids of people, Stripe ids, payment status, email addresses,
 * private amounts, and anything a component would need in order to move money. A component that
 * is handed only these cannot leak or charge anything.
 *
 * No category is special-cased in a type. A category is `{ key, label }`, so a fifth one is data.
 * Pure types and pure adapters: nothing here reads the database.
 */

export type Category = { key: string; label?: string | null };

/** A place, from what somebody said and nothing else. Every part is optional and none is invented. */
export type LocationView = { city?: string | null; region?: string | null; countryCode?: string | null };

export type LinkView = { label: string; url: string };

export type OrganizerView = {
  slug: string;
  name: string;
  /** What the organizer is, already in words: "Band", "Team", "Production company". Null when nobody said. */
  kindLabel: string | null;
  bio: string | null;
  photoUrl: string | null;
  location: LocationView | null;
  links: LinkView[];
};

export type FundraiserStatusKey = "draft" | "open" | "live" | "closed" | "cancelled";

export type FundraiserView = {
  slug: string;
  title: string;
  category: Category;
  /** Music's stored kind (tour, season, residency), used only to pick music's own period noun. */
  kind?: string | null;
  status: FundraiserStatusKey;
  /** One line of facts, already worded by the category: "18 shows, Oct 3 to Nov 2". Null when there are none. */
  facts: string | null;
  /** The three questions every sponsorship answers. Unknown stays null, never a placeholder. */
  purpose: string | null;
  audience: string | null;
  sponsorPromise: string | null;
  activityMode?: "in_person" | "online" | "hybrid" | null;
  locations: LocationView[];
  href: string;
};

export type SaleMethod = "fixed" | "auction";

export type OpportunityView = {
  id: string;
  name: string;
  description: string | null;
  seenBy: string | null;
  /** The organizer's own price. A template's suggestion is never shown as a price. */
  priceCents: number;
  saleMethod: SaleMethod;
  status: "open" | "pending" | "sold" | "unsold" | "cancelled";
  topBidCents?: number | null;
  buyNowCents?: number | null;
  /** The sponsor's public name, where they have one. Never an amount they paid in private. */
  soldTo?: string | null;
};

/** A template row in an editor. A suggestion, which may be absent, and is never a price. */
export type OpportunityTemplateView = { key: string; name: string; seenBy: string | null; suggestedPriceCents: number | null; period: string | null };
export type OpportunityDraft = { on: boolean; count: string; price: string; saleMethod: SaleMethod; buyNow: string };

/** What the organizer committed to document. Only what they chose: src/lib/verification.ts. */
export type CommitmentView = { key: string; label: string; detail?: string };

export type EvidenceItemView = { title: string; kind: "photo" | "link" | "document" | "note"; url: string | null; note: string | null; isPublic: boolean };
export type EvidenceView = {
  /** Only the items this viewer may see. */
  items: EvidenceItemView[];
  /** How many more exist that this viewer may not see. A count, and nothing about them. */
  withheld: number;
};

export type SponsorView = {
  displayName: string;
  username: string | null;
  /** "Business", "Nonprofit". Null when the patron did not say, which is most individuals. */
  kindLabel: string | null;
  bio: string | null;
  location: string | null;
  photoUrl: string | null;
  links: LinkView[];
  categories: Category[];
  href: string | null;
};

export type PatronActivityView = {
  /** A sponsorship and a backing are different things and never share a label. */
  support: "sponsorship" | "backing";
  organizerName: string;
  /** Null when the fundraiser is over and the name should not be a link. */
  organizerHref: string | null;
  fundraiserTitle: string;
  category: Category | null;
  detail: string;
  /** "September 2026". A public page says the month, never the minute. */
  month: string;
};

/** "Accra, Greater Accra, GH", "Lisbon", or null. A missing part is left out, not filled in. */
export function locationText(l: LocationView | null | undefined): string | null {
  if (!l) return null;
  const parts = [l.city, l.region, l.countryCode].map((p) => p?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
