/**
 * The two ways of taking part, and how far along each one is.
 *
 * One account, one identity, two modes: **Creating** a fundraiser and **Supporting** one. They
 * are modes of participation, never two accounts and never two people. What is deliberately still
 * separate is the data underneath: `acts` is the organizer's public record, `patron_profiles` is
 * the patron's optional page, and neither fills the other in. This file only says what state each
 * one is in and what to call it, so the profile page and the dashboard agree.
 *
 * See docs/DECISIONS.md, decisions 10 and 11.
 */

// ---------------------------------------------------------------
// What the organizer is
// ---------------------------------------------------------------

/**
 * From the check constraint on `acts.entity_kind` (migration 0043), in that order.
 *
 * What the organizer *is*, never what they raise money for: a category belongs to a fundraiser.
 * Null is the honest answer for every row written before 0043, and stays available: "a soloist is
 * probably a person" is a guess, and the column was left null rather than guessed.
 */
export const ENTITY_KINDS = [
  "person",
  "group",
  "team",
  "company",
  "collective",
  "nonprofit",
  "production_company",
  "school",
  "other",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  person: "A person",
  group: "A group or band",
  team: "A team",
  company: "A company",
  collective: "A collective",
  nonprofit: "A nonprofit",
  production_company: "A production company",
  school: "A school",
  other: "Something else",
};

export function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

/** What to call a stored entity kind, or null when nobody has said. */
export function entityKindLabel(value: string | null | undefined): string | null {
  return value && isEntityKind(value) ? ENTITY_KIND_LABELS[value] : null;
}

// ---------------------------------------------------------------
// Creating
// ---------------------------------------------------------------

export type OrganizerStatus = "not_started" | "draft" | "active";

export const ORGANIZER_STATUS_LABEL: Record<OrganizerStatus, string> = {
  not_started: "Not started",
  draft: "Draft",
  active: "Active",
};

/**
 * How far the organizer side has got.
 *
 * Read from what exists rather than from a column, because there is no status on `acts` and
 * inventing one would be a second source of truth. A profile with no fundraiser out of draft is
 * a draft: it is saved, and nothing about it is public yet.
 */
export function organizerStatus({ hasAct, hasPublicFundraiser }: { hasAct: boolean; hasPublicFundraiser: boolean }): OrganizerStatus {
  if (!hasAct) return "not_started";
  return hasPublicFundraiser ? "active" : "draft";
}

export const ORGANIZER_STATUS_WORDS: Record<OrganizerStatus, string> = {
  not_started: "There is no organizer profile on this account yet. Creating one takes a name and an address, and publishes nothing.",
  draft: "The organizer profile is saved. Nothing is public until a fundraiser is published.",
  active: "The organizer profile is public, on its own address, with at least one published fundraiser.",
};

// ---------------------------------------------------------------
// Supporting
// ---------------------------------------------------------------

export type PatronStatus = "optional" | "private" | "public";

export const PATRON_STATUS_LABEL: Record<PatronStatus, string> = {
  optional: "Optional",
  private: "Private",
  public: "Public",
};

/** A patron page is nobody's obligation: no row at all is a perfectly finished state. */
export function patronStatus({ hasProfile, published }: { hasProfile: boolean; published: boolean }): PatronStatus {
  if (!hasProfile) return "optional";
  return published ? "public" : "private";
}

export const PATRON_STATUS_WORDS: Record<PatronStatus, string> = {
  optional: "There is no patron page on this account, and there does not have to be. Sponsoring and backing work without one.",
  private: "The patron page is saved and private. Nobody can reach it, and nothing appears on it until it is put there.",
  public: "The patron page is public at its address. Only what was put on it appears, and no amount ever does.",
};
