import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { PolicyStatement } from "@/lib/offer-policy";
import { APPROVAL_RULES, EVIDENCE_VISIBILITIES, PRODUCTION_PAYERS, SPONSOR_MATERIAL_TYPES, publicOfferTerms, type OfferTermsView } from "@/lib/offer-terms";
import type { SaleMethod } from "@/lib/opportunities";
import type { MoneyLine, OptionMissing } from "@/lib/sponsorship-builder";

/*
  One sponsorship option, read back as the two sides of a deal.

  Three sections, and the same three on every category: what the sponsor gets, what the sponsor
  has to provide, and what the organizer commits to deliver. Then what Door Money's policy decides,
  which nobody here chose, and the money in its separate boxes. Every sentence is built from what
  the organizer typed; a part they have not written is named under "Still missing" and appears
  nowhere else. A template never speaks here: an unchosen suggestion is not a term.
*/

export type OptionSummaryInput = {
  templateName: string;
  terms: OfferTermsView;
  priceCents: number | null;
  saleMethod: SaleMethod;
  buyNowCents: number | null;
  spots: number;
  policy: readonly PolicyStatement[];
  money: MoneyLine[];
  missing: OptionMissing[];
  locked: boolean;
  /** True for an option that was on sale before terms were required, so what is missing does not block publishing. */
  grandfathered?: boolean;
};

export function SponsorshipOptionSummary({ input, className = "" }: { input: OptionSummaryInput; className?: string }) {
  const t = publicOfferTerms(input.terms) as OfferTermsView;
  const reach = input.terms.audience_reach;
  const gets = sentences([
    t.placement?.description ? `Appears ${lowerFirst(t.placement.description)}` : null,
    t.placement?.format,
    t.placement?.appearance,
    appearanceLine(t),
    t.appearances?.schedule,
    span(t.delivery_window?.starts_on, t.delivery_window?.ends_on),
    t.exclusivity?.exclusive ? sentences(["Exclusive", t.exclusivity.scope, t.exclusivity.description]) : null,
    t.audience?.description ? `Seen by ${lowerFirst(t.audience.description)}` : null,
    reach ? `About ${reach.estimate.toLocaleString("en-US")} people, an estimate based on ${lowerFirst(reach.basis)}` : null,
  ]);
  const provides = sentences([
    priceLine(input),
    labelOf(SPONSOR_MATERIAL_TYPES, t.sponsor_materials?.type),
    t.sponsor_materials?.description,
    t.sponsor_materials?.due_days_after_purchase ? `Sent within ${days(t.sponsor_materials.due_days_after_purchase)} of paying` : null,
    t.production?.who_pays === "sponsor" || t.production?.who_pays === "shared" ? productionLine(t) : null,
  ]);
  const deliverables = t.deliverables ?? [];
  const commits = sentences([
    t.production?.included ? "Producing the placement is included in the price" : t.production?.who_pays === "organizer" ? productionLine(t) : null,
    approvalLine(t),
    t.delivery_window?.deadline_on ? `Everything delivered by ${formatDay(t.delivery_window.deadline_on)}` : null,
  ]);

  return (
    <aside aria-label="This option, as both sides read it" aria-live="polite" className={`edge min-w-0 bg-panel ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="caps text-[14px] text-accent-ink">{input.templateName}</span>
        <span className="caps text-[14px] text-muted">{input.locked ? "Terms settled" : "Private draft"}</span>
      </div>
      <div className="grid gap-5 p-5">
        <Part heading="What the sponsor gets">{gets ?? <Missing>Not described yet.</Missing>}</Part>
        <Part heading="What the sponsor needs to provide">{provides ?? <Missing>Not said yet. A price is the least an option needs.</Missing>}</Part>
        <Part heading="What you commit to deliver">
          {deliverables.length > 0 && (
            <ul className="mb-2 grid gap-1">
              {deliverables.map((d, i) => (
                <li key={i}>
                  {d.quantity ? `${d.quantity} × ` : ""}{d.title}
                  {d.due_on ? `, due ${formatDay(d.due_on)}` : ""}
                  {d.evidence_method ? `. ${EVIDENCE_WORDS[d.evidence_method as keyof typeof EVIDENCE_WORDS]}, ${lowerFirst(labelOf(EVIDENCE_VISIBILITIES, d.evidence_visibility ?? "private") ?? "private to the sponsor")}` : ""}
                  {d.description ? `. ${d.description}` : ""}
                </li>
              ))}
            </ul>
          )}
          {commits ?? (deliverables.length === 0 ? <Missing>Nothing promised yet. A deliverable is a promise with a due date and a way to document it.</Missing> : null)}
        </Part>
        <Part heading="What Door Money's policy decides">
          {input.policy.map((p) => (
            <span key={p.key} className="block">
              <span className="text-muted">{p.label}: </span>{p.sentence}
            </span>
          ))}
          {t.cancellation?.note && <span className="block">Your note on cancelling: {t.cancellation.note}</span>}
          {t.refund?.note && <span className="block">Your note on refunds: {t.refund.note}</span>}
        </Part>
        <div className="border-t border-line pt-4">
          <p className="caps mb-2 text-[14px] text-muted">Money, kept apart</p>
          <dl className="grid gap-2">
            {input.money.map((m) => (
              <div key={m.key} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                <dt className="text-[14.5px] text-muted">{m.label}</dt>
                <dd className="heading text-right text-[15px]">{m.value}</dd>
                {m.note && <dd className="col-span-2 text-[14px] text-muted">{m.note}</dd>}
              </div>
            ))}
          </dl>
        </div>
        <div className="border-t border-line pt-4">
          <p className="caps mb-2 text-[14px] text-muted">Still missing</p>
          {input.missing.length === 0 ? (
            <p className="text-[14.5px]">Everything a sponsor needs before they pay is here.</p>
          ) : (
            <ul className="grid gap-1 text-[14.5px]">
              {input.missing.map((m) => (
                <li key={m.key}><span aria-hidden="true" className="mr-2 text-accent-ink">•</span>{m.label}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[14px] text-muted">A partial option saves as a private draft. Nothing on this list is filled in for you.</p>
        </div>
      </div>
    </aside>
  );
}

function Part({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="caps mb-1.5 text-[14px] text-accent-ink">{heading}</p>
      <div className="text-[15px] leading-[1.6]">{children}</div>
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

const EVIDENCE_WORDS = {
  photo: "Documented with a photograph",
  link: "Documented with a link",
  document: "Documented with a document",
  note: "Documented in your own written record",
} as const;

function labelOf(list: readonly { key: string; label: string }[], key: string | null | undefined): string | null {
  if (!key) return null;
  return list.find((item) => item.key === key)?.label ?? null;
}

function sentences(parts: (string | null | undefined)[]): string | null {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  if (!kept.length) return null;
  return kept.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(" ");
}

const lowerFirst = (s: string) => (s.charAt(0).toLowerCase() + s.slice(1)).replace(/\.$/, "");
const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

function span(from: string | null | undefined, to: string | null | undefined): string | null {
  if (from && to) return `${formatDay(from)} to ${formatDay(to)}`;
  if (from) return `From ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return null;
}

function appearanceLine(t: OfferTermsView): string | null {
  const n = t.appearances?.quantity;
  const unit = t.appearances?.unit?.trim();
  if (n === null || n === undefined) return unit ? `Each appearance is ${lowerFirst(unit)}` : null;
  const counted = n === 1 ? "1 appearance" : `${n.toLocaleString("en-US")} appearances`;
  return unit ? `${counted}, each one ${lowerFirst(unit)}` : counted;
}

function priceLine(input: OptionSummaryInput): string | null {
  if (input.priceCents === null) return null;
  const price = formatMoney(input.priceCents);
  if (input.saleMethod === "auction") {
    return input.buyNowCents ? `A bid of at least ${price}, or ${formatMoney(input.buyNowCents)} to take it now, through Door Money` : `A bid of at least ${price}, through Door Money`;
  }
  return `${price} through Door Money`;
}

function productionLine(t: OfferTermsView): string | null {
  const p = t.production;
  if (!p) return null;
  const amount = p.cost_cents !== null && p.cost_cents !== undefined ? formatMoney(p.cost_cents) : null;
  const payer = labelOf(PRODUCTION_PAYERS, p.who_pays);
  if (!payer && !amount && !p.description) return null;
  const settled = p.who_pays === "organizer" ? null : "Settled between you and the sponsor; Door Money moves the sponsorship price and nothing else";
  return sentences([amount ? `${payer ?? "Production cost"}: ${amount}` : payer, p.description, settled]);
}

function approvalLine(t: OfferTermsView): string | null {
  const a = t.approval;
  if (a?.rule === "none") return labelOf(APPROVAL_RULES, "none");
  if (a?.rule !== "approval") return null;
  return sentences([
    a.deadline_days_after_materials ? `You accept or decline what the sponsor sends within ${days(a.deadline_days_after_materials)}` : "You accept or decline what the sponsor sends",
    a.description,
  ]);
}
