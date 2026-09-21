/**
 * Placement verification: what an organizer says sponsors will get back from a fundraiser.
 *
 * One list, read by the dashboard editor, the server action, the readiness checklist and the
 * public board, so the words on the board are the words the musician ticked. The keys are stored
 * in runs.verification_methods and are checked again by a constraint in migration 0020; adding a
 * method means adding it here and in that constraint.
 *
 * Nothing here promises documentation from every show, and nothing here says Door Money checked
 * anything. See CLAUDE.md, "No invented proof", and docs/DECISIONS.md, decision 9.
 *
 * Every category picks from the same list, and the stored keys never change: a method means the
 * same promise whoever makes it. Only the sentence changes, because a theater company does not
 * play shows and a team does not play nights. This is the wording, not a new commitment: what a
 * category owes as evidence, and when money is released, is its delivery policy (migration 0045).
 *
 * A category in the registry needs a rewording here. One without it is shown music's sentences,
 * which is how a hospitality draft came to ask a restaurant about "selected shows".
 * tests/verification.test.ts reads the registry from the migrations and refuses that.
 */
import { z } from "zod";

export const OTHER_KEY = "other";
export const OTHER_MIN = 10;
export const OTHER_MAX = 500;

export interface VerificationMethod {
  /** Stored in the database. Never change one; add a new key instead. */
  key: string;
  /** The words on the dashboard row and on the public board. The same sentence in both places. */
  label: string;
  /** A line under the label in the dashboard only, to make the choice concrete. */
  note: string;
}

/**
 * The same method in another category's words. A category with nothing to say here keeps music's
 * sentence, which is the right answer wherever the two really do describe the same thing.
 */
type Rewording = Partial<Record<string, { label?: string; note?: string }>>;

const WORDS: Record<string, Rewording> = {
  sports: {
    selected_show_photos: { label: "Dated photos from selected fixtures", note: "Photos from some of the fixtures, each carrying its date." },
    venue_date_record: { label: "Venue and fixture-date list", note: "The grounds played and the day each fixture was played." },
    attendance_estimates: { note: "A rough headcount for the fixtures." },
    social_post_links: { note: "Links to the posts the sponsor appeared in." },
    short_video: { label: "Short matchday or training video", note: "One clip from a fixture, or from the session before it." },
    end_of_run_record: { label: "End-of-fundraiser placement record", note: "The record Door Money sends every sponsor when the fundraiser ends." },
    other: { note: "Something else, in the team's own words." },
  },
  film: {
    selected_show_photos: { label: "Dated photos from selected shoot days", note: "Photos from some of the days on set, each carrying its date." },
    venue_date_record: { label: "Location and screening-date list", note: "Where the work was shot or shown, and when." },
    attendance_estimates: { note: "A rough headcount for the screenings." },
    social_post_links: { note: "Links to the posts the sponsor appeared in." },
    short_video: { label: "Short on-set or screening video", note: "One clip from the set, or from a screening." },
    end_of_run_record: { label: "End-of-fundraiser placement record", note: "The record Door Money sends every sponsor when the fundraiser ends." },
    other: { note: "Something else, in the filmmaker's own words." },
  },
  theater: {
    selected_show_photos: { label: "Dated photos from selected performances", note: "Photos from some of the performances, each carrying its date." },
    attendance_estimates: { note: "A rough headcount for the performances." },
    social_post_links: { note: "Links to the posts the sponsor appeared in." },
    short_video: { note: "One clip from a performance, or from the hour before it." },
    end_of_run_record: { label: "End-of-fundraiser placement record", note: "The record Door Money sends every sponsor when the fundraiser ends." },
    other: { note: "Something else, in the company's own words." },
  },
  // A venue's evidence is of the placement: the cart, the plaque, the sign, the menu. Guests are
  // in the room and are not what is being documented, and a meal program names nobody it serves.
  hospitality: {
    selected_show_photos: { label: "Dated photos from selected days or events", note: "Photos of the placement on some of the days or events, each carrying its date. Photograph the placement, not the guests." },
    venue_date_record: { label: "Venue and date list", note: "Where the program took place, and the dates it was on." },
    attendance_estimates: { note: "A rough count of guests for the dates or events." },
    social_post_links: { note: "Links to the posts the sponsor appeared in." },
    short_video: { label: "Short video from the venue or an event", note: "One clip of the placement in use, or of the hour before service." },
    end_of_run_record: { label: "End-of-fundraiser placement record", note: "The record Door Money sends every sponsor when the fundraiser ends." },
    other: { note: "Something else, in the venue's own words." },
  },
  // Other (migration 0049) borrows nobody's words. There is no shared shape to name, so each line
  // says only what any placement has: a place, a date, an audience. Nothing here mentions a show.
  other: {
    selected_show_photos: { label: "Dated photos from selected dates", note: "Photos of the placement on some of the dates, each carrying its date." },
    venue_date_record: { label: "Place and date list", note: "Where the activity took place, in person or online, and the dates." },
    attendance_estimates: { note: "A rough count of the audience for the dates." },
    social_post_links: { note: "Links to the posts the sponsor appeared in." },
    short_video: { label: "Short video of the placement", note: "One clip of the placement where the audience sees it." },
    end_of_run_record: { label: "End-of-fundraiser placement record", note: "The record Door Money sends every sponsor when the fundraiser ends." },
    other: { note: "Something else, in the organizer's own words." },
  },
};

export const VERIFICATION_METHODS: readonly VerificationMethod[] = [
  { key: "selected_show_photos", label: "Dated photos from selected shows", note: "Photos from some of the shows, each carrying its date." },
  { key: "venue_date_record", label: "Venue and performance-date list", note: "The rooms played and the night each one was played." },
  { key: "attendance_estimates", label: "Attendance estimates", note: "A rough headcount for the shows." },
  { key: "social_post_links", label: "Links to placement-related posts", note: "Links to the posts the logo appeared in." },
  { key: "short_video", label: "Short performance or backstage video", note: "One clip from a show, or from the hour before it." },
  { key: "end_of_run_record", label: "End-of-run placement record", note: "The record Door Money sends every patron when the fundraiser ends." },
  { key: OTHER_KEY, label: "Another verification method", note: "Something else, in the musician's own words." },
] as const;

/**
 * The list as this category says it, in catalog order. An unknown category gets music's words,
 * which are the words every stored method was chosen under.
 */
export function verificationMethods(categoryKey: string): readonly VerificationMethod[] {
  const words = WORDS[categoryKey];
  if (!words) return VERIFICATION_METHODS;
  return VERIFICATION_METHODS.map((m) => ({ ...m, ...words[m.key] }));
}

const KEYS = new Set(VERIFICATION_METHODS.map((m) => m.key));

export function isVerificationKey(key: string): boolean {
  return KEYS.has(key);
}

export function methodLabel(key: string, categoryKey: string): string | null {
  return verificationMethods(categoryKey).find((m) => m.key === key)?.label ?? null;
}

/** What a run carries, as the database and the sample boards both hold it. */
export type VerificationChoice = {
  methods: string[];
  other: string | null;
};

/**
 * One selected method, ready to render. `detail` is set on the write-in answer only.
 * Always in the order of VERIFICATION_METHODS, whatever order the array was stored in.
 */
export type VerificationItem = { key: string; label: string; detail?: string };

/**
 * The methods to show, in catalog order, with unknown keys dropped. An empty result means the
 * section does not belong on the page at all: an older run that predates this feature, or a draft
 * the musician has not answered yet.
 */
export function verificationItems(choice: Partial<VerificationChoice> | null | undefined, categoryKey: string): VerificationItem[] {
  const selected = new Set(choice?.methods ?? []);
  const other = choice?.other?.trim() || null;
  const items: VerificationItem[] = [];
  for (const m of verificationMethods(categoryKey)) {
    if (!selected.has(m.key)) continue;
    // "Another verification method" with nothing written in says nothing, so it stays off the board.
    if (m.key === OTHER_KEY) {
      if (!other) continue;
      items.push({ key: m.key, label: m.label, detail: other });
      continue;
    }
    items.push({ key: m.key, label: m.label });
  }
  return items;
}

/** Whether anything was chosen. The words differ by category; whether a key is set does not. */
export function hasVerification(choice: Partial<VerificationChoice> | null | undefined): boolean {
  return verificationItems(choice, "music").length > 0;
}

/**
 * Whether this answer is good enough to put a board on the internet: something chosen, and a
 * write-in answer long enough to mean something if that is what was chosen. The database constraint
 * in migration 0020 says the same, so a run that fails this cannot have been stored anyway; the
 * check is here as well so publishing decides on its own rather than on the last write's luck.
 */
export function verificationPublishable(choice: Partial<VerificationChoice> | null | undefined): boolean {
  if (!hasVerification(choice)) return false;
  if (!(choice?.methods ?? []).includes(OTHER_KEY)) return true;
  const answer = choice?.other?.trim() ?? "";
  return answer.length >= OTHER_MIN && answer.length <= OTHER_MAX;
}

export type VerificationField = "methods" | "other" | "form";

/**
 * What the editor posts. Unknown keys are rejected rather than dropped: a key the app does not
 * know came from something other than this form, and the constraint would refuse it anyway.
 *
 * Zero methods parses. A draft is allowed to sit unanswered; publishing is where at least one
 * is required, in publishBlockers.
 */
export const VerificationInput = z
  .object({
    methods: z
      .array(z.string().trim())
      .max(VERIFICATION_METHODS.length, "That is not one of the methods on the list.")
      .refine((list) => list.every(isVerificationKey), "That is not one of the methods on the list.")
      .refine((list) => new Set(list).size === list.length, "That method was sent twice."),
    other: z.string().trim().max(OTHER_MAX, `Keep the description under ${OTHER_MAX} characters.`).optional().default(""),
  })
  .superRefine((v, ctx) => {
    const picked = v.methods.includes(OTHER_KEY);
    if (picked && v.other.length === 0) {
      ctx.addIssue({ code: "custom", path: ["other"], message: "Describe the other verification method, or clear the tick above it." });
      return;
    }
    if (picked && v.other.length < OTHER_MIN) {
      ctx.addIssue({ code: "custom", path: ["other"], message: `Give it at least ${OTHER_MIN} characters so a patron knows what to expect.` });
    }
  })
  .transform((v): VerificationChoice => ({
    // Catalog order in, catalog order out, so the stored array reads the way the board does.
    methods: VERIFICATION_METHODS.filter((m) => v.methods.includes(m.key)).map((m) => m.key),
    // The write-in answer only survives while its tick does. Deselecting "other" clears it.
    other: v.methods.includes(OTHER_KEY) ? v.other : null,
  }));

export type VerificationParse =
  | { ok: true; value: VerificationChoice }
  | { ok: false; errors: Partial<Record<VerificationField, string>> };

/** Parses what the form sent, with the first message per field. */
export function parseVerification(raw: { methods: unknown; other: unknown }): VerificationParse {
  const parsed = VerificationInput.safeParse({
    methods: Array.isArray(raw.methods) ? raw.methods : [],
    other: typeof raw.other === "string" ? raw.other : "",
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: Partial<Record<VerificationField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = (issue.path[0] as VerificationField | undefined) ?? "form";
    if (!errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}
