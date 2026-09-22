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
import { formatDay } from "@/lib/dates";
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

/**
 * What the sponsor hands over.
 *
 * Six kinds that cover a printed panel, a screen credit, a spoken line, a product on a table, a post
 * and a menu, because what a sponsor supplies is decided by the placement and not by the category.
 * `none` is an offer that needs nothing from them, which is most spoken mentions.
 */
export const SPONSOR_MATERIAL_TYPES = [
  { key: "artwork", label: "Artwork or a logo file" },
  { key: "wording", label: "Wording, as it should read or be said" },
  { key: "product", label: "A product or physical item" },
  { key: "digital", label: "A link, handle or digital file" },
  { key: "other", label: "Something else, described below" },
  { key: "none", label: "Nothing" },
] as const;
export type SponsorMaterialType = (typeof SPONSOR_MATERIAL_TYPES)[number]["key"];

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

/**
 * What happens when the sponsor's materials never arrive.
 *
 * Stated, never chosen. This is what the code does today and all it does: the money stays held,
 * visibly, and no Friday moves it (docs/DELIVERY_POLICY_MATRIX.md, and decision 16, which is the
 * owner's and is open). An organizer who could pick "we keep it" or "they get it back" would be
 * promising an answer nobody has settled, so the editor shows the sentence and offers no choice.
 */
export const LATE_MATERIALS_CONSEQUENCE = "If the sponsor never sends what this offer needs, Door Money keeps holding the money and writes to both sides. Nothing is released and nothing is refunded automatically.";

/**
 * Who may see the documentation of one deliverable.
 *
 * Both are what the delivery side already does (migration 0045). Evidence is private by default,
 * item by item; publishing one is the organizer's own separate act afterwards, and the database
 * refuses it outright for an item showing a minor or anything from a youth team. So the second
 * choice is an intention, worded as one, and never a guarantee that anything will be published.
 */
export const EVIDENCE_VISIBILITIES = [
  { key: "private", label: "Private to the sponsor" },
  { key: "may_publish", label: "Private, and the organizer may publish it" },
] as const;
export type EvidenceVisibilityChoice = (typeof EVIDENCE_VISIBILITIES)[number]["key"];

// ---------------------------------------------------------------
// The sections
// ---------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const count = (max: number) => z.preprocess(
  (v) => (v === "" || v === undefined ? null : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v),
  z.number().int().min(1).max(max).nullable(),
);
/** Whole dollars in, integer cents out. Money is cents everywhere here (CLAUDE.md). */
const centsFromDollars = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return null;
    if (typeof v !== "string") return v;
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const dollars = Number(cleaned);
    return Number.isFinite(dollars) ? Math.round(dollars * 100) : cleaned;
  },
  z.number().int().min(0).max(10_000_000).nullable(),
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
  /** Which of the six kinds it is, where the organizer has said. Absent is not "none". */
  type: z.enum(SPONSOR_MATERIAL_TYPES.map((m) => m.key) as [SponsorMaterialType, ...SponsorMaterialType[]]).nullish().transform((v) => v ?? null),
  /** What it is, in the organizer's words: the exact file, the exact wording, the exact item. */
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
  /** True where making the placement costs the sponsor nothing beyond the price of the sponsorship. */
  included: z.boolean().default(false),
  /**
   * What producing it costs, in integer cents, where the organizer has put a number on it.
   *
   * Door Money never charges it and never moves it: the sponsorship price is the only money that
   * passes through here. A cost the sponsor pays is settled between the two of them, the same way
   * anything supplied in kind is, and the editor and the summary both say so.
   */
  cost_cents: centsFromDollars,
  who_pays: z.enum(PRODUCTION_PAYERS.map((p) => p.key) as [ProductionPayer, ...ProductionPayer[]]).nullish().transform((v) => v ?? null),
  /** What the cost covers and anything shared about it. */
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

/** How large one stored offer may be. The same number as the column's own check (migration 0056). */
export const OFFER_TERMS_MAX_BYTES = 32768;

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
  /** Who the documentation is for. Private unless the organizer says they may publish it later. */
  evidence_visibility: z.enum(EVIDENCE_VISIBILITIES.map((v) => v.key) as [EvidenceVisibilityChoice, ...EvidenceVisibilityChoice[]]).nullish().transform((v) => v ?? null),
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

/**
 * The sections a sponsor may be shown, and nothing else.
 *
 * The twin of `public.sponsor_facing_offer_terms` (migration 0056), named one at a time for the same
 * reason: publishing something new is a deliberate act, in both places, and a section added to the
 * shape and not to these two lists reaches nobody. Every reader who is not the organizer goes
 * through here, which is also what makes the organizer's own preview honest: it is the sponsor's
 * view of the document, not a second rendering of the form.
 */
export const PUBLIC_OFFER_SECTIONS = [
  "sponsor_materials", "placement", "appearances", "delivery_window", "audience",
  "production", "exclusivity", "approval", "deliverables", "cancellation", "refund",
] as const;

export function publicOfferTerms(terms: OfferTerms): OfferTerms {
  const out: Record<string, unknown> = {};
  for (const section of PUBLIC_OFFER_SECTIONS) {
    const value = terms[section];
    if (value !== undefined && value !== null) out[section] = value;
  }
  return Object.keys(out).length ? ({ version: terms.version ?? OFFER_TERMS_VERSION, ...out } as OfferTerms) : EMPTY_OFFER_TERMS;
}

// ---------------------------------------------------------------
// What the product contract asks for before a purchase
// ---------------------------------------------------------------

export type OfferRequirement = { key: string; label: string; met: boolean };

/**
 * What docs/PRODUCT_CONTRACT.md, "Offer requirements for Phases 3 and 4", asks an offer to state
 * before somebody can buy it, checked against what the organizer has written.
 *
 * Advisory, and deliberately so. It is shown in the editor so an organizer can see what is still
 * missing, and it refuses nothing: a fundraiser published before any of this existed has none of it,
 * and the compatibility contract says those offers are not made to invent terms they never had.
 * Blocking a save would also stop a music organizer changing a price on a sponsorship that is live
 * and paid for, which is the behavior every rule here says to preserve.
 *
 * Cancellation and refunds are not on the list: the category's delivery policy supplies them, so
 * they are never an organizer's to leave out.
 */
export function offerTermsRequirements(
  terms: OfferTerms,
  lot: { reach_estimate?: number | null; reach_basis?: string | null } = {},
): OfferRequirement[] {
  const t = terms;
  const has = (v: unknown) => v !== null && v !== undefined && v !== "";
  const deliverables = t.deliverables ?? [];
  return [
    { key: "placement", label: "Where it appears, and in what form", met: has(t.placement?.description) && has(t.placement?.format) },
    { key: "appearances", label: "How many appearances, or the schedule", met: has(t.appearances?.quantity) || has(t.appearances?.schedule) },
    { key: "delivery_window", label: "When it is delivered by", met: has(t.delivery_window?.ends_on) || has(t.delivery_window?.deadline_on) },
    { key: "audience", label: "Who it reaches", met: has(t.audience?.description) },
    // A number with no basis is a claim. The lot columns already refuse the pair any other way, so
    // this only has to notice the number that was given without one.
    { key: "reach_basis", label: "Where any reach estimate comes from", met: !has(lot.reach_estimate) || has(lot.reach_basis) },
    { key: "production", label: "Who pays to produce it", met: t.production?.included === true || has(t.production?.who_pays) },
    { key: "exclusivity", label: "What exclusivity covers, where it is exclusive", met: !t.exclusivity?.exclusive || has(t.exclusivity?.scope) },
    { key: "sponsor_materials", label: "What the sponsor provides", met: has(t.sponsor_materials?.type) || has(t.sponsor_materials?.description) },
    { key: "approval", label: "Who accepts what the sponsor sends", met: t.sponsor_materials?.type === "none" || has(t.approval?.rule) },
    { key: "deliverables", label: "At least one deliverable", met: deliverables.length > 0 },
    { key: "evidence", label: "How each deliverable is documented", met: deliverables.length > 0 && deliverables.every((d) => has(d.evidence_method)) },
  ];
}

/** The ones still missing. Empty means the offer states everything the contract asks for. */
export function missingOfferRequirements(terms: OfferTerms, lot?: { reach_estimate?: number | null; reach_basis?: string | null }): OfferRequirement[] {
  return offerTermsRequirements(terms, lot).filter((r) => !r.met);
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
  // The same cap the column carries (migration 0056), asked here so the organizer hears it in words
  // rather than meeting a constraint. Twice the longest offer the editor can produce.
  if (JSON.stringify(terms).length > OFFER_TERMS_MAX_BYTES) {
    return { ok: false, error: "These offer terms are longer than one offer can hold. Shorten the descriptions, or offer fewer deliverables." };
  }
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
  const production = terms.production;
  if (production?.included && production.who_pays === "sponsor") {
    return "Production cannot be included in the price and paid for by the sponsor at the same time.";
  }
  if (production?.cost_cents !== null && production?.cost_cents !== undefined && !production.included && !production.who_pays) {
    return "Say who pays the production cost, or leave the amount out.";
  }
  if (terms.sponsor_materials?.type === "none" && terms.sponsor_materials.description) {
    return "This offer says the sponsor sends nothing, so leave the description of what they send blank.";
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
 * One option's offer terms as a form holds them: strings and checkboxes, nothing parsed.
 *
 * The editor keeps this in React state so the live preview and the readiness list can be built from
 * what is on the screen rather than from what was last saved. The server never sees it. What the
 * server sees is the same fields posted by name, read back into this same shape by `draftFromForm`,
 * so there is one builder of the stored document and two ways into it. That is what stops the
 * browser's idea of the terms and the server's idea of them drifting apart.
 */
export type OfferDeliverableDraft = {
  title: string; quantity: string; dueOn: string; description: string;
  evidenceMethod: string; evidenceVisibility: string;
};

export type OfferTermsDraft = {
  materialType: string; materials: string; materialsDays: string;
  placement: string; format: string; appearance: string;
  quantity: string; unit: string; schedule: string;
  windowStart: string; windowEnd: string; timezone: string; deadline: string;
  audience: string;
  productionIncluded: boolean; productionCost: string; productionPayer: string; productionNote: string;
  exclusive: boolean; exclusiveScope: string; exclusiveNote: string;
  approvalRule: string; approvalDays: string; approvalNote: string;
  deliverables: OfferDeliverableDraft[];
  cancellationNote: string; refundNote: string;
};

/**
 * The field names one template's offer terms are posted under.
 *
 * Suffixed with the template key, the way `on_`, `price_` and `reach_` already are, so one form
 * carries every option on a fundraiser and the save action reads each by the key it already has.
 * A field naming a template the fundraiser may not offer is never looked up, so it can never become
 * a term: the form is not what decides which options exist (migration 0044).
 */
export const OFFER_TERMS_FIELDS = {
  materialType: "materialtype", materials: "materials", materialsDays: "materialsdays",
  placement: "placement", format: "format", appearance: "appearance",
  quantity: "appearances", unit: "unit", schedule: "schedule",
  windowStart: "windowstart", windowEnd: "windowend", timezone: "zone", deadline: "deadline",
  audience: "audience",
  productionIncluded: "productionincluded", productionCost: "productioncost",
  productionPayer: "production", productionNote: "productionnote",
  exclusive: "exclusive", exclusiveScope: "exclusivescope", exclusiveNote: "exclusivenote",
  approvalRule: "approval", approvalDays: "approvaldays", approvalNote: "approvalnote",
  cancellationNote: "cancelnote", refundNote: "refundnote",
} as const;

/** One deliverable's fields, numbered from 1. */
export type DeliverablePart = "title" | "qty" | "due" | "note" | "evidence" | "visibility";
export function deliverableField(part: DeliverablePart, index: number, key: string): string {
  return `deliv${index + 1}${part}_${key}`;
}

/** How many deliverable rows the builder starts with. The parser reads up to DELIVERABLE_LIMIT. */
export const DELIVERABLE_ROWS = 2;

export const EMPTY_DELIVERABLE_DRAFT: OfferDeliverableDraft = {
  title: "", quantity: "", dueOn: "", description: "", evidenceMethod: "", evidenceVisibility: "",
};

export const EMPTY_OFFER_TERMS_DRAFT: OfferTermsDraft = {
  materialType: "", materials: "", materialsDays: "",
  placement: "", format: "", appearance: "",
  quantity: "", unit: "", schedule: "",
  windowStart: "", windowEnd: "", timezone: "", deadline: "",
  audience: "",
  productionIncluded: false, productionCost: "", productionPayer: "", productionNote: "",
  exclusive: false, exclusiveScope: "", exclusiveNote: "",
  approvalRule: "", approvalDays: "", approvalNote: "",
  deliverables: [],
  cancellationNote: "", refundNote: "",
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
/** Dollars, as a box should show them: whole where they are whole, two places where they are not. */
const dollarsFromCents = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0);

/** A stored document, opened back up into the form that wrote it. */
export function draftFromTerms(terms: OfferTerms): OfferTermsDraft {
  const t = terms;
  return {
    materialType: str(t.sponsor_materials?.type),
    materials: str(t.sponsor_materials?.description),
    materialsDays: str(t.sponsor_materials?.due_days_after_purchase),
    placement: str(t.placement?.description),
    format: str(t.placement?.format),
    appearance: str(t.placement?.appearance),
    quantity: str(t.appearances?.quantity),
    unit: str(t.appearances?.unit),
    schedule: str(t.appearances?.schedule),
    windowStart: str(t.delivery_window?.starts_on),
    windowEnd: str(t.delivery_window?.ends_on),
    timezone: str(t.delivery_window?.timezone),
    deadline: str(t.delivery_window?.deadline_on),
    audience: str(t.audience?.description),
    productionIncluded: t.production?.included === true,
    productionCost: dollarsFromCents(t.production?.cost_cents),
    productionPayer: str(t.production?.who_pays),
    productionNote: str(t.production?.description),
    exclusive: t.exclusivity?.exclusive === true,
    exclusiveScope: str(t.exclusivity?.scope),
    exclusiveNote: str(t.exclusivity?.description),
    approvalRule: str(t.approval?.rule),
    approvalDays: str(t.approval?.deadline_days_after_materials),
    approvalNote: str(t.approval?.description),
    deliverables: (t.deliverables ?? []).map((d) => ({
      title: str(d.title), quantity: str(d.quantity), dueOn: str(d.due_on), description: str(d.description),
      evidenceMethod: str(d.evidence_method), evidenceVisibility: str(d.evidence_visibility),
    })),
    cancellationNote: str(t.cancellation?.note),
    refundNote: str(t.refund?.note),
  };
}

/**
 * The draft as the document it describes, ready for `parseOfferTerms`.
 *
 * Shape only. Nothing here trims, defaults or invents a value: zod and `prune` decide what is valid
 * and what was left blank, so a field the organizer never filled in stays absent rather than
 * becoming an empty promise.
 */
export function termsFromDraft(draft: OfferTermsDraft): unknown {
  const d = draft;
  const blank = (v: string) => (v.trim() ? v : undefined);
  return {
    sponsor_materials: { type: blank(d.materialType), description: d.materials, due_days_after_purchase: d.materialsDays },
    placement: { description: d.placement, format: d.format, appearance: d.appearance },
    appearances: { quantity: d.quantity, unit: d.unit, schedule: d.schedule },
    delivery_window: { starts_on: d.windowStart, ends_on: d.windowEnd, timezone: d.timezone, deadline_on: d.deadline },
    audience: { description: d.audience },
    production: {
      included: d.productionIncluded, cost_cents: d.productionCost,
      who_pays: blank(d.productionPayer), description: d.productionNote,
    },
    exclusivity: { exclusive: d.exclusive, scope: d.exclusiveScope, description: d.exclusiveNote },
    approval: { rule: blank(d.approvalRule), deadline_days_after_materials: d.approvalDays, description: d.approvalNote },
    // A line with nothing owed on it is a line nobody filled in. Its other fields go with it: a due
    // date with nothing due is not a deliverable.
    deliverables: d.deliverables
      .filter((x) => x.title.trim())
      .slice(0, DELIVERABLE_LIMIT)
      .map((x) => ({
        title: x.title, quantity: x.quantity, due_on: x.dueOn, description: x.description,
        evidence_method: blank(x.evidenceMethod), evidence_visibility: blank(x.evidenceVisibility),
      })),
    // The rule is not the organizer's to choose, so it is not read from the form. A note is words
    // beside a policy the note cannot change, and an offer with no note has no section at all.
    cancellation: d.cancellationNote.trim() ? { rule: "policy", note: d.cancellationNote } : undefined,
    refund: d.refundNote.trim() ? { rule: "policy", note: d.refundNote } : undefined,
  };
}

type Fields = { get(name: string): FormDataEntryValue | null };

/** One template's fields, as the browser posted them, back in the shape the editor holds. */
export function draftFromForm(form: Fields, key: string): OfferTermsDraft {
  const raw = (name: string) => {
    const value = form.get(`${name}_${key}`);
    return typeof value === "string" ? value : "";
  };
  const f = OFFER_TERMS_FIELDS;

  const deliverables: OfferDeliverableDraft[] = [];
  for (let i = 0; i < DELIVERABLE_LIMIT; i += 1) {
    const part = (p: DeliverablePart) => {
      const v = form.get(deliverableField(p, i, key));
      return typeof v === "string" ? v : "";
    };
    deliverables.push({
      title: part("title"), quantity: part("qty"), dueOn: part("due"), description: part("note"),
      evidenceMethod: part("evidence"), evidenceVisibility: part("visibility"),
    });
  }

  return {
    materialType: raw(f.materialType), materials: raw(f.materials), materialsDays: raw(f.materialsDays),
    placement: raw(f.placement), format: raw(f.format), appearance: raw(f.appearance),
    quantity: raw(f.quantity), unit: raw(f.unit), schedule: raw(f.schedule),
    windowStart: raw(f.windowStart), windowEnd: raw(f.windowEnd), timezone: raw(f.timezone), deadline: raw(f.deadline),
    audience: raw(f.audience),
    productionIncluded: form.get(`${f.productionIncluded}_${key}`) === "1",
    productionCost: raw(f.productionCost), productionPayer: raw(f.productionPayer), productionNote: raw(f.productionNote),
    exclusive: form.get(`${f.exclusive}_${key}`) === "1",
    exclusiveScope: raw(f.exclusiveScope), exclusiveNote: raw(f.exclusiveNote),
    approvalRule: raw(f.approvalRule), approvalDays: raw(f.approvalDays), approvalNote: raw(f.approvalNote),
    deliverables,
    cancellationNote: raw(f.cancellationNote), refundNote: raw(f.refundNote),
  };
}

/** One template's offer terms, as the browser posted them. The server's only way in. */
export function offerTermsFromForm(form: Fields, key: string): unknown {
  return termsFromDraft(draftFromForm(form, key));
}

// ---------------------------------------------------------------
// The terms a sponsor actually read
// ---------------------------------------------------------------

/**
 * A short fingerprint of what a sponsor was shown, so they cannot pay for something else.
 *
 * A lot's terms are only frozen once somebody has bid on it or paid for it (migration 0035, widened
 * in 0056). Until then the organizer may still edit them, and a sponsor with the page open could
 * press the button a minute after the offer changed underneath them.
 *
 * So the page carries this, the checkout posts it back, and the route computes it again from the
 * lot it just read. They have to match. The browser's copy is never read as content and never
 * reaches a column: it is one opaque string, and the only thing it can do is stop a purchase.
 *
 * Deliberately not a cryptographic hash. Nothing is being authenticated, both sides compute it
 * from the same server-held row, and a pure function keeps this module importable from a client
 * component the way the rest of it is.
 */
export function offerTermsFingerprint(terms: OfferTerms, priceCents: number): string {
  const canonical = `${priceCents}:${stableJson(publicOfferTerms(terms))}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i += 1) {
    const c = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

/** JSON with the keys in a settled order, so two equal documents never fingerprint differently. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

/**
 * The offer terms out of a purchase snapshot, which is the only place a purchased sponsorship's
 * terms may be read from. Never the live lot: what was bought is what was bought.
 *
 * Empty for every purchase made before migration 0056, and for every music purchase, which is not a
 * gap to fill. The page that draws it says so in its own words instead.
 */
export function offerTermsOfSnapshot(snapshot: unknown): OfferTerms {
  const opportunity = (snapshot as { opportunity?: { offer_terms?: unknown; exclusive?: boolean } } | null)?.opportunity;
  if (!opportunity) return EMPTY_OFFER_TERMS;
  return offerTermsOf({ offer_terms: opportunity.offer_terms, exclusive: opportunity.exclusive });
}

/**
 * What one deliverable's evidence was promised to be, by its position on the purchase.
 *
 * `deliverables` rows are written from the snapshot in order (migration 0057), so position n is the
 * nth promise in the document. Null where the offer named no method, which the pages draw as "the
 * organizer has not said" rather than inventing one.
 */
export function promisedEvidence(terms: OfferTerms, position: number): { method: string | null; visibility: string } | null {
  const promise = (terms.deliverables ?? [])[position - 1];
  if (!promise) return null;
  return { method: promise.evidence_method ?? null, visibility: promise.evidence_visibility ?? "private" };
}

/**
 * The four or five things worth putting on a card, so an offer can be judged without opening it.
 *
 * Short, factual, and only what the organizer actually wrote: a missing one is absent rather than
 * softened into "not specified". An offer nobody has written terms for returns nothing at all, and
 * the card then reads exactly as it did before any of this existed.
 *
 * Not a summary of the offer. The whole document is a click away, and this only says which of it
 * exists, so nothing here can promise more than the terms underneath do.
 */
export function offerHighlights(terms: OfferTermsView): string[] {
  const t = publicOfferTerms(terms) as OfferTermsView;
  const out: string[] = [];
  const a = t.appearances;
  if (a?.quantity !== null && a?.quantity !== undefined) {
    out.push(a.quantity === 1 ? "1 appearance" : `${a.quantity.toLocaleString("en-US")} appearances`);
  }
  const w = t.delivery_window;
  if (w?.starts_on && w.ends_on) out.push(`${formatDay(w.starts_on)} to ${formatDay(w.ends_on)}`);
  else if (w?.deadline_on) out.push(`By ${formatDay(w.deadline_on)}`);
  if (t.exclusivity?.exclusive) out.push("Exclusive");
  const reach = terms.audience_reach;
  if (reach) out.push(`About ${reach.estimate.toLocaleString("en-US")} people`);
  const owed = t.deliverables?.length ?? 0;
  if (owed) out.push(owed === 1 ? "1 deliverable" : `${owed} deliverables`);
  if (t.production?.included) out.push("Production included");
  return out.slice(0, 5);
}
