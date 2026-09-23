import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  EVIDENCE_VISIBILITIES,
  PRODUCTION_PAYERS,
  SPONSOR_MATERIAL_TYPES,
  isEmptyOfferTerms,
  publicOfferTerms,
  type OfferTerms,
  type OfferTermsView,
} from "@/lib/offer-terms";
import type { PolicyStatement } from "@/lib/offer-policy";

/**
 * One sponsorship option's offer contract, as a sponsor reads it.
 *
 * The public-safe representation, and the only one: it runs its input through `publicOfferTerms`
 * before drawing anything, which is the twin of `public.sponsor_facing_offer_terms` (migration
 * 0056). The organizer's preview in the editor is this component, given the terms they are typing,
 * so what they are shown is the sponsor's view and not a second rendering of their own form.
 *
 * What is not known is not drawn. A missing section is absent, never a placeholder, never a dash,
 * and never a sentence saying the organizer has not decided. An offer with nothing written renders
 * nothing at all.
 *
 * Category-neutral. Every noun here is true of a printed panel, a screen credit, a spoken line, a
 * product on a table and a post, because the words come from the organizer and from the closed lists
 * in src/lib/offer-terms.ts, never from a literal about one kind of work.
 *
 * It claims nothing Door Money has checked. An estimate says it is an estimate and says what it
 * rests on; documentation is the organizer's and is described as theirs (voice rule 6).
 */
export function OfferSummary({
  terms,
  policy = [],
  heading = "What this sponsorship includes",
}: {
  terms: OfferTermsView;
  /** What the category's delivery policy decides. Shown last, as the terms nobody here chose. */
  policy?: readonly PolicyStatement[];
  heading?: string;
}) {
  const t = publicOfferTerms(terms) as OfferTermsView;
  const reach = terms.audience_reach;
  const empty = isEmptyOfferTerms(t) && !reach;
  if (empty && policy.length === 0) return null;

  const rows: { label: string; body: React.ReactNode }[] = [];
  const push = (label: string, body: React.ReactNode) => { if (body) rows.push({ label, body }); };

  push("What the sponsor provides", sentences([
    labelOf(SPONSOR_MATERIAL_TYPES, t.sponsor_materials?.type),
    t.sponsor_materials?.description,
  ]));
  push("Where it appears", sentences([t.placement?.description, t.placement?.format, t.placement?.appearance]));
  push("Number of appearances", sentences([appearanceLine(t), t.appearances?.schedule]));
  push("Delivery window", sentences([
    span(t.delivery_window?.starts_on, t.delivery_window?.ends_on),
    t.delivery_window?.deadline_on ? `Everything delivered by ${formatDay(t.delivery_window.deadline_on)}` : null,
    t.delivery_window?.timezone,
  ]));
  push("Audience and reach", sentences([
    t.audience?.description,
    reach ? `An estimated ${reach.estimate.toLocaleString("en-US")} people, based on ${lower(reach.basis)}. An estimate, not a promise.` : null,
  ]));
  push("Production costs", productionLine(t));
  push("Exclusivity", t.exclusivity?.exclusive
    ? sentences(["Exclusive", t.exclusivity.scope, t.exclusivity.description])
    : null);
  push("Sponsor materials and approval", sentences([
    t.sponsor_materials?.due_days_after_purchase
      ? `Materials due within ${days(t.sponsor_materials.due_days_after_purchase)} of payment`
      : null,
    approvalLine(t),
    t.approval?.description,
  ]));

  const deliverables = t.deliverables ?? [];
  if (deliverables.length) {
    rows.push({
      label: "Deliverables",
      body: (
        <ul className="grid gap-1">
          {deliverables.map((d, i) => (
            <li key={i}>
              {d.quantity ? `${d.quantity} × ` : ""}{d.title}
              {d.due_on ? `, due ${formatDay(d.due_on)}` : ""}
              {d.description ? `. ${d.description}` : ""}
            </li>
          ))}
        </ul>
      ),
    });
    const documented = deliverables.filter((d) => d.evidence_method);
    if (documented.length) {
      rows.push({
        label: "Evidence",
        body: (
          <ul className="grid gap-1">
            {documented.map((d, i) => (
              <li key={i}>
                {d.title}: {EVIDENCE_LABELS[d.evidence_method as keyof typeof EVIDENCE_LABELS]}.{" "}
                {labelOf(EVIDENCE_VISIBILITIES, d.evidence_visibility ?? "private")}.
              </li>
            ))}
          </ul>
        ),
      });
    }
  }

  if (policy.length || t.cancellation?.note || t.refund?.note) {
    rows.push({
      label: "Cancellation and refund terms",
      body: (
        <div className="grid gap-1">
          {policy.map((p) => <p key={p.key}>{p.label}: {p.sentence}</p>)}
          {t.cancellation?.note && <p>The organizer adds: {t.cancellation.note}</p>}
          {t.refund?.note && <p>On refunds, the organizer adds: {t.refund.note}</p>}
        </div>
      ),
    });
  }

  if (!rows.length) return null;

  return (
    <div className="grid gap-4">
      {heading && <p className="caps text-[14px] text-accent-ink">{heading}</p>}
      <dl className="grid gap-3">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 md:grid-cols-[220px_1fr] md:gap-4">
            <dt className="caps text-[14px] text-muted">{row.label}</dt>
            <dd className="max-w-[62ch] text-[15px] leading-[1.6]">{row.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------

const EVIDENCE_LABELS = {
  photo: "documented with a photograph",
  link: "documented with a link",
  document: "documented with a document",
  note: "documented in the organizer's own written record",
} as const;

/** The label for a stored key, from its own closed list. Nothing is drawn for a key with no label. */
function labelOf(list: readonly { key: string; label: string }[], key: string | null | undefined): string | null {
  if (!key) return null;
  return list.find((item) => item.key === key)?.label ?? null;
}

/** The parts that were written, joined into one line. Nothing at all where none were. */
function sentences(parts: (string | null | undefined)[]): string | null {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  if (!kept.length) return null;
  return kept.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(" ");
}

function span(from: string | null | undefined, to: string | null | undefined): string | null {
  if (from && to) return `${formatDay(from)} to ${formatDay(to)}`;
  if (from) return `From ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return null;
}

/**
 * "12 appearances, each one a home fixture". Counted this way rather than "12 home fixture" because
 * the unit is whatever the organizer typed, in whatever number they typed it, and no wording here
 * may assume a plural it was not given.
 */
function appearanceLine(t: OfferTerms): string | null {
  const n = t.appearances?.quantity;
  const unit = t.appearances?.unit?.trim();
  if (n === null || n === undefined) return unit ? `Each appearance is ${lower(unit)}` : null;
  const counted = n === 1 ? "1 appearance" : `${n.toLocaleString("en-US")} appearances`;
  return unit ? `${counted}, each one ${lower(unit)}` : counted;
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);
const lower = (s: string) => (s.charAt(0).toLowerCase() + s.slice(1)).replace(/\.$/, "");

/**
 * Who pays to make the placement, and the one thing that has to be said with it: Door Money moves
 * the sponsorship price and nothing else, so a production cost the sponsor covers is settled between
 * the two of them and never bought here.
 */
function productionLine(t: OfferTerms): string | null {
  const p = t.production;
  if (!p) return null;
  const amount = p.cost_cents !== null && p.cost_cents !== undefined ? formatMoney(p.cost_cents) : null;
  if (p.included) return sentences([amount ? `Production is included in the price (${amount})` : "Production is included in the price", p.description]);
  const payer = labelOf(PRODUCTION_PAYERS, p.who_pays);
  if (!payer && !amount && !p.description) return null;
  const settled = p.who_pays === "organizer" ? null : "Any production cost is settled between the organizer and the sponsor; Door Money moves the sponsorship price and nothing else";
  return sentences([amount ? `${payer ?? "Production cost"}: ${amount}` : payer, p.description, settled]);
}

function approvalLine(t: OfferTerms): string | null {
  const a = t.approval;
  if (a?.rule === "none") return "Nothing is needed from the sponsor";
  if (a?.rule !== "approval") return null;
  return a.deadline_days_after_materials
    ? `The organizer accepts or declines what the sponsor sends, within ${days(a.deadline_days_after_materials)}`
    : "The organizer accepts or declines what the sponsor sends";
}
