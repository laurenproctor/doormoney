"use client";
import {
  APPROVAL_RULES,
  DELIVERABLE_ROWS,
  DISPLAY_ONLY_NOTE,
  OFFER_TERMS_FIELDS as F,
  PRODUCTION_PAYERS,
  deliverableField,
  type OfferTerms,
} from "@/lib/offer-terms";
import { EVIDENCE_KINDS } from "@/lib/delivery-policy";
import type { InputHTMLAttributes } from "react";

/** The evidence kinds, in words. The keys are the ones the evidence table already stores. */
const EVIDENCE_LABELS: Record<(typeof EVIDENCE_KINDS)[number], string> = {
  photo: "A photograph",
  link: "A link",
  document: "A document",
  note: "Your own written record",
};

/**
 * One labelled box. Declared here rather than inside the component below, because a component
 * declared in a render is a new component on every render: React would unmount these and throw away
 * whatever was half typed in them the moment the price above changed.
 */
function Field({ field, templateKey, label, help, ...rest }: { field: string; templateKey: string; label: string; help?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="caps block text-[14px]">
      {label}
      <input name={`${field}_${templateKey}`} {...rest} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
      {help && <span className="mt-1 block text-[14px] normal-case tracking-normal text-muted">{help}</span>}
    </label>
  );
}

/**
 * The offer contract for one sponsorship option, under the price and the sale method.
 *
 * What a sponsor is buying, in the organizer's own words: where it appears and in what form, how
 * many times and when, who it reaches, who pays to make it, what is exclusive about it, what the
 * sponsor has to send and by when, what is owed, and how each of those will be documented. None of
 * it is required. An option with none of it filled in is saved exactly as it was before any of this
 * existed, and an option with half of it keeps the half that was written.
 *
 * It is not a domain component. It is the organizer's side of one, the way VerificationEditor is
 * the organizer's side of PlacementVerification: it carries field names, a save action reads them,
 * and it is drawn inside the form in src/components/LotsEditor.tsx.
 *
 * Uncontrolled on purpose. Nothing here changes as it is typed, so the fields hold their own values
 * and the form posts them. They stay mounted when the option is switched off, hidden rather than
 * unmounted, so nobody loses what they wrote by unticking a box.
 *
 * Second person throughout, because this is the dashboard: one person, their own fundraiser.
 *
 * Every word is category-neutral. What is owed and what documents it are the organizer's to write;
 * this asks the question and fills in no answer (voice rule 6).
 */
export function OfferTermsEditor({
  templateKey,
  templateName,
  terms,
  hidden = false,
  locked = false,
}: {
  templateKey: string;
  /** For the labels that name which option is being described. */
  templateName: string;
  /** What is stored for this option today. Empty for one nobody has written terms for. */
  terms: OfferTerms;
  /** True while the option is switched off. The fields keep their values and are not read. */
  hidden?: boolean;
  /** True once a spot on this option has sold or has a bid on it: its terms are settled. */
  locked?: boolean;
}) {
  const k = templateKey;
  const name = (field: string) => `${field}_${k}`;
  const t = terms;
  const deliverables = t.deliverables ?? [];
  const open = !hidden && !locked && Object.keys(t).length > 1;

  /** Every box on this option, so the shared one does not have to be told twice. */
  const box = { templateKey: k, disabled: locked };

  return (
    <details open={open} hidden={hidden} className="mt-3 border-t border-line pt-3">
      <summary className="caps cursor-pointer text-[14px] text-accent-ink">What the sponsor gets, in full</summary>
      <p className="mt-2 max-w-[62ch] text-[14.5px] text-muted">
        Optional, and worth the ten minutes. A sponsor decides on what this says. Leave anything blank that you have not settled;
        nothing here is filled in for you, and a blank field promises nothing.
      </p>
      {locked && (
        <p className="mt-2 max-w-[62ch] text-[14.5px] text-accent-ink">
          A sponsor has already bid on or paid for {templateName}, so these terms stay as they are. They are what that sponsor bought.
        </p>
      )}

      <fieldset className="mt-5 grid gap-3 md:grid-cols-3">
        <legend className="caps mb-2 text-[14px] text-accent-ink">The placement</legend>
        <Field {...box} field={F.placement} label="Where it appears" defaultValue={t.placement?.description ?? ""} placeholder="Above the entrance" />
        <Field {...box} field={F.format} label="In what form" defaultValue={t.placement?.format ?? ""} placeholder="A printed panel" />
        <Field {...box} field={F.appearance} label="Size or prominence" defaultValue={t.placement?.appearance ?? ""} placeholder="Optional" />
      </fieldset>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-[120px_160px_1fr]">
        <legend className="caps mb-2 text-[14px] text-accent-ink">How often</legend>
        <Field {...box} field={F.quantity} label="How many" inputMode="numeric" defaultValue={t.appearances?.quantity ?? ""} placeholder="Optional" />
        <Field {...box} field={F.unit} label="Each one is" defaultValue={t.appearances?.unit ?? ""} placeholder="A night" />
        <Field {...box} field={F.schedule} label="When they fall" defaultValue={t.appearances?.schedule ?? ""} help="Only where a count does not say it on its own." />
      </fieldset>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-4">
        <legend className="caps mb-2 text-[14px] text-accent-ink">When it is delivered</legend>
        <Field {...box} field={F.windowStart} label="From" type="date" defaultValue={t.delivery_window?.starts_on ?? ""} />
        <Field {...box} field={F.windowEnd} label="Until" type="date" defaultValue={t.delivery_window?.ends_on ?? ""} />
        <Field {...box} field={F.deadline} label="Everything done by" type="date" defaultValue={t.delivery_window?.deadline_on ?? ""} />
        <Field {...box} field={F.timezone} label="Time zone" defaultValue={t.delivery_window?.timezone ?? ""} placeholder="America/New_York" help="The zone those dates are read in." />
      </fieldset>

      <fieldset className="mt-5 grid gap-3">
        <legend className="caps mb-2 text-[14px] text-accent-ink">Who it reaches</legend>
        <label className="caps block text-[14px]">
          Who sees it
          <textarea name={name(F.audience)} defaultValue={t.audience?.description ?? ""} disabled={locked} rows={2} placeholder="Who is in the space, and what brought them" className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
          <span className="mt-1 block text-[14px] normal-case tracking-normal text-muted">
            A description. The number and where it comes from are the two fields above this section.
          </span>
        </label>
      </fieldset>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]">
        <legend className="caps mb-2 text-[14px] text-accent-ink">Making it</legend>
        <label className="caps block text-[14px]">
          Who pays to produce it
          <select name={name(F.productionPayer)} defaultValue={t.production?.who_pays ?? ""} disabled={locked} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]">
            <option value="">Not said</option>
            {PRODUCTION_PAYERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <Field {...box} field={F.productionNote} label="What that covers" defaultValue={t.production?.description ?? ""} help="Door Money moves the sponsorship price and nothing else. Anything supplied in kind is settled between the two of you." />
      </fieldset>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-[180px_1fr]">
        <legend className="caps mb-2 text-[14px] text-accent-ink">Exclusivity</legend>
        <label className="caps flex items-center gap-2 text-[14px]">
          <input type="checkbox" name={name(F.exclusive)} value="1" defaultChecked={t.exclusivity?.exclusive ?? false} disabled={locked} className="h-5 w-5 accent-[var(--accent)]" />
          This is exclusive
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Field {...box} field={F.exclusiveScope} label="Exclusive to what" defaultValue={t.exclusivity?.scope ?? ""} placeholder="One business of this kind" />
          <Field {...box} field={F.exclusiveNote} label="What that means here" defaultValue={t.exclusivity?.description ?? ""} />
        </div>
      </fieldset>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-[1fr_150px]">
        <legend className="caps mb-2 text-[14px] text-accent-ink">What the sponsor sends</legend>
        <Field {...box} field={F.materials} label="What you need from them" defaultValue={t.sponsor_materials?.description ?? ""} placeholder="Artwork, or the wording as it should read" />
        <Field {...box} field={F.materialsDays} label="Days to send it" inputMode="numeric" defaultValue={t.sponsor_materials?.due_days_after_purchase ?? ""} help="Counted from the day they pay." />
        <label className="caps block text-[14px] md:col-span-2">
          Who accepts it
          <select name={name(F.approvalRule)} defaultValue={t.approval?.rule ?? ""} disabled={locked} className="field mt-1 w-full max-w-[420px] bg-ground px-2 py-1.5 text-[15px]">
            <option value="">Not said</option>
            {APPROVAL_RULES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <Field {...box} field={F.approvalNote} label="How you will answer" defaultValue={t.approval?.description ?? ""} />
        <Field {...box} field={F.approvalDays} label="Days to answer" inputMode="numeric" defaultValue={t.approval?.deadline_days_after_materials ?? ""} help="Counted from the day it arrives." />
      </fieldset>

      <fieldset className="mt-5 grid gap-4">
        <legend className="caps mb-2 text-[14px] text-accent-ink">What you owe, and how you will document it</legend>
        <p className="max-w-[62ch] text-[14.5px] text-muted">
          One line per promise. Documentation comes from you and Door Money passes it on: it never checks whether it is good, and it never
          claims to have inspected anything.
        </p>
        {Array.from({ length: Math.max(DELIVERABLE_ROWS, deliverables.length) }, (_, i) => {
          const d = deliverables[i];
          return (
            <div key={i} className="grid gap-3 md:grid-cols-[1fr_90px_150px_160px]">
              <label className="caps block text-[14px]">
                {i === 0 ? "What is owed" : ""}
                <input name={deliverableField("title", i, k)} defaultValue={d?.title ?? ""} disabled={locked} placeholder={i === 0 ? "Name on the printed program" : "Another promise"} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
              </label>
              <label className="caps block text-[14px]">
                {i === 0 ? "How many" : ""}
                <input name={deliverableField("qty", i, k)} inputMode="numeric" defaultValue={d?.quantity ?? ""} disabled={locked} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
              </label>
              <label className="caps block text-[14px]">
                {i === 0 ? "Due by" : ""}
                <input name={deliverableField("due", i, k)} type="date" defaultValue={d?.due_on ?? ""} disabled={locked} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
              </label>
              <label className="caps block text-[14px]">
                {i === 0 ? "Documented by" : ""}
                <select name={deliverableField("evidence", i, k)} defaultValue={d?.evidence_method ?? ""} disabled={locked} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]">
                  <option value="">Not said</option>
                  {EVIDENCE_KINDS.map((kind) => <option key={kind} value={kind}>{EVIDENCE_LABELS[kind]}</option>)}
                </select>
              </label>
              <label className="caps block text-[14px] md:col-span-4">
                {i === 0 ? "In your own words" : ""}
                <input name={deliverableField("note", i, k)} defaultValue={d?.description ?? ""} disabled={locked} placeholder={i === 0 ? "Optional" : ""} className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]" />
              </label>
            </div>
          );
        })}
        <p className="text-[14px] text-muted">A line with nothing owed on it is ignored, whatever else is on it.</p>
      </fieldset>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-2">
        <legend className="caps mb-2 text-[14px] text-accent-ink">If it is called off</legend>
        <p className="max-w-[62ch] text-[14.5px] text-muted md:col-span-2">{DISPLAY_ONLY_NOTE}</p>
        <Field {...box} field={F.cancellationNote} label="Your note on cancelling" defaultValue={t.cancellation?.note ?? ""} placeholder="Optional" />
        <Field {...box} field={F.refundNote} label="Your note on refunds" defaultValue={t.refund?.note ?? ""} placeholder="Optional" />
      </fieldset>
    </details>
  );
}
