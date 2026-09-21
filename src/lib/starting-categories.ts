/**
 * The four starting categories, in the words the marketing pages use for them.
 *
 * This is copy, not the registry. Which categories exist is decided by `fundraiser_categories`
 * (src/lib/category-registry.ts), and a category's public name comes from there; the label here only
 * stands in when the registry has no row. What each one funds and where a sponsor might appear is
 * taken from the table in docs/PRODUCT_CONTRACT.md, and says "possible" on purpose: an example is
 * never an included benefit. An organizer offers only what they chose to, at their own price.
 *
 * Pure, and importable from a client component.
 */
export type StartingCategory = {
  key: string;
  label: string;
  /** What a fundraiser in this category is usually for. */
  funds: string;
  /** Where a sponsor might appear. Possibilities, never promises. */
  placements: string;
};

export const STARTING_CATEGORIES: readonly StartingCategory[] = [
  {
    key: "music",
    label: "Music",
    funds: "Tours, residencies, recordings, and named music efforts.",
    placements: "Possible placements include programs, equipment, venues, websites, and posts.",
  },
  {
    key: "sports",
    label: "Sports teams",
    funds: "Seasons, tournaments, travel, and equipment.",
    placements: "Possible placements include approved uniforms, venue signage, team materials, and digital channels.",
  },
  {
    key: "film",
    label: "Film",
    funds: "Productions, completion, and screenings.",
    placements: "Possible placements include agreed credits, screening materials, promotional channels, and product placement.",
  },
  {
    key: "theater",
    label: "Theater",
    funds: "Productions, performance seasons, and touring work.",
    placements: "Possible placements include programs, foyer signage, websites, and agreed promotion.",
  },
] as const;

/** The starting set is a start. Said wherever the four are listed. */
export const STARTING_CATEGORIES_NOTE =
  "The starting categories are music, sports teams, film, and theater. Door Money is designed to expand as new categories can make a clear, deliverable sponsorship promise.";

/** What a new category has to be able to say. From docs/PRODUCT_CONTRACT.md, "Starting categories and expansion". */
export const CATEGORY_TEST: readonly string[] = [
  "What the funding enables.",
  "Who the relevant audience is.",
  "What the sponsor receives.",
  "How the promised delivery will be documented.",
] as const;

/**
 * What is open today, in one place, because it changes.
 *
 * Music is published and takes payments. Sports teams, film and theater hold private drafts:
 * publishing is decided per category in the registry and live payment by the category's delivery
 * policy (src/lib/payment-gate.ts), and only the owner switches either on. Change this sentence when
 * one of them opens; never imply on a marketing page that all four can be sponsored already.
 */
export const AVAILABILITY_NOTE =
  "Music fundraisers are open to sponsors today. Sports teams, film, and theater organizers can prepare private drafts while publishing and delivery terms for those categories are finished.";
