/**
 * Every category noun and label the shared interface uses, in one place.
 *
 * Shared components never write "musician", "tour", "logo" or "show" themselves. They ask here,
 * with the fundraiser's category, and get the category's own word or the neutral one. Music's
 * words are music's and stay exactly as they are; they are simply no longer anybody else's default.
 *
 * This file composes the two that already held words: src/lib/categories.ts (who the organizer is)
 * and src/lib/periods.ts (what a music fundraiser's period is called). A category's public name is
 * data, from the registry (`fundraiser_categories.label`), and arrives on the domain objects. The
 * fallback here only tidies a key for a category nobody has named yet.
 *
 * Pure, and importable from a client component.
 */
import { organizerNoun } from "@/lib/categories";
import { periodOf } from "@/lib/periods";

export type CategoryWords = {
  /** "musician", "team", "filmmaker", "theater company", or "organizer". */
  organizer: string;
  /** Capitalized, for an eyebrow. */
  organizerTitle: string;
  /** What the funding effort is called in a sentence: "tour", "season", "residency", or "fundraiser". */
  fundraiser: string;
  /** What a sponsor hands over: "logo" in music, where that is what it is, and "materials" elsewhere. */
  materials: string;
  /** What appears, in the plural: "logos" in music, "sponsors" elsewhere (a credit line is not a logo). */
  appearances: string;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function categoryWords(categoryKey: string | null | undefined, kind?: string | null): CategoryWords {
  const music = (categoryKey ?? "music") === "music";
  const organizer = organizerNoun(categoryKey ?? "music");
  return {
    organizer,
    organizerTitle: capitalize(organizer),
    fundraiser: music ? periodOf(kind).noun : "fundraiser",
    materials: music ? "logo" : "materials",
    appearances: music ? "logos" : "sponsors",
  };
}

/** A category's name for a badge: the registry's label, or the key tidied up when there is none yet. */
export function categoryLabel(category: { key: string; label?: string | null }): string {
  return category.label?.trim() || capitalize(category.key.replace(/_/g, " "));
}

/** How a sale method is named on a card. A sale method is never a category. */
export const SALE_METHOD_LABEL = { fixed: "Fixed price", auction: "Open to bids" } as const;

/** A fundraiser's status, in words a visitor reads. */
export const FUNDRAISER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  live: "Under way",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** Where activity happens. Online is a place a fundraiser can be, not a missing city. */
export const ACTIVITY_MODE_LABEL: Record<string, string> = { in_person: "In person", online: "Online", hybrid: "In person and online" };
