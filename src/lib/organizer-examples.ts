/**
 * The sponsorship ideas on the organizer page (/list), and where each one leads.
 *
 * Every example is a starter kit (src/lib/starter-kits.ts) put in a visitor's words: "a jersey or
 * warm-up sponsorship" is the season kit, seen from the sponsor's side. An example names a kit by
 * key and owns nothing else about it, so there is one list of kits and this is only a way in.
 *
 * What an example may say depends on the registry, not on this file:
 *
 *   open         the category is one Door Money has, so the example links into the new fundraiser
 *                form with its kit chosen (/dashboard/runs/new?template=<key>)
 *   draft_only   the category exists and its kits are held to private drafts: the link works and
 *                the example says "Private draft". Restaurants & hospitality stands here today.
 *   coming_soon  the registry has no such category. The example is shown as an example and links
 *                nowhere near the form, which would refuse it. A database without migration 0047
 *                reads hospitality this way, which is the safe reading.
 *
 * So the day a category is added to `fundraiser_categories`, its examples start linking, and not
 * before. Nothing here can present a category as live.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */
import { SEEDED_CATEGORY_KEYS } from "@/lib/starting-categories";
import { starterKit, type StarterKit } from "@/lib/starter-kits";

export type OrganizerExample = {
  /** The starter kit this example opens. */
  kitKey: string;
  /** The idea, as a sponsor or an organizer would say it. */
  title: string;
  /** One sentence: what it funds, and where the sponsor appears. A possibility, never a promise. */
  line: string;
};

export type ExampleGroup = {
  /** A `fundraiser_categories` key. */
  categoryKey: string;
  /** Who this is for, in the organizer page's words. */
  heading: string;
  examples: readonly OrganizerExample[];
};

export const EXAMPLE_GROUPS: readonly ExampleGroup[] = [
  {
    categoryKey: "music",
    heading: "Musicians and tours",
    examples: [
      { kitKey: "fund_tour", title: "A sponsor-funded tour", line: "Sponsors cover the van, the fuel and the beds. Their names appear in the places the tour already reaches." },
      { kitKey: "fund_residency", title: "A residency with a name behind it", line: "A local business keeps a regular night going, and is named in the room." },
    ],
  },
  {
    categoryKey: "sports",
    heading: "Sports teams and tournaments",
    examples: [
      { kitKey: "fund_season", title: "A jersey or warm-up sponsorship", line: "A sponsor pays toward the season and appears on what the squad wears, where the league allows it." },
      { kitKey: "tournament_travel", title: "A sponsored tournament trip", line: "Sponsors get the squad to the tournament and back, and are named in the team's announcements." },
    ],
  },
  {
    categoryKey: "film",
    heading: "Filmmakers and screenings",
    examples: [
      { kitKey: "short_film", title: "An end-credit sponsorship", line: "A sponsor helps finish the film and is credited in the end titles, in wording agreed before the edit is locked." },
      { kitKey: "screening_series", title: "A sponsored screening series", line: "Sponsors pay for the rooms and the projection, and appear on the signage and the program." },
    ],
  },
  {
    categoryKey: "theater",
    heading: "Theater productions",
    examples: [
      { kitKey: "production", title: "A program or foyer sponsorship", line: "A sponsor puts money into the production and appears in the program or on the foyer signage." },
      { kitKey: "venue_run", title: "A sponsored booking at a venue", line: "Sponsors help a finished production take a venue, and are named there for the length of the booking." },
    ],
  },
  {
    categoryKey: "hospitality",
    heading: "Restaurants & hospitality",
    examples: [
      { kitKey: "sponsored_martini_cart", title: "A sponsored martini cart", line: "A spirits brand pays for a tableside cart, and its name or product appears on it." },
      { kitKey: "sponsored_table_plaque", title: "A branded table plaque", line: "A regular or a local firm pays toward the dining room, and a plaque at a table says so." },
      { kitKey: "chef_residency", title: "A chef residency", line: "A sponsor brings a guest chef into the kitchen for a season, and is named on the residency menu." },
      { kitKey: "dinner_series", title: "A sponsored dinner series", line: "A producer or a winery pays toward a set of dinners, and is named on each menu." },
    ],
  },
];

/**
 * Who organizes, on the organizer page. Kept here with the page's other words, so the page itself
 * names no category: tests/organizer-acquisition.test.ts holds it to that. The last card is the
 * test every later category has to pass, which is why the list never reads as closed.
 */
export const WHO_ORGANIZES: readonly (readonly [string, string])[] = [
  ["Musicians", "Bands, ensembles, soloists and music organizations."],
  ["Teams", "A team, or a representative with authority over what the team offers."],
  ["Filmmakers", "A filmmaker or a production organization."],
  ["Theater companies", "A company, or an authorized producer."],
  ["Hospitality venues", "Restaurants, bars, hospitality venues, caterers and community kitchens."],
  ["Other projects", "A project outside the named categories that can still state its purpose, its audience and what the sponsor receives."],
  ["Organizations", "A group that organizes the work and answers for its delivery."],
  ["What comes next", "Any organizer who can state the funding purpose, the audience, what the sponsor receives and how delivery will be documented."],
];

export type ExampleStatus = "open" | "draft_only" | "coming_soon";

/** What a reader sees beside an example that is not simply open. */
export const EXAMPLE_STATUS_LABEL: Record<Exclude<ExampleStatus, "open">, string> = {
  draft_only: "Private draft",
  coming_soon: "Coming soon",
};

/**
 * Where a category stands, from the registry's public labels (src/lib/category-registry.ts).
 *
 * A category is known when the registry names it. The four categories the registry was seeded
 * with count as known even when the read came back empty, the way every other page falls back to
 * their seeded names, so a database hiccup never relabels music as coming soon. Any category added
 * since, starting category or not, has to be in the registry.
 */
export function exampleStatus(kit: Pick<StarterKit, "categoryKey" | "draftOnly" | "enabled">, registryLabels: Readonly<Record<string, string>>): ExampleStatus {
  const known = kit.categoryKey in registryLabels || SEEDED_CATEGORY_KEYS.includes(kit.categoryKey);
  if (!known || !kit.enabled) return "coming_soon";
  return kit.draftOnly ? "draft_only" : "open";
}

/** The new fundraiser form, on a starter kit where one is named. Only a real kit's key is written into an address. */
export function newFundraiserPath(kitKey?: string | null): string {
  const kit = starterKit(kitKey);
  return kit ? `/dashboard/runs/new?template=${kit.key}` : "/dashboard/runs/new";
}

/**
 * Where an example's link goes. Somebody signed in goes straight to the form. Anybody else creates
 * an account first and lands on the same form, with the same kit, afterwards. A category that is
 * coming soon has no link into the form at all.
 */
export function exampleHref(kitKey: string, status: ExampleStatus, signedIn: boolean): string | null {
  if (status === "coming_soon") return null;
  const path = newFundraiserPath(kitKey);
  return signedIn ? path : `/signup?next=${encodeURIComponent(path)}`;
}
