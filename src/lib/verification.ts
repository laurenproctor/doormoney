/**
 * Placement verification: what a musician says patrons will get back from a run.
 *
 * One list, read by the dashboard editor, the server action, the readiness checklist and the
 * public board, so the words on the board are the words the musician ticked. The keys are stored
 * in runs.verification_methods and are checked again by a constraint in migration 0020; adding a
 * method means adding it here and in that constraint.
 *
 * Nothing here promises documentation from every show, and nothing here says Door Money checked
 * anything. See CLAUDE.md, "No invented proof", and docs/DECISIONS.md, decision 9.
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

export const VERIFICATION_METHODS: readonly VerificationMethod[] = [
  { key: "selected_show_photos", label: "Dated photos from selected shows", note: "Photos from some of the shows, each carrying its date." },
  { key: "venue_date_record", label: "Venue and performance-date list", note: "The rooms played and the night each one was played." },
  { key: "attendance_estimates", label: "Attendance estimates", note: "A rough headcount for the shows." },
  { key: "social_post_links", label: "Links to placement-related posts", note: "Links to the posts the logo appeared in." },
  { key: "short_video", label: "Short performance or backstage video", note: "One clip from a show, or from the hour before it." },
  { key: "end_of_run_record", label: "End-of-run placement record", note: "The record Door Money sends every patron when the fundraiser ends." },
  { key: OTHER_KEY, label: "Another verification method", note: "Something else, in the musician's own words." },
] as const;

const KEYS = new Set(VERIFICATION_METHODS.map((m) => m.key));

export function isVerificationKey(key: string): boolean {
  return KEYS.has(key);
}

export function methodLabel(key: string): string | null {
  return VERIFICATION_METHODS.find((m) => m.key === key)?.label ?? null;
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
export function verificationItems(choice: Partial<VerificationChoice> | null | undefined): VerificationItem[] {
  const selected = new Set(choice?.methods ?? []);
  const other = choice?.other?.trim() || null;
  const items: VerificationItem[] = [];
  for (const m of VERIFICATION_METHODS) {
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

export function hasVerification(choice: Partial<VerificationChoice> | null | undefined): boolean {
  return verificationItems(choice).length > 0;
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
