/**
 * The starting categories, in the words the marketing pages use for them.
 *
 * The set grows: it began as four (decision 17), and Restaurants & hospitality and Other joined it
 * with migration 0049. Being listed here opens nothing. The last two hold private drafts only, and
 * AVAILABILITY_NOTE says so wherever the set is shown.
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
  // The key is `hospitality` (migration 0047). The public name is the registry's, and covers
  // restaurants, bars, hospitality venues, caterers and community kitchens, in any city or online.
  {
    key: "hospitality",
    label: "Restaurants & hospitality",
    funds: "Dinner series, chef residencies, guest experiences, and community meal programs.",
    placements: "Possible placements include restaurant spaces, sponsored guest experiences, dinner series, chef residencies, and community meal programs.",
  },
  // A controlled way in, not a way round the explanation. It has no templates, no suggested price
  // and no starter kit, so nothing here names a placement: the organizer states it.
  {
    key: "other",
    label: "Other",
    funds: "A project that can name a clear audience, a real funding purpose, and a specific sponsor promise.",
    placements: "Possible placements include any the organizer can describe exactly and has the authority to deliver.",
  },
] as const;

/**
 * The four categories the registry was seeded with (migration 0038), which can publish (0041).
 *
 * Only these count as known when a registry read comes back empty, so a database hiccup never
 * relabels music as coming soon (src/lib/organizer-examples.ts). A category added later has to be
 * in the registry to be linked to: the safe reading of "no row" is that a draft would be refused.
 */
export const SEEDED_CATEGORY_KEYS: readonly string[] = ["music", "sports", "film", "theater"] as const;

/** The starting categories in a sentence, for metadata, sign up and the new-fundraisers email. One list, so they cannot drift. */
export const STARTING_CATEGORIES_LIST = "music, sports teams, film, theater, and restaurants and hospitality";

/** The starting set is a start. Said wherever the set is listed. */
export const STARTING_CATEGORIES_NOTE =
  `The starting categories are ${STARTING_CATEGORIES_LIST}, with Other for a project that fits none of them. The set is growing: Door Money is designed to expand as new categories can make a clear, deliverable sponsorship promise.`;

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
 * Music is published and takes payments. Every other starting category holds private drafts:
 * publishing is decided per category in the registry and live payment by the category's delivery
 * policy (src/lib/payment-gate.ts), and only the owner switches either on. Restaurants &
 * hospitality and Other have neither switch (migrations 0047 and 0049). Change this sentence when
 * one of them opens; never imply on a marketing page that every category can be sponsored already.
 */
export const AVAILABILITY_NOTE =
  "Music fundraisers are open to sponsors today. Organizers in the remaining starting categories can prepare private drafts while publishing and delivery terms for each one are finished.";
