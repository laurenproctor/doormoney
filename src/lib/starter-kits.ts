/**
 * Starter kits: the fundraising situations an organizer can start a draft from.
 *
 * A kit is one level up from a sponsorship option template. A template (`surfaces`, read through
 * src/lib/opportunity-templates.ts) is one thing a sponsor can buy: a jersey front, an end credit.
 * A kit is the situation around it: a season to fund, a short film to finish. It says what the
 * money is usually for, who tends to sponsor that kind of work, and which of the category's
 * existing templates are worth a look. It points at templates by key and never copies one.
 *
 * What a kit never does:
 *
 *   It creates nothing. Choosing one makes no fundraiser, lot, purchase, checkout session or row of
 *   any kind. applyStarterKit returns new form values and the caller decides whether to save them.
 *
 *   It carries no price. There is no price field on the type, for any category. A suggestion lives
 *   on a template, only where Door Money has sales history, and the organizer's own price wins.
 *
 *   It states no facts for the organizer. A kit fills in examples, and only when the organizer
 *   picks it: a name, what the funding enables, who it reaches, what a sponsor receives, and the
 *   details choosing it makes true. Every one is an editable starting point, shown as an example.
 *   None carries a number, a date, a goal or an audience size, and the example promise is never
 *   bigger than "where their sponsorship option says" (decision 9: keep the commitment the size
 *   it is). A production's name is the organizer's, so a kit for one film or one play sets no name.
 *
 *   It opens no category. Which categories exist, may save a draft and may publish is decided by
 *   `fundraiser_categories` (migrations 0038 and 0041), and whether one can be bought by
 *   `delivery_policies` (0045). This file can only be stricter than the database. A kit whose
 *   category has no registry row is unavailable, whatever it says here. Hospitality is in the
 *   registry as a draft-only category (0047) with no delivery policy, so its kits resolve to
 *   draft_only: they can shape a private draft, which cannot be published or paid for. Before
 *   0047 is applied to a database they resolve to unavailable there, which is the safe reading.
 *
 * Category keys are the registry's keys and category names are the registry's labels
 * (src/lib/category-words.ts). There is no second list of categories here.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */
import { categoryLabel } from "@/lib/category-words";
import type { Category } from "@/lib/domain";
import type { FundraiserCategory, FundraiserDraft } from "@/lib/fundraiser-drafts";
import type { OpportunityTemplate } from "@/lib/opportunities";

// ---------------------------------------------------------------
// The kit
// ---------------------------------------------------------------

/** The words a kit can suggest. Examples the organizer edits, never facts and never numbers. */
export const KIT_TEXT_FIELDS = ["title", "purpose", "audience_description", "sponsor_promise"] as const;
export type KitTextField = (typeof KIT_TEXT_FIELDS)[number];

/**
 * The only draft fields a kit may set. No goal, date, count, location or price: those are facts
 * about one organizer's work, and a kit knows none of them.
 */
export type StarterKitPrefill = {
  /** A working name. Left out where the name is the work's own: a film, a play. */
  title?: string;
  purpose?: string;
  audience_description?: string;
  sponsor_promise?: string;
  /** Music's stored performance format. Refused outside music by the form and by the database. */
  kind?: NonNullable<FundraiserDraft["kind"]>;
  activity_mode?: NonNullable<FundraiserDraft["activity_mode"]>;
  /** Only keys the category's registry row allows. A key it does not allow is dropped on apply. */
  category_details?: Readonly<Record<string, string>>;
};

export type StarterKit = {
  /** Stable, unique across every category, and never reused for a different situation. */
  key: string;
  /** Bumped when the words or the prefill change, so a caller that kept { key, version } can tell. */
  version: number;
  /** A `fundraiser_categories` key. The registry decides whether the category exists. */
  categoryKey: string;
  label: string;
  shortDescription: string;
  whatItFunds: string;
  /** Who tends to sponsor this kind of work. Prompts for the organizer, never a promise of interest. */
  suggestedSponsorTypes: readonly string[];
  /** What the money usually pays for. Prompts beside the purpose field, never written into it. */
  suggestedNeeds: readonly string[];
  /** Keys of existing templates in this category worth a look. Pointers only: nothing is offered until the organizer prices it. */
  suggestedOpportunityKeys: readonly string[];
  prefill: StarterKitPrefill;
  /** One plain caution where the situation has a rule an organizer should hear early. */
  note?: string;
  /** False once retired: no new draft starts from it. Drafts that already did are untouched. */
  enabled: boolean;
  /**
   * True where the kit may shape a private draft and nothing more. Set for a category Door Money has
   * not opened. It holds even if the registry later turns publishing on, until somebody changes it
   * here on purpose, so opening a category takes two deliberate switches and never one by accident.
   */
  draftOnly: boolean;
};

const FILM_NOTE = "A film fundraiser never promises distribution, festival acceptance or an audience size.";
const MINORS_NOTE = "A photograph with a minor in it is never published.";

export const STARTER_KITS: readonly StarterKit[] = [
  // Music. Which of these options an act can offer still depends on its act type, so
  // suggestedTemplates narrows the list against what the fundraiser may actually price.
  {
    key: "fund_tour", version: 1, categoryKey: "music",
    label: "Fund a tour",
    shortDescription: "A string of dates away from home.",
    whatItFunds: "Getting the musicians and the gear from one town to the next, and keeping everyone housed on the way.",
    suggestedSponsorTypes: ["Instrument and gear makers", "Local music shops", "Breweries and beverage brands", "Businesses in the towns on the route"],
    suggestedNeeds: ["Van rental and fuel", "Lodging", "Gear repairs and spares", "Posters and merch printing"],
    suggestedOpportunityKeys: ["kick_head", "case_sticker", "merch_runner", "poster_credit", "posts_email"],
    prefill: {
      title: "Upcoming tour",
      purpose: "Van rental, fuel and lodging between dates.",
      audience_description: "The people at each date on the tour, and the musician's followers and mailing list.",
      sponsor_promise: "Each sponsor's name or logo appears where their sponsorship option says, for the length of the tour.",
      kind: "tour", activity_mode: "in_person",
    },
    enabled: true, draftOnly: false,
  },
  {
    key: "fund_recording_release", version: 1, categoryKey: "music",
    label: "Fund a recording or release",
    shortDescription: "Studio time, and getting the finished music out.",
    whatItFunds: "Recording, mixing and mastering, then the artwork, manufacturing and announcements a release needs.",
    suggestedSponsorTypes: ["Instrument and gear makers", "Recording studios and audio brands", "Record shops", "Local businesses with a tie to the musician"],
    suggestedNeeds: ["Studio time", "Mixing and mastering", "Artwork and manufacturing", "Release announcements"],
    suggestedOpportunityKeys: ["posts_email", "vlog_card", "poster_credit", "practice_video"],
    prefill: {
      title: "New recording",
      purpose: "Studio time, mixing and mastering, and the artwork and manufacturing for the release.",
      audience_description: "The musician's listeners, followers and mailing list.",
      sponsor_promise: "Each sponsor's name or logo appears where their sponsorship option says, through the release.",
    },
    enabled: true, draftOnly: false,
  },
  {
    key: "fund_residency", version: 1, categoryKey: "music",
    label: "Fund a residency",
    shortDescription: "A regular night in one room.",
    whatItFunds: "The players, the sound and the room for a standing date, week after week.",
    suggestedSponsorTypes: ["Neighborhood businesses", "Restaurants and bars nearby", "Instrument shops and teachers", "The venue's own suppliers"],
    suggestedNeeds: ["Musicians' fees", "Sound and room costs", "Guest players", "Posters and listings"],
    suggestedOpportunityKeys: ["tip_jar_card", "stage_thanks", "merch_runner", "kick_head", "posts_email"],
    prefill: {
      title: "Residency",
      purpose: "The players, the sound and the room for a regular night.",
      audience_description: "The room on each night of the residency, and the musician's followers.",
      sponsor_promise: "Each sponsor's name or logo appears where their sponsorship option says, for the length of the residency.",
      kind: "residency", activity_mode: "in_person",
    },
    enabled: true, draftOnly: false,
  },

  // Sports
  {
    key: "fund_season", version: 1, categoryKey: "sports",
    label: "Fund a season",
    shortDescription: "A full season of home and away fixtures.",
    whatItFunds: "What a season costs a team: fees, a place to play, what the squad wears, and travel.",
    suggestedSponsorTypes: ["Businesses near the home ground", "Sporting goods shops", "Physical therapy and health practices", "Employers of players and their families"],
    suggestedNeeds: ["League and referee fees", "Field, court or ice rental", "Uniforms and playing gear", "Travel to away fixtures"],
    suggestedOpportunityKeys: ["jersey_front", "warmup_tops", "touchline_banner", "team_sheet", "fixture_posts"],
    prefill: {
      title: "Upcoming season",
      purpose: "League fees, a place to play, uniforms and travel to away fixtures.",
      audience_description: "The crowd at home fixtures, players' families and the team's followers.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the length of the season.",
      activity_mode: "in_person",
    },
    enabled: true, draftOnly: false,
  },
  {
    key: "tournament_travel", version: 1, categoryKey: "sports",
    label: "Fund tournament travel",
    shortDescription: "Getting the squad to one tournament and back.",
    whatItFunds: "Entry, transport, beds and meals for a tournament away from home.",
    suggestedSponsorTypes: ["Travel and transport companies", "Businesses near the home ground", "Sporting goods shops", "Employers of players and their families"],
    suggestedNeeds: ["Entry fees", "Transport", "Lodging", "Meals on the road"],
    // No touchline banner: an away venue is not the team's to promise.
    suggestedOpportunityKeys: ["warmup_tops", "jersey_front", "fixture_posts"],
    prefill: {
      title: "Tournament travel",
      purpose: "Entry fees, transport, lodging and meals for the tournament.",
      audience_description: "Players' families, the people who follow the team, and the crowd at the tournament.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, through the tournament.",
      activity_mode: "in_person",
    },
    enabled: true, draftOnly: false,
  },
  {
    key: "equipment_and_training", version: 1, categoryKey: "sports",
    label: "Fund equipment and training",
    shortDescription: "The gear and coaching a team trains with.",
    whatItFunds: "Playing and safety equipment, training gear, coaching and the time to use them.",
    suggestedSponsorTypes: ["Sporting goods shops", "Equipment makers", "Gyms and training facilities", "Physical therapy and health practices"],
    suggestedNeeds: ["Playing and safety equipment", "Training gear", "Coaching and coach training", "Facility time"],
    suggestedOpportunityKeys: ["warmup_tops", "team_sheet", "fixture_posts"],
    prefill: {
      title: "Equipment and training",
      purpose: "Playing and safety equipment, training gear and coaching.",
      audience_description: "Players' families and the team's followers.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says.",
    },
    enabled: true, draftOnly: false,
  },
  {
    key: "community_clinic", version: 1, categoryKey: "sports",
    label: "Fund a community clinic",
    shortDescription: "Coaching sessions the team opens to its community.",
    whatItFunds: "Free or low-cost sessions led by the team: the coaches, the space and the equipment people use on the day.",
    suggestedSponsorTypes: ["Neighborhood businesses", "Community foundations", "Health practices and insurers", "Sporting goods shops"],
    suggestedNeeds: ["Coaching time", "Facility rental", "Equipment for participants", "Insurance and background checks"],
    suggestedOpportunityKeys: ["touchline_banner", "team_sheet", "fixture_posts"],
    prefill: {
      title: "Community clinic",
      purpose: "Coaches, a place to play and equipment for sessions open to the community.",
      audience_description: "The people who come to the sessions, their families and the team's followers.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for as long as the sessions last.",
      activity_mode: "in_person",
    },
    note: MINORS_NOTE,
    enabled: true, draftOnly: false,
  },

  // Film
  {
    key: "short_film", version: 1, categoryKey: "film",
    label: "Fund a short film",
    shortDescription: "A short, from the shoot to a finished picture.",
    whatItFunds: "The people, places and equipment of a short shoot, and the post-production that finishes it.",
    suggestedSponsorTypes: ["Businesses where the film is shot", "Camera and equipment rental houses", "Brands with a product that fits the story", "Local arts patrons"],
    suggestedNeeds: ["Cast and crew", "Locations and permits", "Equipment rental", "Post-production"],
    suggestedOpportunityKeys: ["end_credit", "special_thanks", "product_placement", "release_posts"],
    prefill: {
      purpose: "Cast and crew, locations, equipment rental and post-production.",
      audience_description: "The people who watch the finished film and come to its screenings. No distribution is promised.",
      sponsor_promise: "Each sponsor is credited where their sponsorship option says, with the wording agreed before the edit is locked.",
      category_details: { format: "Short film" },
    },
    note: FILM_NOTE,
    enabled: true, draftOnly: false,
  },
  {
    key: "documentary", version: 1, categoryKey: "film",
    label: "Fund a documentary",
    shortDescription: "A documentary, in production or on its way to finished.",
    whatItFunds: "Time with the subjects, the rights to archive and music, and the edit, color and sound that finish the film.",
    suggestedSponsorTypes: ["Organizations close to the subject", "Foundations and nonprofits", "Local businesses where the story is set", "Local arts patrons"],
    suggestedNeeds: ["Travel to subjects and locations", "Archive and music licensing", "Editing, color and sound", "Festival deliverables"],
    // No product placement: a documentary's scenes are not arranged for a sponsor.
    suggestedOpportunityKeys: ["end_credit", "special_thanks", "screening_signage", "release_posts"],
    prefill: {
      purpose: "Travel to the subjects, archive and music licensing, and the edit, color and sound.",
      audience_description: "The people who watch the finished film and come to its screenings. No distribution is promised.",
      sponsor_promise: "Each sponsor is credited where their sponsorship option says, with the wording agreed before the edit is locked.",
      category_details: { format: "Documentary" },
    },
    note: FILM_NOTE,
    enabled: true, draftOnly: false,
  },
  {
    key: "screening_series", version: 1, categoryKey: "film",
    label: "Fund a screening series",
    shortDescription: "A set of screenings the production organizes itself.",
    whatItFunds: "The rooms, the projection and the licenses to put finished work in front of an audience.",
    suggestedSponsorTypes: ["Businesses near the screening venues", "Restaurants and bars nearby", "Local media", "Local arts patrons"],
    suggestedNeeds: ["Venue rental", "Projection and sound", "Screening licenses", "Programs and publicity"],
    suggestedOpportunityKeys: ["screening_signage", "screening_program", "release_posts"],
    prefill: {
      title: "Screening series",
      purpose: "Venue rental, projection and sound, screening licenses and programs.",
      audience_description: "The people at each screening, and the production's followers and mailing list.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, at the screenings the production organizes.",
      category_details: { production_stage: "screenings" },
    },
    note: FILM_NOTE,
    enabled: true, draftOnly: false,
  },

  // Theater
  {
    key: "production", version: 1, categoryKey: "theater",
    label: "Fund a theater production",
    shortDescription: "One production, from rehearsal to closing night.",
    whatItFunds: "The rights, the build, the rehearsal room and the people who make and perform the production.",
    suggestedSponsorTypes: ["Businesses near the venue", "Restaurants that serve the audience before and after", "Professional firms", "Local arts patrons"],
    suggestedNeeds: ["Performance rights", "Set, costumes and props", "Rehearsal space", "Cast, crew and creative fees"],
    suggestedOpportunityKeys: ["playbill_credit", "foyer_banner", "curtain_speech", "set_dressing", "production_posts"],
    prefill: {
      purpose: "Performance rights, the set and costumes, rehearsal space and the company's fees.",
      audience_description: "The house at each performance, and the company's followers and mailing list.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the length of the production.",
    },
    enabled: true, draftOnly: false,
  },
  {
    key: "theater_residency", version: 1, categoryKey: "theater",
    label: "Fund a theater residency",
    shortDescription: "A company in residence at one venue.",
    whatItFunds: "Time and space for a company to develop and present work in one venue over a season.",
    suggestedSponsorTypes: ["Businesses near the venue", "Foundations and nonprofits", "Schools and colleges", "Local arts patrons"],
    suggestedNeeds: ["Rehearsal and development time", "Venue costs", "Artists' fees", "Workshops and open rehearsals"],
    suggestedOpportunityKeys: ["foyer_banner", "playbill_credit", "curtain_speech", "production_posts"],
    prefill: {
      title: "Theater residency",
      purpose: "Rehearsal and development time, venue costs and artists' fees.",
      audience_description: "The audiences at the venue through the residency, and the company's followers.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the length of the residency.",
    },
    enabled: true, draftOnly: false,
  },
  {
    key: "venue_run", version: 1, categoryKey: "theater",
    label: "Fund a venue run",
    shortDescription: "A finished production booked into a venue for a set number of performances.",
    whatItFunds: "The venue, the technical crew and the company's fees for the length of the booking.",
    suggestedSponsorTypes: ["Businesses near the venue", "Restaurants that serve the audience before and after", "Hotels and travel companies", "Local arts patrons"],
    suggestedNeeds: ["Venue rental", "Technical crew and load-in", "Cast fees for the engagement", "Publicity and printing"],
    suggestedOpportunityKeys: ["playbill_credit", "foyer_banner", "curtain_speech", "production_posts"],
    prefill: {
      purpose: "Venue rental, technical crew, cast fees and publicity for the booking.",
      audience_description: "The house at each performance, and the company's followers and mailing list.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the length of the booking.",
    },
    enabled: true, draftOnly: false,
  },

  // Hospitality and restaurants. A draft-only category (migration 0047): the registry lets it save
  // a private draft and nothing more, and it has templates and no delivery policy. So these resolve
  // to draft_only. They stay draftOnly here as well, which is the second switch: turning publishing
  // on in the registry does not make a kit publishable until somebody changes the flag on purpose.
  // Version 2: they now point at hospitality's own templates and set the program format.
  {
    key: "sponsored_martini_cart", version: 2, categoryKey: "hospitality",
    label: "Sponsored martini cart",
    shortDescription: "A tableside cocktail cart that carries a sponsor's name or product.",
    whatItFunds: "The cart, the glassware and spirits on it, and the staff who work it.",
    suggestedSponsorTypes: ["Spirits and beverage brands", "Local distillers", "Glassware and barware makers", "Neighborhood businesses"],
    suggestedNeeds: ["The cart and its fittings", "Glassware and barware", "Spirits and garnishes", "Staff training"],
    suggestedOpportunityKeys: ["sponsored_martini_cart"],
    prefill: {
      title: "Martini cart",
      purpose: "The cart, its glassware and spirits, and training for the staff who work it.",
      audience_description: "Guests in the dining room on the nights the cart is out.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the period agreed.",
      activity_mode: "in_person",
      category_details: { format: "Sponsored experience" },
    },
    note: "Alcohol sponsorship has local rules. The restaurant confirms what its license allows.",
    enabled: true, draftOnly: true,
  },
  {
    key: "sponsored_table_plaque", version: 2, categoryKey: "hospitality",
    label: "Sponsored table plaque",
    shortDescription: "A sponsor's name on a plaque at a table or booth.",
    whatItFunds: "A cost the restaurant names, such as new furniture, a refit or a quiet season.",
    suggestedSponsorTypes: ["Regular guests", "Neighborhood businesses", "Professional firms", "Families marking an occasion"],
    suggestedNeeds: ["Furniture and fittings", "Repairs and refits", "Plaques and engraving", "Slow-season operating costs"],
    suggestedOpportunityKeys: ["sponsored_table_plaque"],
    prefill: {
      title: "Table plaques",
      purpose: "New furniture and repairs in the dining room.",
      audience_description: "Guests seated at the table, and everyone who walks past it.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the period agreed.",
      activity_mode: "in_person",
    },
    enabled: true, draftOnly: true,
  },
  {
    key: "chef_residency", version: 2, categoryKey: "hospitality",
    label: "Chef residency",
    shortDescription: "A guest chef cooking in the kitchen for a set period.",
    whatItFunds: "The chef's fee and travel, the ingredients, and the extra hands the kitchen needs while the residency lasts.",
    suggestedSponsorTypes: ["Food and ingredient producers", "Kitchen equipment makers", "Wine and beverage brands", "Local tourism organizations"],
    suggestedNeeds: ["The chef's fee and travel", "Ingredients", "Extra kitchen staff", "Menus and publicity"],
    suggestedOpportunityKeys: ["chef_residency"],
    prefill: {
      title: "Chef residency",
      purpose: "The chef's fee and travel, ingredients and extra kitchen staff.",
      audience_description: "Guests who book during the residency, and the restaurant's followers and mailing list.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the period agreed.",
      activity_mode: "in_person",
      category_details: { format: "Chef residency" },
    },
    enabled: true, draftOnly: true,
  },
  {
    key: "dinner_series", version: 2, categoryKey: "hospitality",
    label: "Dinner series",
    shortDescription: "A set of dinners with a shared theme.",
    whatItFunds: "The ingredients, staff and planning behind a series of special dinners.",
    suggestedSponsorTypes: ["Wine and beverage brands", "Food and ingredient producers", "Local farms", "Neighborhood businesses"],
    suggestedNeeds: ["Ingredients", "Staff for each dinner", "Guest cooks and speakers", "Menus and publicity"],
    suggestedOpportunityKeys: ["dinner_series"],
    prefill: {
      title: "Dinner series",
      purpose: "Ingredients, staff and planning for each dinner in the series.",
      audience_description: "Guests at each dinner, and the restaurant's followers and mailing list.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the period agreed.",
      activity_mode: "in_person",
      category_details: { format: "Dinner series" },
    },
    enabled: true, draftOnly: true,
  },
  {
    key: "community_meal_program", version: 2, categoryKey: "hospitality",
    label: "Community meal program",
    shortDescription: "Meals cooked for neighbors who need them, on a regular schedule.",
    whatItFunds: "The food, the packaging and the kitchen hours behind meals the restaurant gives away.",
    suggestedSponsorTypes: ["Food suppliers and grocers", "Local employers", "Community foundations", "Neighborhood businesses"],
    suggestedNeeds: ["Ingredients", "Packaging and delivery", "Kitchen staff hours", "Coordination with local partners"],
    suggestedOpportunityKeys: ["community_meal_program"],
    prefill: {
      title: "Community meal program",
      purpose: "Ingredients, packaging and kitchen hours for meals the restaurant gives away.",
      audience_description: "Neighbors, local partners and the restaurant's followers.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the period agreed.",
      activity_mode: "in_person",
      category_details: { format: "Community meal program" },
    },
    enabled: true, draftOnly: true,
  },
  {
    key: "sponsored_restaurant_space", version: 2, categoryKey: "hospitality",
    label: "Sponsored restaurant space",
    shortDescription: "A room, patio or counter that carries a sponsor's name.",
    whatItFunds: "Building or renovating one part of the restaurant, and furnishing it.",
    suggestedSponsorTypes: ["Neighborhood businesses", "Furniture and design firms", "Beverage brands", "Professional firms"],
    suggestedNeeds: ["Renovation and construction", "Furniture and fittings", "Signage", "Permits"],
    suggestedOpportunityKeys: ["sponsored_restaurant_space", "sponsored_table_plaque"],
    prefill: {
      title: "Restaurant space",
      purpose: "Building, furnishing and signage for one part of the restaurant.",
      audience_description: "Guests who use the space, and everyone who passes it.",
      sponsor_promise: "Each sponsor's name appears where their sponsorship option says, for the period agreed.",
      activity_mode: "in_person",
    },
    enabled: true, draftOnly: true,
  },
];

// ---------------------------------------------------------------
// Reading the registry
// ---------------------------------------------------------------

/** The kit with this key, or null. A retired kit still answers, so an old reference can be named. */
export function starterKit(key: string | null | undefined): StarterKit | null {
  return STARTER_KITS.find((kit) => kit.key === key) ?? null;
}

/** Every kit written for a category, in written order, whatever its status. */
export function starterKitsForCategory(categoryKey: string): StarterKit[] {
  return STARTER_KITS.filter((kit) => kit.categoryKey === categoryKey);
}

/** Whether this kit belongs to the category somebody selected. A kit never crosses categories. */
export function kitFitsCategory(kit: Pick<StarterKit, "categoryKey">, categoryKey: string | null | undefined): boolean {
  return Boolean(categoryKey) && kit.categoryKey === categoryKey;
}

const inCategory = (categoryKey?: string) => (kit: StarterKit) => categoryKey === undefined || kit.categoryKey === categoryKey;

/**
 * Kits that are on and not held to drafts, for one category or for all of them. This is what the
 * file says; starterKitAvailability is what the database lets happen.
 */
export function enabledStarterKits(categoryKey?: string): StarterKit[] {
  return STARTER_KITS.filter(inCategory(categoryKey)).filter((kit) => kit.enabled && !kit.draftOnly);
}

/** Kits that are on and held to private drafts. Never mixed into enabledStarterKits. */
export function draftOnlyStarterKits(categoryKey?: string): StarterKit[] {
  return STARTER_KITS.filter(inCategory(categoryKey)).filter((kit) => kit.enabled && kit.draftOnly);
}

// ---------------------------------------------------------------
// What the database lets a kit do
// ---------------------------------------------------------------

/**
 * A `fundraiser_categories` row. draftCategories() does not select publish_enabled today, so it is
 * optional here, and a row without it reads as not publishable: the safe answer is the default one,
 * the same way categoryStatus answers for a category nobody turned on.
 */
export type KitCategory = FundraiserCategory & { publish_enabled?: boolean | null };

export type StarterKitAvailability =
  /** The category can publish and the kit is not held back. */
  | "publishable"
  /** A draft can be saved from it and cannot leave draft status. */
  | "draft_only"
  /** The kit is retired, or its category has no registry row or does not take drafts. */
  | "unavailable";

export function starterKitAvailability(kit: StarterKit, categories: readonly KitCategory[]): StarterKitAvailability {
  const category = categories.find((c) => c.key === kit.categoryKey);
  if (!kit.enabled || !category || !category.draft_enabled) return "unavailable";
  return kit.draftOnly || category.publish_enabled !== true ? "draft_only" : "publishable";
}

export type StarterKitGroup = {
  /** The registry's key and label, ready for CategoryBadge or categoryLabel. */
  category: Category;
  label: string;
  kits: { kit: StarterKit; availability: Exclude<StarterKitAvailability, "unavailable"> }[];
};

/**
 * The kits an organizer can start from, grouped by category in the registry's order and under the
 * registry's names. An unavailable kit is left out, and so is a category with none to show, so a
 * category Door Money has not added never appears in a picker.
 */
export function starterKitGroups(categories: readonly KitCategory[]): StarterKitGroup[] {
  return categories
    .map((category) => ({
      category: { key: category.key, label: category.label },
      label: categoryLabel(category),
      kits: starterKitsForCategory(category.key).flatMap((kit) => {
        const availability = starterKitAvailability(kit, categories);
        return availability === "unavailable" ? [] : [{ kit, availability }];
      }),
    }))
    .filter((group) => group.kits.length > 0);
}

/**
 * The kit's suggested templates, from the templates this fundraiser may actually offer.
 *
 * Pass what templatesForFundraiser returned. A suggestion the fundraiser cannot offer (another
 * category, a retired template, a music option that does not suit the act type) is left out, so a
 * kit never shows an option the editor would refuse. Templates, in the kit's order. Never lots.
 */
export function suggestedTemplates<T extends Pick<OpportunityTemplate, "key" | "category" | "active">>(kit: StarterKit, offerable: readonly T[]): T[] {
  return kit.suggestedOpportunityKeys.flatMap((key) => {
    const template = offerable.find((t) => t.key === key && t.category === kit.categoryKey && t.active);
    return template ? [template] : [];
  });
}

// ---------------------------------------------------------------
// Applying a kit to a draft form
// ---------------------------------------------------------------

/** The part of the draft form a kit can touch. Any other field passes through untouched. */
export type KitFormValues = {
  category_key?: string | null;
  title?: string | null;
  purpose?: string | null;
  audience_description?: string | null;
  sponsor_promise?: string | null;
  /** Strings, as a form holds them: "" is "not answered" and reads as empty. The draft schema checks the value on save. */
  kind?: string | null;
  activity_mode?: string | null;
  category_details?: Record<string, string> | null;
};

export type StarterKitError = "unknown_kit" | "kit_unavailable" | "category_mismatch";

/** Written to the organizer choosing a kit, so the second person is right (voice rule 1). */
export const STARTER_KIT_ERROR_MESSAGE: Record<StarterKitError, string> = {
  unknown_kit: "Choose a starter kit from the list.",
  kit_unavailable: "This starter kit is not available yet.",
  category_mismatch: "This starter kit belongs to another category. Start a new fundraiser to use it.",
};

/** The kit's fields as they leave applyStarterKit: a category is always set, and the details are always an object. */
export type AppliedKitValues = Omit<KitFormValues, "category_key" | "category_details"> & {
  category_key: string;
  category_details: Record<string, string>;
};

export type AppliedStarterKit<T> =
  | {
      ok: true;
      /** Everything the form held, with the kit's fields laid over the ones a kit can touch. */
      values: Omit<T, keyof KitFormValues> & AppliedKitValues;
      /** What was applied, for the caller to keep in its own state. Nothing stores it. */
      kit: { key: string; version: number };
      /** The form fields the kit filled, by input name: "kind", "detail_format". Empty when it filled none. */
      filled: string[];
    }
  | { ok: false; error: StarterKitError };

const empty = (value: unknown) => value === null || value === undefined || value === "";

/**
 * A kit's defaults laid over a draft form's values, as new values.
 *
 * Nothing is saved, and nothing passed in is changed: the result is a copy for the form to show,
 * and it reaches the database only if the organizer saves the draft, through the same action and
 * the same validation as anything they typed. A field that already has an answer keeps it, so
 * applying a kit to a saved draft can only fill gaps. A kit from another category is refused
 * instead of switching the draft's category under the organizer.
 */
export function applyStarterKit<T extends KitFormValues>(kitKey: string, values: T, categories: readonly KitCategory[]): AppliedStarterKit<T> {
  const kit = starterKit(kitKey);
  if (!kit) return { ok: false, error: "unknown_kit" };
  if (starterKitAvailability(kit, categories) === "unavailable") return { ok: false, error: "kit_unavailable" };
  if (!empty(values.category_key) && !kitFitsCategory(kit, values.category_key)) return { ok: false, error: "category_mismatch" };

  const filled: string[] = [];
  const next: Omit<T, keyof KitFormValues> & AppliedKitValues = {
    ...values,
    category_key: kit.categoryKey,
    category_details: { ...(values.category_details ?? {}) },
  };
  if (empty(values.category_key)) filled.push("category_key");

  for (const field of KIT_TEXT_FIELDS) {
    const example = kit.prefill[field];
    if (!example || !empty(values[field])) continue;
    next[field] = example;
    filled.push(field);
  }
  // Music's performance format is refused everywhere else, so it is never offered anywhere else.
  if (kit.prefill.kind && kit.categoryKey === "music" && empty(values.kind)) {
    next.kind = kit.prefill.kind;
    filled.push("kind");
  }
  if (kit.prefill.activity_mode && empty(values.activity_mode)) {
    next.activity_mode = kit.prefill.activity_mode;
    filled.push("activity_mode");
  }
  const allowed = categories.find((c) => c.key === kit.categoryKey)?.detail_keys ?? [];
  for (const [key, value] of Object.entries(kit.prefill.category_details ?? {})) {
    if (!allowed.includes(key) || !empty(next.category_details[key])) continue;
    next.category_details[key] = value;
    filled.push(`detail_${key}`);
  }
  return { ok: true, values: next, kit: { key: kit.key, version: kit.version }, filled };
}

/**
 * A kit's examples taken back out of a form, as new values.
 *
 * Used when the organizer starts from scratch after all, picks another kit, or switches category.
 * Only what is still exactly the kit's own example goes: a field the organizer has edited is their
 * words now and stays. Nothing passed in is changed.
 */
export function clearStarterKit<T extends KitFormValues>(kitKey: string | null | undefined, values: T): T {
  const kit = starterKit(kitKey);
  if (!kit) return values;
  const next: T = { ...values, category_details: { ...(values.category_details ?? {}) } };
  for (const field of KIT_TEXT_FIELDS) if (kit.prefill[field] && values[field] === kit.prefill[field]) next[field] = "";
  if (kit.prefill.kind && values.kind === kit.prefill.kind) next.kind = "";
  if (kit.prefill.activity_mode && values.activity_mode === kit.prefill.activity_mode) next.activity_mode = "";
  for (const [key, value] of Object.entries(kit.prefill.category_details ?? {})) {
    if (next.category_details?.[key] === value) delete next.category_details[key];
  }
  return next;
}

// ---------------------------------------------------------------
// A kit named in a link
// ---------------------------------------------------------------

export type StarterKitLink =
  /** No kit was asked for. */
  | { status: "none" }
  | { status: "ready"; kit: StarterKit; availability: Exclude<StarterKitAvailability, "unavailable"> }
  | { status: "refused"; error: Extract<StarterKitError, "unknown_kit" | "kit_unavailable"> };

/**
 * /dashboard/runs/new?template=fund_tour. The parameter is looked up in the registry and nowhere
 * else, so an unknown value is refused and never echoed, and a kit the database does not allow
 * (hospitality, today) is refused the same way a click on it would be.
 */
export function starterKitFromLink(param: string | string[] | undefined, categories: readonly KitCategory[]): StarterKitLink {
  const key = Array.isArray(param) ? param[0] : param;
  if (!key) return { status: "none" };
  const kit = /^[a-z][a-z0-9_]{1,39}$/.test(key) ? starterKit(key) : null;
  if (!kit) return { status: "refused", error: "unknown_kit" };
  const availability = starterKitAvailability(kit, categories);
  if (availability === "unavailable") return { status: "refused", error: "kit_unavailable" };
  return { status: "ready", kit, availability };
}
