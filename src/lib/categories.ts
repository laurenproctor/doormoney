/**
 * What each category calls its organizer, its work and its details, in words.
 *
 * The database registry decides which categories exist and which detail keys each one allows
 * (`fundraiser_categories`, migration 0038). This file only supplies the words, the way
 * src/lib/periods.ts holds the words for a stored kind and src/lib/verification.ts holds the words
 * for what an organizer promises. A category added in SQL renders a plain text field under a
 * humanized label instead of crashing, so adding a category stays configuration.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */

export type DetailOption = { value: string; label: string };

export type DetailField = {
  /** The key stored in runs.category_details, and the one the registry allows. */
  key: string;
  label: string;
  /** One short line under the input, where the label alone leaves a real question. */
  help?: string;
  /** A short, closed list of answers. Free text when the honest answer is not a list. */
  options?: DetailOption[];
  placeholder?: string;
};

export type CategoryLanguage = {
  /** Who is responsible for delivery: musician, team, filmmaker, theater company. */
  organizer: string;
  /** What the fundraiser's name field is called on a form. */
  titleLabel: string;
  /** The detail fields this file has words for, by key. */
  details: Record<string, DetailField>;
};

/**
 * Detail fields are deliberately thin. They add the context a sponsor needs to judge fit; they do
 * not restate the funding purpose, the sponsor promise or the audience, which every category
 * already answers in its own fields.
 *
 * A closed option list is used only where the answer really is a short list and something later
 * depends on it. Level of play is one: Phase 4 has to know a team is a youth team before it decides
 * what evidence may be published. Sport, format and venue stay free text, because a fixed list
 * there would quietly become a limit on who can raise money here.
 */
const LANGUAGE: Record<string, CategoryLanguage> = {
  music: {
    organizer: "musician",
    titleLabel: "Fundraiser name",
    details: {
      format: {
        key: "format",
        label: "Release or program format",
        help: "A studio album, an EP, a concert program. The performance format above covers a tour, a season or a residency.",
        placeholder: "Studio album",
      },
    },
  },
  sports: {
    organizer: "team",
    titleLabel: "Season or event name",
    details: {
      sport: { key: "sport", label: "Sport", placeholder: "Soccer" },
      level: {
        key: "level",
        label: "Level of play",
        help: "This sets what a sponsorship may show later. A youth team has stricter limits on photographs.",
        options: [
          { value: "youth", label: "Youth" },
          { value: "school", label: "School" },
          { value: "college", label: "College or university" },
          { value: "club", label: "Club or amateur" },
          { value: "semi_professional", label: "Semi-professional" },
          { value: "professional", label: "Professional" },
        ],
      },
    },
  },
  film: {
    organizer: "filmmaker",
    titleLabel: "Production name",
    details: {
      format: { key: "format", label: "Format", placeholder: "Feature documentary" },
      production_stage: {
        key: "production_stage",
        label: "Production stage",
        help: "Where the work stands now. It can move while the fundraiser is open.",
        options: [
          { value: "development", label: "Development" },
          { value: "pre_production", label: "Pre-production" },
          { value: "production", label: "Production" },
          { value: "post_production", label: "Post-production" },
          { value: "completion", label: "Completion" },
          { value: "screenings", label: "Screenings" },
        ],
      },
    },
  },
  theater: {
    organizer: "theater company",
    titleLabel: "Production name",
    details: {
      production: { key: "production", label: "Production", placeholder: "A Number" },
      venue: { key: "venue", label: "Venue or stage", help: "Leave this empty until the venue is settled.", placeholder: "Bushwick Starr" },
    },
  },
};

/** "production_stage" reads as "Production stage" until somebody writes it a better label. */
function humanize(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The noun for whoever is responsible here. Neutral for a category this file has no words for. */
export function organizerNoun(categoryKey: string | null | undefined): string {
  return LANGUAGE[categoryKey ?? ""]?.organizer ?? "organizer";
}

/** What to call the name field. Neutral for a category this file has no words for. */
export function titleLabel(categoryKey: string | null | undefined): string {
  return LANGUAGE[categoryKey ?? ""]?.titleLabel ?? "Fundraiser name";
}

/**
 * The fields to draw for a category, in the registry's order.
 *
 * The registry is the source of truth for which keys belong to a category; this only decides how
 * each one is asked. An allowed key with no words here becomes a plain text field.
 */
export function detailFields(categoryKey: string, detailKeys: readonly string[]): DetailField[] {
  const known = LANGUAGE[categoryKey]?.details ?? {};
  return detailKeys.map((key) => known[key] ?? { key, label: humanize(key) });
}

/**
 * Values that a closed list does not allow, in words a person can act on.
 *
 * Unknown keys are not checked here: categoryErrors in src/lib/fundraiser-drafts.ts already refuses
 * a key the category does not allow, and a key with no words here is free text on purpose.
 */
export function detailValueErrors(categoryKey: string, details: Record<string, string>, detailKeys: readonly string[]): string[] {
  const out: string[] = [];
  for (const field of detailFields(categoryKey, detailKeys)) {
    const value = details[field.key];
    if (!field.options || value === undefined || value === "") continue;
    if (!field.options.some((option) => option.value === value)) {
      out.push(`Choose a ${field.label.toLowerCase()} from the list.`);
    }
  }
  return out;
}

/**
 * What a music act is, in the words the cards have always used. Only music has an act type, so this
 * is the only category with a line of its own here.
 */
const MUSIC_KIND: Record<string, { plain: string; withCity: (city: string) => string }> = {
  touring_band: { plain: "Band, touring", withCity: () => "Band, touring" },
  house_act: { plain: "House act", withCity: (city) => `House act, ${city}` },
  soloist: { plain: "Soloist", withCity: (city) => `Soloist, gigging ${city}` },
};

/**
 * The small caps line above an organizer's name on a card.
 *
 * Music keeps the line it has always had. Every other category says what it is, and says where only
 * when somebody said where: the product contract is explicit that nobody gets an invented city.
 */
export function organizerLabel(categoryKey: string, actType: string | null, city: string | null): string {
  const music = actType ? MUSIC_KIND[actType] : null;
  if (music) return city ? music.withCity(city) : music.plain;
  const what = organizerNoun(categoryKey);
  return [what.charAt(0).toUpperCase() + what.slice(1), city].filter(Boolean).join(", ");
}
