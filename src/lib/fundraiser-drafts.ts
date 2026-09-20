import { z } from "zod";

/** Category keys are supplied by the database registry, not a closed TypeScript enum. */
export type FundraiserCategory = { key: string; label: string; detail_keys: string[]; draft_enabled: boolean };
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const dateOnly = optionalText(10).refine((v) => {
  if (v === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}, "Enter a valid calendar date.");
const wholeNumber = (max: number) => z.preprocess(
  (v) => v === "" || v === undefined ? null : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v,
  z.number().int().min(0).max(max).nullable(),
);
export const LocationInput = z.object({
  city: optionalText(100), region: optionalText(100),
  country_code: optionalText(2).refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use a two-letter country code."),
}).strict();
const zone = optionalText(100).refine((v) => {
  if (!v) return true;
  try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; }
}, "Choose a valid time zone.");
const instant = optionalText(40).refine((v) => v === null ||
  (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) && dateOnly.safeParse(v.slice(0, 10)).success),
  "Include the time zone offset in the deadline.");

export const FundraiserDraftInput = z.object({
  id: z.uuid().optional(),
  category_key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  title: optionalText(60).transform((v) => v ?? ""),
  purpose: optionalText(1000), description: optionalText(10000), audience_description: optionalText(2000), sponsor_promise: optionalText(2000),
  goal_cents: wholeNumber(2_000_000_000),
  goal_currency: z.literal("USD").nullish().transform((v) => v ?? null),
  activity_mode: z.enum(["in_person", "online", "hybrid"]).nullish().transform((v) => v ?? null),
  activity_locations: z.array(LocationInput).max(50).default([]),
  timezone: zone,
  fundraising_starts_on: dateOnly, fundraising_ends_on: dateOnly,
  starts_on: dateOnly, ends_on: dateOnly,
  delivery_due_at: instant, bidding_closes_at: instant,
  kind: z.enum(["tour", "season", "residency"]).nullish().transform((v) => v ?? null),
  show_count: wholeNumber(400),
  expected_attendance: wholeNumber(10_000_000),
  category_details: z.record(z.string().max(40), z.string().trim().max(1000)).default({}),
}).strict().superRefine((value, ctx) => {
  for (const [start, end] of [["starts_on", "ends_on"], ["fundraising_starts_on", "fundraising_ends_on"]] as const) {
    if (value[start] && value[end] && value[end] < value[start]) ctx.addIssue({ code: "custom", path: [end], message: "The end cannot precede the start." });
  }
  if (value.bidding_closes_at && value.ends_on && new Date(value.bidding_closes_at).toISOString().slice(0, 10) > value.ends_on) ctx.addIssue({ code: "custom", path: ["bidding_closes_at"], message: "Bidding has to close by the last activity date." });
  if (value.goal_cents !== null && !value.goal_currency) ctx.addIssue({ code: "custom", path: ["goal_currency"], message: "Choose a currency for the goal." });
  if (value.category_key !== "music" && (value.kind !== null || value.show_count !== null)) ctx.addIssue({ code: "custom", path: ["kind"], message: "Music details belong only to music fundraisers." });
});

export type FundraiserDraft = z.output<typeof FundraiserDraftInput> & { id: string; slug: string; status: string };
export const DRAFT_COLUMNS = "id,slug,status,category_key,title,purpose,description,audience_description,sponsor_promise,goal_cents,goal_currency,activity_mode,activity_locations,timezone,fundraising_starts_on,fundraising_ends_on,starts_on,ends_on,delivery_due_at,bidding_closes_at,kind,show_count,expected_attendance,category_details";

export function categoryErrors(input: z.output<typeof FundraiserDraftInput>, categories: FundraiserCategory[]): string[] {
  const category = categories.find((c) => c.key === input.category_key && c.draft_enabled);
  if (!category) return ["Choose an available category."];
  return Object.keys(input.category_details).filter((key) => !category.detail_keys.includes(key)).map((key) => `This category does not use ${key}.`);
}
