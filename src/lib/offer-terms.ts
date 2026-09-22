/**
 * The offer contract: everything a sponsor has to know before they pay.
 *
 * A `lots` row has always carried the commercial terms (price, sale method, how many spots) and
 * nothing about what the sponsor actually receives. The product contract asks for more than that
 * before a purchase: the placement and its format, how many appearances and when, who the audience
 * is, who pays for production, what exclusivity means here, what the sponsor has to send and by
 * when, what the organizer owes, how each of those will be documented, and what happens if it is
 * called off. That is this document, stored in `lots.offer_terms` (migration 0056).
 *
 * Four rules hold it together:
 *
 *   Category-neutral.  Nothing here names music, a logo, a tour or a Friday. A term that is true
 *                      of a jersey, a program credit, a dinner and a kick drum head, or it is not
 *                      in this file. What a category calls things comes from src/lib/categories.ts
 *                      and src/lib/category-words.ts, the way it does everywhere else.
 *   Additive.          An empty document is a valid offer. Every existing music lot has one and
 *                      nothing about it changes: no section is required, no section is invented,
 *                      and `{}` reads as "the organizer has not said", never as an error.
 *   Sponsor-facing.    Every section is something a sponsor is buying. Workflow state (delivery,
 *                      evidence, materials, payouts) lives in its own tables and never here, so
 *                      the whole document can be shown to the person considering the purchase.
 *   The organizer's.   Door Money suggests structure. The commitments are the organizer's own
 *                      words, and this file never fills one in for them (voice rule 6).
 *
 * Pure: nothing here reads the database, Stripe or a session. The server decides what is stored
 * (src/app/actions/lots.ts) and the database keeps its own copy of the shape (migration 0056).
 */
import { z } from "zod";
import { EVIDENCE_KINDS } from "@/lib/delivery-policy";

/**
 * The shape this document was written in.
 *
 * It is on the document rather than implied, because a purchase snapshot is immutable: a reader in
 * two years has to know which shape the copy it is holding was written in without being able to
 * migrate it. Version 1 is everything below. An empty document carries no version, because nothing
 * was written in any shape.
 */
export const OFFER_TERMS_VERSION = 1;

// ---------------------------------------------------------------
// The closed choices
// ---------------------------------------------------------------

/** Who pays for making the placement exist: printing it, building it, producing it. */
export const PRODUCTION_PAYERS = [
  { key: "organizer", label: "The organizer pays" },
  { key: "sponsor", label: "The sponsor pays" },
  { key: "shared", label: "Shared, as described below" },
] as const;
export type ProductionPayer = (typeof PRODUCTION_PAYERS)[number]["key"];

/**
 * How the sponsor's materials are handled once they arrive.
 *
 * `approval` is the gate that already exists: `purchases.mark_status`, one accept-or-decline by the
 * organizer, whatever the materials are (migration 0031, and the delivery policy matrix). `none` is
 * an offer that needs nothing from the sponsor at all, which is most spoken mentions.
 */
export const APPROVAL_RULES = [
  { key: "approval", label: "The organizer accepts or declines what the sponsor sends" },
  { key: "none", label: "Nothing is needed from the sponsor" },
] as const;
export type ApprovalRule = (typeof APPROVAL_RULES)[number]["key"];

/**
 * What happens to the money if the sponsorship is called off, and what happens to it if delivery
 * does not follow.
 *
 * One choice, on purpose. Door Money's cancellation and refund behavior is the delivery policy for
 * the fundraiser's category at the version the purchase was made under (`delivery_policies`,
 * migration 0045, and docs/DELIVERY_POLICY_MATRIX.md): the organizer cancelling refunds every
 * unreleased share with the fee on it, and nothing else is offered yet. An organizer cannot promise
 * a different one here, because no code would honor it, and a term nobody honors is worse than no
 * term. The list is a list so that a rule the backend does learn to honor can join it without
 * changing a stored document.
 */
export const CANCELLATION_RULES = [{ key: "policy", label: "Door Money's policy for this category decides" }] as const;
export type CancellationRule = (typeof CANCELLATION_RULES)[number]["key"];

export const REFUND_RULES = [{ key: "policy", label: "Door Money's policy for this category decides" }] as const;
export type RefundRule = (typeof REFUND_RULES)[number]["key"];

/**
 * The one sentence that has to sit beside an organizer's cancellation or refund note wherever it is
 * shown. The note explains; the policy decides. Nothing reads the note to work out what to pay.
 */
export const DISPLAY_ONLY_NOTE = "Door Money's policy for this category decides what happens to the money. This note explains the organizer's side of it and changes nothing.";

// ---------------------------------------------------------------
// The sections
// ---------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const count = (max: number) => z.preprocess(
  (v) => (v === "" || v === undefined ? null : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v),
  z.number().int().min(1).max(max).nullable(),
);
const dateOnly = text(10).refine(
  (v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v),
  "Enter a valid calendar date.",
);
/** An IANA zone name, checked the way a fundraiser's own is (src/lib/fundraiser-drafts.ts). */
const zone = text(100).refine((v) => {
  if (!v) return true;
  try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; }
}, "Choose a valid time zone.");

const SponsorMaterials = z.object({
  /** What the sponsor has to hand over: artwork, a credit line as it should read, a product, a name. */
  description: text(600),
  /** Counted from the moment the sponsor pays, which is the only clock both sides can see. */
  due_days_after_purchase: count(365),
}).strict();

const Placement = z.object({
  /** Where it appears. The organizer's own words: "above the door", "page two of the program". */
  description: text(600),
  /** How it is supplied and shown: a printed panel, a screen credit, a spoken line, a physical item. */
  format: text(200),
  /** Size, position, prominence. Only where it is a term of the offer rather than a detail. */
  appearance: text(200),
}).strict();

const Appearances = z.object({
  /** How many times it appears. Absent means the organizer has not counted it, never zero. */
  quantity: count(100_000),
  /** What one of them is: a night, a screening, a service, a post, a fixture, a printed copy. */
  unit: text(60),
  /** When they fall, where that is not a plain count: "every home fixture", "the first four nights". */
  schedule: text(400),
}).strict();

const DeliveryWindow = z.object({
  starts_on: dateOnly,
  ends_on: dateOnly,
  /** The zone the dates are read in. A deadline with no zone is a different deadline in two cities. */
  timezone: zone,
  /** The last day everything on this offer is delivered by. Distinct from the window's end. */
  deadline_on: dateOnly,
}).strict();

/**
 * Who this reaches.
 *
 * Description only. The number and its basis are `lots.reach_estimate` and `lots.reach_basis`
 * (migration 0053), which discovery filters and sorts on and which the database refuses to store
 * apart from each other. Copying them here would be a second answer to one question, and the one
 * that a filter does not read is the one that would go stale. `offerTermsView` puts them back
 * together for a reader.
 */
const Audience = z.object({ description: text(1000) }).strict();

const Production = z.object({
  who_pays: z.enum(PRODUCTION_PAYERS.map((p) => p.key) as [ProductionPayer, ...ProductionPayer[]]).nullish().transform((v) => v ?? null),
  /** What the cost covers and anything shared about it. Door Money moves the sponsorship price and nothing else. */
  description: text(600),
}).strict();

const Exclusivity = z.object({
  /** Whether anything at all is exclusive here. Mirrored into `lots.exclusive`, which predates this. */
  exclusive: z.boolean().default(false),
  /** What the exclusivity covers: a category of business, a placement, the whole fundraiser. */
  scope: text(200),
  description: text(600),
}).strict();

const Approval = z.object({
  rule: z.enum(APPROVAL_RULES.map((r) => r.key) as [ApprovalRule, ...ApprovalRule[]]).nullish().transform((v) => v ?? null),
  /** Counted from the day the materials arrive. The organizer's own window to answer. */
  deadline_days_after_materials: count(90),
  description: text(600),
}).strict();

/** How many deliverables one offer may carry. A limit the form, the parser and the database share. */
export const DELIVERABLE_LIMIT = 12;

const Deliverable = z.object({
  /** What is owed. The one field a deliverable cannot be without. */
  title: z.string().trim().min(1).max(200),
  quantity: count(10_000),
  due_on: dateOnly,
  description: text(600),
  /**
   * How this one is documented, from the kinds the evidence table already stores
   * (src/lib/delivery-policy.ts, migration 0045), so a commitment made here is a commitment the
   * delivery side can accept. Absent means the organizer has not chosen one yet.
   */
  evidence_method: z.enum(EVIDENCE_KINDS).nullish().transform((v) => v ?? null),
}).strict();

const Cancellation = z.object({
  rule: z.enum(CANCELLATION_RULES.map((r) => r.key) as [CancellationRule, ...CancellationRule[]]).default("policy"),
  /** Display only. Read by people, never by code deciding what to pay. */
  note: text(600),
}).strict();

const Refund = z.object({
  rule: z.enum(REFUND_RULES.map((r) => r.key) as [RefundRule, ...RefundRule[]]).default("policy"),
  /** Display only, as above. */
  note: text(600),
}).strict();

/** The stored document. Every section optional, because an offer with none of them is still an offer. */
export const OfferTermsInput = z.object({
  version: z.literal(OFFER_TERMS_VERSION).optional(),
  sponsor_materials: SponsorMaterials.optional(),
  placement: Placement.optional(),
  appearances: Appearances.optional(),
  delivery_window: DeliveryWindow.optional(),
  audience: Audience.optional(),
  production: Production.optional(),
  exclusivity: Exclusivity.optional(),
  approval: Approval.optional(),
  deliverables: z.array(Deliverable).max(DELIVERABLE_LIMIT).optional(),
  cancellation: Cancellation.optional(),
  refund: Refund.optional(),
}).strict();

export type OfferTerms = z.output<typeof OfferTermsInput>;
export type OfferDeliverable = NonNullable<OfferTerms["deliverables"]>[number];

// ---------------------------------------------------------------
// Reading what is stored
// ---------------------------------------------------------------

/** The canonical empty document: an organizer who has said nothing. Never null, never undefined. */
export const EMPTY_OFFER_TERMS: OfferTerms = {};

export function isEmptyOfferTerms(terms: OfferTerms | null | undefined): boolean {
  if (!terms) return true;
  return Object.entries(terms).every(([key, value]) => key === "version" || value === undefined);
}

/**
 * The document in the column, and nothing added to it.
 *
 * Three things can be there and all three are legitimate: a document, `{}`, and nothing at all on a
 * row written before migration 0056. All three read as the same empty document, so a music lot from
 * 2026 needs no backfill and no invented terms to be readable here. A document written in a shape
 * this build does not know reads as empty too, rather than throwing at whoever loaded the row.
 *
 * This is what a save compares against, because it is what a save would overwrite.
 */
export function storedOfferTerms(row: { offer_terms?: unknown } | null | undefined): OfferTerms {
  const parsed = OfferTermsInput.safeParse(row?.offer_terms ?? {});
  return parsed.success ? parsed.data : EMPTY_OFFER_TERMS;
}

/**
 * What one lot's offer terms are, for anybody reading them.
 *
 * `lots.exclusive` has existed since migration 0001 and no code has ever set it. It is still the
 * column the public grants expose and the one the freeze trigger watches, so it is the answer where
 * the document has no exclusivity section: the boolean is the legacy half of the same fact. A lot
 * whose boolean was set by hand reads as exclusive here, with nothing invented about its scope, and
 * every save writes the two together so they cannot drift apart again.
 */
export function offerTermsOf(row: { offer_terms?: unknown; exclusive?: boolean | null } | null | undefined): OfferTerms {
  const terms = storedOfferTerms(row);
  if (terms.exclusivity || !row?.exclusive) return terms;
  return { ...terms, exclusivity: { exclusive: true, scope: null, description: null } };
}

/** Whether this offer is exclusive, whichever of the two places said so. */
export function isExclusive(terms: OfferTerms): boolean {
  return terms.exclusivity?.exclusive === true;
}

/**
 * What a reader is shown: the document, with the reach estimate put back beside the audience it
 * describes. The estimate and its basis stay in their own columns, which is where discovery reads
 * them; this only ever joins the two for one page.
 */
export type OfferTermsView = OfferTerms & { audience_reach?: { estimate: number; basis: string } };

export function offerTermsView(terms: OfferTerms, lot: { reach_estimate?: number | null; reach_basis?: string | null }): OfferTermsView {
  if (lot.reach_estimate === null || lot.reach_estimate === undefined || !lot.reach_basis) return terms;
  return { ...terms, audience_reach: { estimate: lot.reach_estimate, basis: lot.reach_basis } };
}

// ---------------------------------------------------------------
// Writing
// ---------------------------------------------------------------

/**
 * Drops what the organizer left blank.
 *
 * A section with every field empty is not a section: it is a form the organizer scrolled past, and
 * storing it would make an empty offer look like a considered one. So an all-empty section is
 * dropped, an empty document normalizes to `{}`, and a document with anything in it carries its
 * version. That is what makes "no terms" a single value rather than eleven ways of writing it.
 *
 * Exclusivity is the one section with a field that is meaningfully false: an offer that says it is
 * not exclusive has said something. It survives only when it is exclusive or carries words.
 */
function prune(terms: OfferTerms): OfferTerms {
  const out: Record<string, unknown> = {};
  for (const [key, section] of Object.entries(terms)) {
    if (key === "version" || section === undefined || section === null) continue;
    if (Array.isArray(section)) {
      if (section.length) out[key] = section;
      continue;
    }
    if (typeof section !== "object") continue;
    const entries = Object.entries(section as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== false);
    if (entries.length) out[key] = section;
  }
  return Object.keys(out).length ? ({ version: OFFER_TERMS_VERSION, ...out } as OfferTerms) : EMPTY_OFFER_TERMS;
}

export type OfferTermsResult = { ok: true; terms: OfferTerms } | { ok: false; error: string };

/**
 * Validates and normalizes one submitted document.
 *
 * Everything the browser sends goes through here before it reaches a column, and the result is what
 * is stored: zod's `.strict()` means a key nobody wrote a field for is refused rather than carried
 * along, which is what keeps a workflow field from being smuggled into a sponsor-facing document.
 */
export function parseOfferTerms(value: unknown): OfferTermsResult {
  const parsed = OfferTermsInput.safeParse(value ?? {});
  if (!parsed.success) {
    // The refusals worth repeating are the ones written here: a bad date, a zone nobody has, a note
    // too long. Everything else is zod describing a shape, which is a fact about the form rather
    // than anything the organizer can act on, so it gets one plain sentence instead.
    const issue = parsed.error.issues.find((i) => i.code === "custom" || i.code === "too_big" || i.code === "too_small");
    return { ok: false, error: issue?.message ?? "Check the offer terms and try once more." };
  }
  const terms = prune(parsed.data);
  const problem = offerTermsProblem(terms);
  return problem ? { ok: false, error: problem } : { ok: true, terms };
}

/**
 * What cannot be stored, in words a person can act on. Null means it may.
 *
 * These are the promises that contradict themselves, not the ones that are merely incomplete. An
 * organizer part way through writing their offer keeps everything they have typed.
 */
export function offerTermsProblem(terms: OfferTerms): string | null {
  const window = terms.delivery_window;
  if (window?.starts_on && window.ends_on && window.ends_on < window.starts_on) {
    return "The delivery window cannot end before it starts.";
  }
  if (window?.deadline_on && window.starts_on && window.deadline_on < window.starts_on) {
    return "The delivery deadline cannot fall before the delivery window starts.";
  }
  if (terms.approval?.rule === "none" && terms.sponsor_materials?.description) {
    return "This offer asks the sponsor for materials, so say who accepts them.";
  }
  const exclusivity = terms.exclusivity;
  if (exclusivity && !exclusivity.exclusive && (exclusivity.scope || exclusivity.description)) {
    return "Say what the exclusivity covers only where the sponsorship is exclusive.";
  }
  for (const deliverable of terms.deliverables ?? []) {
    if (deliverable.due_on && window?.deadline_on && deliverable.due_on > window.deadline_on) {
      return `"${deliverable.title}" is due after the delivery deadline.`;
    }
  }
  return null;
}

/**
 * What goes in the column, or nothing at all.
 *
 * An empty document is stored as `{}`, which is the column's own default, so a lot that never had
 * terms and a lot whose terms were cleared are the same row rather than two shapes meaning one
 * thing.
 */
export function offerTermsColumn(terms: OfferTerms): OfferTerms {
  return isEmptyOfferTerms(terms) ? EMPTY_OFFER_TERMS : terms;
}

/** Whether two documents say the same thing, so a save can leave an untouched lot untouched. */
export function sameOfferTerms(a: OfferTerms | null | undefined, b: OfferTerms | null | undefined): boolean {
  return JSON.stringify(offerTermsColumn(a ?? EMPTY_OFFER_TERMS)) === JSON.stringify(offerTermsColumn(b ?? EMPTY_OFFER_TERMS));
}

// ---------------------------------------------------------------
// The form
// ---------------------------------------------------------------

/**
 * The field names one template's offer terms are posted under.
 *
 * Suffixed with the template key, the way `on_`, `price_` and `reach_` already are, so one form
 * carries every option on a fundraiser and the save action reads each by the key it already has.
 * A field naming a template the fundraiser may not offer is never looked up, so it can never become
 * a term: the form is not what decides which options exist (migration 0044).
 */
export const OFFER_TERMS_FIELDS = {
  materials: "materials", materialsDays: "materialsdays",
  placement: "placement", format: "format", appearance: "appearance",
  quantity: "appearances", unit: "unit", schedule: "schedule",
  windowStart: "windowstart", windowEnd: "windowend", timezone: "zone", deadline: "deadline",
  audience: "audience",
  productionPayer: "production", productionNote: "productionnote",
  exclusive: "exclusive", exclusiveScope: "exclusivescope", exclusiveNote: "exclusivenote",
  approvalRule: "approval", approvalDays: "approvaldays", approvalNote: "approvalnote",
  cancellationNote: "cancelnote", refundNote: "refundnote",
} as const;

/** One deliverable's four fields plus its evidence method, numbered from 1. */
export function deliverableField(part: "title" | "qty" | "due" | "note" | "evidence", index: number, key: string): string {
  return `deliv${index + 1}${part}_${key}`;
}

/** How many deliverable rows the builder draws. The parser reads up to DELIVERABLE_LIMIT. */
export const DELIVERABLE_ROWS = 3;

type Fields = { get(name: string): FormDataEntryValue | null };

/**
 * One template's offer terms, as the browser posted them.
 *
 * Shape only: this hands `parseOfferTerms` a plain object and lets zod and `prune` decide what is
 * valid and what was left blank. Nothing here trims, defaults or invents a value, so a field the
 * organizer never filled in stays absent rather than becoming an empty promise.
 */
export function offerTermsFromForm(form: Fields, key: string): unknown {
  const raw = (name: string) => {
    const value = form.get(`${name}_${key}`);
    return typeof value === "string" ? value : undefined;
  };
  const f = OFFER_TERMS_FIELDS;

  const deliverables: unknown[] = [];
  for (let i = 0; i < DELIVERABLE_LIMIT; i += 1) {
    const value = form.get(deliverableField("title", i, key));
    const title = typeof value === "string" ? value.trim() : "";
    // A row with no title is a row nobody filled in. Its other fields go with it: a due date with
    // nothing due is not a deliverable.
    if (!title) continue;
    const part = (p: "qty" | "due" | "note" | "evidence") => {
      const v = form.get(deliverableField(p, i, key));
      return typeof v === "string" ? v : undefined;
    };
    deliverables.push({ title, quantity: part("qty"), due_on: part("due"), description: part("note"), evidence_method: part("evidence") || undefined });
  }

  const exclusive = form.get(`${f.exclusive}_${key}`) === "1";
  const cancellationNote = raw(f.cancellationNote)?.trim();
  const refundNote = raw(f.refundNote)?.trim();

  return {
    sponsor_materials: { description: raw(f.materials), due_days_after_purchase: raw(f.materialsDays) },
    placement: { description: raw(f.placement), format: raw(f.format), appearance: raw(f.appearance) },
    appearances: { quantity: raw(f.quantity), unit: raw(f.unit), schedule: raw(f.schedule) },
    delivery_window: { starts_on: raw(f.windowStart), ends_on: raw(f.windowEnd), timezone: raw(f.timezone), deadline_on: raw(f.deadline) },
    audience: { description: raw(f.audience) },
    production: { who_pays: raw(f.productionPayer) || undefined, description: raw(f.productionNote) },
    exclusivity: { exclusive, scope: raw(f.exclusiveScope), description: raw(f.exclusiveNote) },
    approval: { rule: raw(f.approvalRule) || undefined, deadline_days_after_materials: raw(f.approvalDays), description: raw(f.approvalNote) },
    deliverables,
    // The rule is not the organizer's to choose, so it is not read from the form. A note is words
    // beside a policy the note cannot change, and an offer with no note has no section at all.
    cancellation: cancellationNote ? { rule: "policy", note: cancellationNote } : undefined,
    refund: refundNote ? { rule: "policy", note: refundNote } : undefined,
  };
}
