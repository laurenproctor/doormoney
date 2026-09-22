"use client";
import { useId, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { OfferSummary } from "@/components/OfferSummary";
import { EVIDENCE_KINDS } from "@/lib/delivery-policy";
import type { PolicyStatement } from "@/lib/offer-policy";
import {
  APPROVAL_RULES,
  DELIVERABLE_LIMIT,
  DELIVERABLE_ROWS,
  DISPLAY_ONLY_NOTE,
  EMPTY_DELIVERABLE_DRAFT,
  EVIDENCE_VISIBILITIES,
  LATE_MATERIALS_CONSEQUENCE,
  OFFER_TERMS_FIELDS as F,
  PRODUCTION_PAYERS,
  SPONSOR_MATERIAL_TYPES,
  deliverableField,
  missingOfferRequirements,
  offerTermsRequirements,
  offerTermsView,
  parseOfferTerms,
  termsFromDraft,
  type OfferDeliverableDraft,
  type OfferTermsDraft,
} from "@/lib/offer-terms";

/**
 * Offer details: the rest of what a sponsor is buying, under one option's price row.
 *
 * The compact row above this stays what it was, which is the whole point of the split. It carries
 * the five things an organizer changes often (offered or not, how many spots, the price, how it is
 * sold, the take-it-now number) and nothing else. Everything a sponsor has to read before they pay
 * lives here, collapsed until somebody asks for it.
 *
 * Eleven sections, in the product contract's own order. Not one of them is required to save: a
 * draft saves whatever is written, an offer published before any of this existed has none of it and
 * is not made to invent any, and the readiness list at the bottom says what is still missing
 * without refusing anything.
 *
 * Controlled, so the preview and the readiness list are built from what is on the screen rather than
 * from what was last saved, and so a save that comes back with a problem gives every box back with
 * what was typed in it. The same field names are posted, and src/app/actions/lots.ts reads them out
 * of the FormData: the browser's idea of the terms is never what is trusted.
 *
 * Second person, because this is the dashboard: one person, their own fundraiser. Category-neutral
 * throughout, so it works for merchandise, signage, an event placement, a digital promotion, a
 * hospitality service and whatever is added next, with no branch for any of them.
 */
export function OfferTermsEditor({
  templateKey,
  templateName,
  draft,
  onChange,
  reach,
  reachBasis,
  onReachChange,
  policy = [],
  materialsWindowDays = null,
  hidden = false,
  locked = false,
  error = null,
}: {
  templateKey: string;
  templateName: string;
  draft: OfferTermsDraft;
  onChange: (patch: Partial<OfferTermsDraft>) => void;
  /** The lot's own reach estimate and its basis. Columns, not terms: discovery filters on them. */
  reach: string;
  reachBasis: string;
  onReachChange: (patch: { reach?: string; reachBasis?: string }) => void;
  /** What the category's delivery policy decides. Stated here, never chosen. */
  policy?: readonly PolicyStatement[];
  /** The policy's own materials window, shown as what applies when this offer names no other. */
  materialsWindowDays?: number | null;
  /** True while the option is switched off. The fields keep their values and are not read. */
  hidden?: boolean;
  /** True once a spot on this option has sold or has a bid on it: its terms are settled. */
  locked?: boolean;
  /** What the last save said about this option, where it said anything about this one. */
  error?: string | null;
}) {
  const k = templateKey;
  const ids = useId();
  const [showPreview, setShowPreview] = useState(false);
  const name = (f: string) => `${f}_${k}`;

  // Everything below reads one parse of what is on the screen, by the same function the server
  // runs, so the problem shown as somebody types is the problem that would stop the save.
  const parsed = useMemo(() => parseOfferTerms(termsFromDraft(draft)), [draft]);
  const terms = parsed.ok ? parsed.terms : {};
  const lot = { reach_estimate: reach ? Number(reach) : null, reach_basis: reachBasis || null };
  const requirements = offerTermsRequirements(terms, lot);
  const missing = missingOfferRequirements(terms, lot);
  const problem = parsed.ok ? null : parsed.error;

  const rows = draft.deliverables.length ? draft.deliverables : Array.from({ length: DELIVERABLE_ROWS }, () => EMPTY_DELIVERABLE_DRAFT);
  const named = rows.map((d, i) => ({ ...d, index: i })).filter((d) => d.title.trim());
  const setDeliverable = (index: number, patch: Partial<OfferDeliverableDraft>) =>
    onChange({ deliverables: rows.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  const addDeliverable = () => onChange({ deliverables: [...rows, { ...EMPTY_DELIVERABLE_DRAFT }] });

  // One box, with this option's key and lock already on it. Bound rather than declared inside the
  // render: a component declared in a render is a new component on every render, and React would
  // remount every field, taking the caret with it, each time a character is typed.
  const box = { templateKey: k, idPrefix: ids, disabled: locked };

  return (
    <details hidden={hidden} className="mt-3 border-t border-line pt-3">
      <summary className="caps cursor-pointer text-[14px] text-accent-ink">
        Offer details
        <span className="ml-3 normal-case tracking-normal text-muted">
          {missing.length === 0 ? "Everything a sponsor needs is here" : `${missing.length} still to fill in`}
        </span>
      </summary>

      <p className="mt-3 max-w-[62ch] text-[14.5px] text-muted">
        What a sponsor reads before they pay. None of it is required to save, and nothing is filled in for you. Leave blank anything
        you have not settled: a blank field promises nothing.
      </p>

      {locked && (
        <p className="mt-3 max-w-[62ch] text-[14.5px] text-accent-ink">
          A sponsor has already bid on or paid for {templateName}, so these terms stay as they are. They are what that sponsor bought.
        </p>
      )}

      {(error || problem) && (
        <p role="alert" className="mt-3 max-w-[62ch] text-[14.5px] text-accent-ink">{error ?? problem}</p>
      )}

      <Section legend="What the sponsor provides">
        <div className="grid gap-3 md:grid-cols-[280px_1fr]">
          <Choice
            name={name(F.materialType)} label="Kind" value={draft.materialType} disabled={locked}
            onValue={(v) => onChange({ materialType: v })} options={SPONSOR_MATERIAL_TYPES}
          />
          <Field {...box}
            field={F.materials} label="What exactly" value={draft.materials}
            onValue={(v) => onChange({ materials: v })}
            placeholder="A high resolution file, or the wording as it should read"
          />
        </div>
      </Section>

      <Section legend="Where it appears">
        <div className="grid gap-3 md:grid-cols-3">
          <Field {...box} field={F.placement} label="Exact placement" value={draft.placement} onValue={(v) => onChange({ placement: v })} placeholder="Above the entrance" />
          <Field {...box} field={F.format} label="Format" value={draft.format} onValue={(v) => onChange({ format: v })} placeholder="A printed panel" />
          <Field {...box} field={F.appearance} label="Size or prominence" value={draft.appearance} onValue={(v) => onChange({ appearance: v })} placeholder="Optional" />
        </div>
      </Section>

      <Section legend="Number of appearances">
        <div className="grid gap-3 md:grid-cols-[120px_200px_1fr]">
          <Field {...box} field={F.quantity} label="How many" inputMode="numeric" value={draft.quantity} onValue={(v) => onChange({ quantity: v.replace(/[^0-9]/g, "") })} />
          <Field {...box} field={F.unit} label="Each one is" value={draft.unit} onValue={(v) => onChange({ unit: v })} placeholder="A night, a post, a service" />
          <Field {...box} field={F.schedule} label="Or describe the schedule" value={draft.schedule} onValue={(v) => onChange({ schedule: v })} help="Use this where a count does not say it on its own." />
        </div>
      </Section>

      <Section legend="Delivery window">
        <div className="grid gap-3 md:grid-cols-4">
          <Field {...box} field={F.windowStart} label="From" type="date" value={draft.windowStart} onValue={(v) => onChange({ windowStart: v })} />
          <Field {...box} field={F.windowEnd} label="Until" type="date" value={draft.windowEnd} onValue={(v) => onChange({ windowEnd: v })} />
          <Field {...box} field={F.deadline} label="Deadline" type="date" value={draft.deadline} onValue={(v) => onChange({ deadline: v })} help="The day everything on this offer is done by." />
          <Field {...box} field={F.timezone} label="Time zone" value={draft.timezone} onValue={(v) => onChange({ timezone: v })} placeholder="America/New_York" help="The zone those dates are read in." />
        </div>
      </Section>

      <Section legend="Audience and reach">
        <label className="caps block text-[14px]">
          Who sees it
          <textarea
            name={name(F.audience)} value={draft.audience} disabled={locked} rows={2}
            onChange={(e) => onChange({ audience: e.target.value })}
            placeholder="Who is in the space, and what brought them"
            className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <label className="caps block text-[14px]">
            People reached
            <input
              name={`reach_${k}`} inputMode="numeric" value={reach} placeholder="Optional"
              aria-describedby={`${ids}-reach-help`}
              onChange={(e) => onReachChange({ reach: e.target.value.replace(/[^0-9]/g, "") })}
              className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
            />
          </label>
          <label className="caps block text-[14px]">
            How do you know?
            <input
              name={`reachbasis_${k}`} value={reachBasis}
              placeholder={reach ? "Average attendance over the last six" : "Only needed if you give a number"}
              onChange={(e) => onReachChange({ reachBasis: e.target.value })}
              className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
            />
            <span id={`${ids}-reach-help`} className="mt-1 block text-[14px] normal-case tracking-normal text-muted">
              An estimate, not a promise. A number cannot be saved without the reason for it.
            </span>
          </label>
        </div>
      </Section>

      <Section legend="Production costs">
        <Check
          name={name(F.productionIncluded)} label="Producing it is included in the price"
          checked={draft.productionIncluded} disabled={locked} onValue={(v) => onChange({ productionIncluded: v })}
        />
        <div className="grid gap-3 md:grid-cols-[170px_260px_1fr]">
          <Field {...box} field={F.productionCost} label="Cost, dollars" inputMode="decimal" value={draft.productionCost} onValue={(v) => onChange({ productionCost: v })} placeholder="Optional" />
          <Choice
            name={name(F.productionPayer)} label="Who pays it" value={draft.productionPayer} disabled={locked}
            onValue={(v) => onChange({ productionPayer: v })} options={PRODUCTION_PAYERS}
          />
          <Field {...box} field={F.productionNote} label="What it covers" value={draft.productionNote} onValue={(v) => onChange({ productionNote: v })} />
        </div>
        <p className="max-w-[62ch] text-[14px] text-muted">
          Door Money moves the sponsorship price and nothing else. A production cost a sponsor covers is settled between the two of
          you, and no page describes it as something bought here.
        </p>
      </Section>

      <Section legend="Exclusivity">
        <Check
          name={name(F.exclusive)} label="This sponsorship is exclusive"
          checked={draft.exclusive} disabled={locked} onValue={(v) => onChange({ exclusive: v })}
        />
        {draft.exclusive && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field {...box} field={F.exclusiveScope} label="Exclusive to what" value={draft.exclusiveScope} onValue={(v) => onChange({ exclusiveScope: v })} placeholder="One business of this kind" />
            <Field {...box} field={F.exclusiveNote} label="What that means here" value={draft.exclusiveNote} onValue={(v) => onChange({ exclusiveNote: v })} />
          </div>
        )}
      </Section>

      <Section legend="Sponsor materials and approval">
        <div className="grid gap-3 md:grid-cols-[190px_190px_1fr]">
          <Field {...box}
            field={F.materialsDays} label="Days to send it" inputMode="numeric" value={draft.materialsDays}
            onValue={(v) => onChange({ materialsDays: v.replace(/[^0-9]/g, "") })}
            placeholder={materialsWindowDays ? String(materialsWindowDays) : "Optional"}
            help={materialsWindowDays
              ? `Counted from the day they pay. Blank means Door Money's ${materialsWindowDays} days.`
              : "Counted from the day they pay."}
          />
          <Field {...box}
            field={F.approvalDays} label="Days to answer" inputMode="numeric" value={draft.approvalDays}
            onValue={(v) => onChange({ approvalDays: v.replace(/[^0-9]/g, "") })} placeholder="Optional"
            help="Counted from the day it arrives."
          />
          <Choice
            name={name(F.approvalRule)} label="Who accepts it" value={draft.approvalRule} disabled={locked}
            onValue={(v) => onChange({ approvalRule: v })} options={APPROVAL_RULES}
          />
        </div>
        <Field {...box} field={F.approvalNote} label="How you will answer" value={draft.approvalNote} onValue={(v) => onChange({ approvalNote: v })} />
        <p className="max-w-[62ch] text-[14px] text-muted">{LATE_MATERIALS_CONSEQUENCE}</p>
      </Section>

      <Section legend="Deliverables">
        <p className="max-w-[62ch] text-[14.5px] text-muted">
          One line per promise. A line with nothing owed on it is ignored, whatever else is on it.
        </p>
        {rows.map((d, i) => (
          <div key={i} className="grid gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0 md:grid-cols-[1fr_110px_180px]">
            <label className="caps block text-[14px]">
              What is owed
              <input
                name={deliverableField("title", i, k)} value={d.title} disabled={locked}
                onChange={(e) => setDeliverable(i, { title: e.target.value })}
                placeholder={i === 0 ? "Name on the printed program" : "Another promise"}
                className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
              />
            </label>
            <label className="caps block text-[14px]">
              How many
              <input
                name={deliverableField("qty", i, k)} inputMode="numeric" value={d.quantity} disabled={locked}
                onChange={(e) => setDeliverable(i, { quantity: e.target.value.replace(/[^0-9]/g, "") })}
                className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
              />
            </label>
            <label className="caps block text-[14px]">
              Due by
              <input
                name={deliverableField("due", i, k)} type="date" value={d.dueOn} disabled={locked}
                onChange={(e) => setDeliverable(i, { dueOn: e.target.value })}
                className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
              />
            </label>
            <label className="caps block text-[14px] md:col-span-3">
              In your own words
              <input
                name={deliverableField("note", i, k)} value={d.description} disabled={locked}
                onChange={(e) => setDeliverable(i, { description: e.target.value })} placeholder="Optional"
                className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
              />
            </label>
          </div>
        ))}
        {rows.length < DELIVERABLE_LIMIT && !locked && (
          <button type="button" onClick={addDeliverable} className="caps cursor-pointer justify-self-start text-[14px] text-accent-ink hover:underline">
            Add another deliverable
          </button>
        )}
      </Section>

      <Section legend="Evidence">
        <p className="max-w-[62ch] text-[14.5px] text-muted">
          How you will document each promise. Documentation comes from you and Door Money passes it on: it never checks whether it is
          good, and it never claims to have inspected anything. Every item is private to the sponsor unless you publish that one item
          afterwards, and an item showing a minor is never published.
        </p>
        {named.length === 0 ? (
          <p className="text-[14.5px] text-muted">Name a deliverable above and it appears here.</p>
        ) : (
          named.map((d) => (
            <div key={d.index} className="grid gap-3 md:grid-cols-[1fr_230px_300px] md:items-end">
              <p className="text-[15px]">{d.title}</p>
              <Choice
                name={deliverableField("evidence", d.index, k)} label="Documented by" value={d.evidenceMethod} disabled={locked}
                onValue={(v) => setDeliverable(d.index, { evidenceMethod: v })}
                options={EVIDENCE_KINDS.map((kind) => ({ key: kind, label: EVIDENCE_LABELS[kind] }))}
              />
              <Choice
                name={deliverableField("visibility", d.index, k)} label="Who sees it" value={d.evidenceVisibility} disabled={locked}
                onValue={(v) => setDeliverable(d.index, { evidenceVisibility: v })} options={EVIDENCE_VISIBILITIES}
              />
            </div>
          ))
        )}
        {/* A row whose title is empty still posts what was chosen for it, so a deliverable somebody
            is part way through renaming does not silently lose its evidence method. */}
        {rows.map((d, i) => (d.title.trim() ? null : (
          <span key={`held-${i}`} hidden>
            <input type="hidden" name={deliverableField("evidence", i, k)} value={d.evidenceMethod} readOnly />
            <input type="hidden" name={deliverableField("visibility", i, k)} value={d.evidenceVisibility} readOnly />
          </span>
        )))}
      </Section>

      <Section legend="Cancellation and refund terms">
        <div className="grid gap-2">
          {policy.map((p) => (
            <p key={p.key} className="max-w-[62ch] text-[14.5px]">
              <span className="text-muted">{p.label}: </span>{p.sentence}
            </p>
          ))}
        </div>
        <p className="max-w-[62ch] text-[14px] text-muted">{DISPLAY_ONLY_NOTE}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field {...box} field={F.cancellationNote} label="Your note on cancelling" value={draft.cancellationNote} onValue={(v) => onChange({ cancellationNote: v })} placeholder="Optional, shown to sponsors" />
          <Field {...box} field={F.refundNote} label="Your note on refunds" value={draft.refundNote} onValue={(v) => onChange({ refundNote: v })} placeholder="Optional, shown to sponsors" />
        </div>
      </Section>

      <div className="mt-6 grid gap-5 border-t border-line pt-4">
        <div>
          <p className="caps text-[14px] text-accent-ink">Before this option goes public</p>
          <p className="mt-1 max-w-[62ch] text-[14px] text-muted">
            What Door Money asks an offer to state before somebody buys it. Nothing here blocks saving, and an option published
            before this existed is not asked to invent terms it never had.
          </p>
          <ul className="mt-2 grid gap-1">
            {requirements.map((r) => (
              <li key={r.key} className={`text-[14.5px] ${r.met ? "text-muted" : "text-ink"}`}>
                <span aria-hidden="true" className="mr-2">{r.met ? "✓" : "•"}</span>
                <span className="sr-only">{r.met ? "Done: " : "Still to fill in: "}</span>
                {r.label}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <button
            type="button"
            aria-expanded={showPreview}
            onClick={() => setShowPreview((v) => !v)}
            className="caps cursor-pointer text-[14px] text-accent-ink hover:underline"
          >
            {showPreview ? "Hide what a sponsor sees" : "Show what a sponsor sees"}
          </button>
          {showPreview && (
            <div className="edge mt-3 bg-ground p-4">
              <OfferSummary
                terms={offerTermsView(terms, lot)}
                policy={policy}
                heading={`${templateName}: what this sponsorship includes`}
              />
              {missing.length === requirements.length && (
                <p className="text-[14.5px] text-muted">Nothing is written yet, so a sponsor would see the price and no terms.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------

/** The evidence kinds, in words. The keys are the ones the evidence table already stores. */
const EVIDENCE_LABELS: Record<(typeof EVIDENCE_KINDS)[number], string> = {
  photo: "A photograph",
  link: "A link",
  document: "A document",
  note: "Your own written record",
};

type FieldProps = {
  field: string; templateKey: string; idPrefix: string;
  label: string; help?: string; value: string; onValue: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name">;

/**
 * One labelled box, posted under `<field>_<template key>`.
 *
 * Declared here and not inside the component that uses it: a component declared in a render is a
 * new component on every render, so React would unmount and remount every field, and the caret
 * would jump out of the box on each character typed.
 */
function Field({ field, templateKey, idPrefix, label, help, value, onValue, ...rest }: FieldProps) {
  const helpId = help ? `${idPrefix}-${field}-help` : undefined;
  return (
    <label className="caps block text-[14px]">
      {label}
      <input
        name={`${field}_${templateKey}`}
        value={value}
        aria-describedby={helpId}
        onChange={(e) => onValue(e.target.value)}
        {...rest}
        className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
      />
      {help && <span id={helpId} className="mt-1 block text-[14px] normal-case tracking-normal text-muted">{help}</span>}
    </label>
  );
}

/** One named group of boxes. A fieldset and a legend, so the group is announced with every box in it. */
function Section({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="mt-6 grid gap-3">
      <legend className="caps mb-1 text-[14px] text-accent-ink">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Choice({ name, label, value, options, disabled, onValue }: {
  name: string; label: string; value: string; disabled?: boolean;
  options: readonly { key: string; label: string }[];
  onValue: (v: string) => void;
}) {
  return (
    <label className="caps block text-[14px]">
      {label}
      <select
        name={name} value={value} disabled={disabled}
        onChange={(e) => onValue(e.target.value)}
        className="field mt-1 w-full bg-ground px-2 py-1.5 text-[15px]"
      >
        <option value="">Not said</option>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Check({ name, label, checked, disabled, onValue }: {
  name: string; label: string; checked: boolean; disabled?: boolean; onValue: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[15px]">
      <input
        type="checkbox" name={name} value="1" checked={checked} disabled={disabled}
        onChange={(e) => onValue(e.target.checked)}
        className="h-5 w-5 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
