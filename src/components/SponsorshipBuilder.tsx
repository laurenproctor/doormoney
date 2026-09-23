"use client";
import { useActionState, useEffect, useId, useMemo, useState, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { saveSponsorVisibility, type DraftState } from "@/app/actions/drafts";
import { saveLots, type LotsState } from "@/app/actions/lots";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { Locked } from "@/components/dashboard/icons";
import { PlacementDiagram } from "@/components/PlacementDiagram";
import { SponsorshipOptionSummary } from "@/components/SponsorshipOptionSummary";
import { EVIDENCE_KINDS } from "@/lib/delivery-policy";
import { formatMoney } from "@/lib/money";
import type { PolicyStatement } from "@/lib/offer-policy";
import {
  APPROVAL_RULES, DELIVERABLE_LIMIT, DISPLAY_ONLY_NOTE, EMPTY_DELIVERABLE_DRAFT, EVIDENCE_VISIBILITIES, LATE_MATERIALS_CONSEQUENCE,
  OFFER_TERMS_FIELDS as F, PRODUCTION_PAYERS, SPONSOR_MATERIAL_TYPES, deliverableField, offerTermsView, parseOfferTerms, termsFromDraft,
  type OfferDeliverableDraft, type OfferTermsDraft,
} from "@/lib/offer-terms";
import { templateSections, type OpportunityTemplate } from "@/lib/opportunities";
import {
  BUILDER_STEPS, MAX_SPOTS, moneyLines, optionFromLots, optionMissing, priceAcceptable, priceCentsOf, savedOptionKeys, spotsOf, stepIndex,
  type BuilderLot, type BuilderStepKey, type OptionRow, type OptionState,
} from "@/lib/sponsorship-builder";
import { IN_KIND_NOTE, hasInKind, sponsorshipKindLabels } from "@/lib/sponsorship-kinds";

/*
  The sponsorships stage: one option at a time.

  Three views. A list of the options this fundraiser already offers, a choice of placement for a
  new one, and the builder for one option, which asks its questions in the product contract's
  order across six steps and keeps every field in the document so a save from any step posts the
  whole option. The summary beside it is the form's state, read as the two sides of the deal.

  It writes through the workspace editor's own action (saveLots, scoped with `only` to the one
  option) and the same field names, so an option built here is the same row the workspace, the
  public page and the purchase snapshot read. Nothing is selected, priced or promised until the
  organizer does it: a template is a name and a drawing, a suggested price is marked as one and
  exists only in music, and a starter idea only points at templates worth a look.

  A category with no templates has nothing to price. Other is that category today, and it gets the
  truthful path: say what visibility is proposed, saved as a private draft, with no invented
  inventory and no publish button.
*/

export type NoTemplatesReason = "music_type" | "none";

export function SponsorshipBuilder({
  runId, categoryLabel, templates, lots, policy, materialsWindowDays, suggestedKeys, kitLabel, goalCents, sponsorPromise, publishable, noTemplatesReason, continueHref, backHref,
}: {
  runId: string;
  categoryLabel: string;
  /** What this fundraiser may offer, plus any retired template it already has spots on. */
  templates: OpportunityTemplate[];
  lots: BuilderLot[];
  policy: readonly PolicyStatement[];
  materialsWindowDays: number | null;
  /** Template keys the starter idea points at. Suggestions only. */
  suggestedKeys: readonly string[];
  kitLabel: string | null;
  goalCents: number | null;
  sponsorPromise: string | null;
  publishable: boolean;
  /** Why there is nothing to choose from, where there is nothing. */
  noTemplatesReason: NoTemplatesReason | null;
  continueHref: string;
  backHref: string;
}) {
  const [options, setOptions] = useState<Record<string, OptionState>>(() => {
    const out: Record<string, OptionState> = {};
    for (const key of savedOptionKeys(lots)) {
      const t = templates.find((x) => x.key === key);
      out[key] = optionFromLots(key, lots, t?.defaultPriceCents ?? null);
    }
    return out;
  });
  const saved = Object.values(options).filter((o) => o.savedSpots > 0);
  const [view, setView] = useState<{ mode: "list" } | { mode: "choose" } | { mode: "edit"; key: string; step: BuilderStepKey }>(
    () => (saved.length === 0 && templates.length > 0 ? { mode: "choose" } : { mode: "list" }),
  );
  const [notice, setNotice] = useState<string | null>(null);

  if (templates.length === 0) {
    return <NoTemplates runId={runId} categoryLabel={categoryLabel} reason={noTemplatesReason ?? "none"} sponsorPromise={sponsorPromise} continueHref={continueHref} backHref={backHref} />;
  }

  const templateOf = (key: string) => templates.find((t) => t.key === key)!;
  const startEditing = (key: string) => {
    setNotice(null);
    setOptions((prev) => (prev[key] ? prev : { ...prev, [key]: optionFromLots(key, lots, templateOf(key).defaultPriceCents) }));
    setView({ mode: "edit", key, step: "placement" });
  };

  if (view.mode === "edit") {
    const option = options[view.key];
    return (
      <OptionForm
        key={view.key}
        runId={runId}
        template={templateOf(view.key)}
        option={option}
        step={view.step}
        policy={policy}
        materialsWindowDays={materialsWindowDays}
        goalCents={goalCents}
        onStep={(step) => setView({ mode: "edit", key: view.key, step })}
        onChange={(next) => setOptions((prev) => ({ ...prev, [view.key]: next }))}
        onLeave={() => {
          // Leaving without saving: an option that was never saved is forgotten; a saved one keeps
          // what the database has, which the next edit reads afresh.
          setOptions((prev) => {
            if (option.savedSpots > 0) return { ...prev, [view.key]: optionFromLots(view.key, lots, templateOf(view.key).defaultPriceCents) };
            const { [view.key]: _gone, ...rest } = prev;
            void _gone;
            return rest;
          });
          setView(saved.length > 0 ? { mode: "list" } : { mode: "choose" });
        }}
        onSaved={(spots) => {
          setOptions((prev) => ({ ...prev, [view.key]: { ...prev[view.key], savedSpots: spots } }));
          setNotice(spots === 0 ? `${templateOf(view.key).name} is no longer offered.` : `${templateOf(view.key).name} saved as a private draft.`);
          setView({ mode: "list" });
        }}
      />
    );
  }

  if (view.mode === "choose") {
    return (
      <PlacementChoice
        templates={templates}
        offeredKeys={saved.map((o) => o.key)}
        suggestedKeys={suggestedKeys}
        kitLabel={kitLabel}
        first={saved.length === 0}
        onChoose={startEditing}
        onCancel={saved.length > 0 ? () => setView({ mode: "list" }) : null}
        backHref={backHref}
      />
    );
  }

  return (
    <div className="min-w-0">
      {notice && <p role="status" className="mb-5 text-[15px]">{notice}</p>}
      <p className="caps mb-3 text-[14px] text-muted">{saved.length === 1 ? "One sponsorship option" : `${saved.length} sponsorship options`}</p>
      <ul className="edge divide-y divide-line bg-panel">
        {saved.map((o) => {
          const t = templateOf(o.key);
          const parsed = parseOfferTerms(termsFromDraft(o.terms));
          const missing = optionMissing(o.row, parsed.ok ? parsed.terms : {});
          const cents = priceCentsOf(o.row.price);
          return (
            <li key={o.key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
              <div className="min-w-0">
                <p className="heading text-[16px]">{t.name}</p>
                <p className="text-[14.5px] text-muted">
                  {cents !== null ? `${formatMoney(cents)} ${o.row.mode === "auction" ? "reserve" : "each"}` : "No price"} · {o.savedSpots} {o.savedSpots === 1 ? "spot" : "spots"}
                  {o.locked ? " · A sponsor has bid or paid, so its terms stay as they are" : missing.length === 0 ? " · Complete" : o.grandfathered ? ` · ${missing.length} still to say, optional: on sale before terms were required` : ` · ${missing.length} still to say`}
                </p>
              </div>
              <button type="button" onClick={() => startEditing(o.key)} className={quietClass}>{o.locked ? "View" : "Edit"}</button>
            </li>
          );
        })}
      </ul>
      {saved.length < templates.length && (
        <p className="mt-5">
          <button type="button" onClick={() => setView({ mode: "choose" })} className={quietClass}>Add another option</button>
        </p>
      )}
      {saved.some((o) => !o.locked && !o.grandfathered && optionMissing(o.row, parseOrEmpty(o.terms)).length > 0) && (
        <p className="mt-5 max-w-[62ch] text-[14.5px] text-accent-ink">
          An option with something still to say is saved as a private draft and keeps the fundraiser from being published until it is finished. A sponsor has to be able to read every term before they pay.
        </p>
      )}
      <StageFooter publishable={publishable} continueHref={continueHref} backHref={backHref} continueLabel="Continue to review" />
    </div>
  );
}

const parseOrEmpty = (draft: OfferTermsDraft) => { const parsed = parseOfferTerms(termsFromDraft(draft)); return parsed.ok ? parsed.terms : {}; };

// ---------------------------------------------------------------
// Choosing a placement
// ---------------------------------------------------------------

function PlacementChoice({ templates, offeredKeys, suggestedKeys, kitLabel, first, onChoose, onCancel, backHref }: {
  templates: OpportunityTemplate[]; offeredKeys: string[]; suggestedKeys: readonly string[]; kitLabel: string | null; first: boolean;
  onChoose: (key: string) => void; onCancel: (() => void) | null; backHref: string;
}) {
  const sections = templateSections(templates.filter((t) => t.active));
  return (
    <div className="min-w-0">
      <p className="max-w-[62ch] text-[15px] text-muted">
        {first ? "Start with one placement: where a sponsor would appear. " : "Choose the placement for the next option. "}
        Each is a name and a drawing, not an offer: nothing is offered, priced or promised until you say so. Your own price is the price.
      </p>
      {kitLabel && suggestedKeys.length > 0 && (
        <p className="mt-3 max-w-[62ch] text-[14.5px] text-accent-ink">The starter idea you began with, {kitLabel}, points at the options marked below. Suggestions, nothing more.</p>
      )}
      {sections.map((section) => (
        <section key={section.group} className="mt-8">
          <p className="caps text-[15px] text-accent-ink">{section.eyebrow}</p>
          {section.heading && <p className="mb-3 text-[15px] text-muted">{section.heading}</p>}
          <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-start">
            <PlacementDiagram group={section.group} name={section.eyebrow.toLowerCase()} />
            <ul className="grid gap-2">
              {section.items.map((t) => {
                const offered = offeredKeys.includes(t.key);
                const suggested = suggestedKeys.includes(t.key);
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => onChoose(t.key)}
                      className={`edge block w-full cursor-pointer p-4 text-left transition-colors hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-line ${suggested ? "border-accent-line" : ""}`}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="heading text-[16px]">{t.name}</span>
                        <span className="caps text-[14px] text-muted">{offered ? "Offered, edit it" : suggested ? "From your starter idea" : "Choose"}</span>
                      </span>
                      {t.seenBy && <span className="mt-1 block text-[14.5px] text-muted">Seen by {t.seenBy}.</span>}
                      {t.blurb && <span className="mt-1 block text-[14.5px] text-muted">{t.blurb}</span>}
                      {t.defaultPriceCents !== null && <span className="mt-1 block text-[14px] text-muted">A suggested price of {formatMoney(t.defaultPriceCents)} per {t.period}, from past sales. Your number wins.</span>}
                      {t.kinds.length > 0 && <span className="mt-1 block text-[14px] text-accent-ink">{sponsorshipKindLabels(t.kinds).join(", ")}.</span>}
                      {hasInKind(t.kinds) && <span className="mt-1 block text-[14px] text-muted">{IN_KIND_NOTE}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
      <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4 border-t border-line pt-6">
        {onCancel ? <button type="button" onClick={onCancel} className={quietClass}>Back to your options</button> : <Link href={backHref} className={quietClass}>Back</Link>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Building one option
// ---------------------------------------------------------------

const quietClass = "caps inline-flex min-h-[44px] cursor-pointer items-center text-[14px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-line disabled:cursor-default disabled:opacity-60";
const hintClass = "mt-2 block text-[14px] normal-case tracking-normal text-muted";
const initialLots: LotsState = { ok: false };

function OptionForm({ runId, template, option, step, policy, materialsWindowDays, goalCents, onStep, onChange, onLeave, onSaved }: {
  runId: string; template: OpportunityTemplate; option: OptionState; step: BuilderStepKey;
  policy: readonly PolicyStatement[]; materialsWindowDays: number | null; goalCents: number | null;
  onStep: (step: BuilderStepKey) => void; onChange: (next: OptionState) => void; onLeave: () => void; onSaved: (spots: number) => void;
}) {
  const [state, action, pending] = useActionState(saveLots, initialLots);
  const [removeState, removeAction, removing] = useActionState(saveLots, initialLots);
  // The save's answer is the parent's to act on (it changes the view), so it is handed up after the
  // render that first sees it, never during one: a parent may not be updated while a child renders.
  const spotsNow = spotsOf(option.row.count);
  useEffect(() => {
    if (state.ok) onSaved(spotsNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer from the server
  }, [state]);
  useEffect(() => {
    if (removeState.ok) onSaved(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer from the server
  }, [removeState]);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const ids = useId();
  const k = template.key;
  const { row, terms: draft, locked } = option;
  const setRow = (patch: Partial<OptionRow>) => onChange({ ...option, row: { ...row, ...patch } });
  const setTerms = (patch: Partial<OfferTermsDraft>) => onChange({ ...option, terms: { ...draft, ...patch } });

  const parsed = useMemo(() => parseOfferTerms(termsFromDraft(draft)), [draft]);
  const terms = parsed.ok ? parsed.terms : {};
  const lot = { reach_estimate: row.reach ? Number(row.reach) : null, reach_basis: row.reachBasis || null };
  const missing = optionMissing(row, terms);
  const priceCents = priceAcceptable(row.price) ? priceCentsOf(row.price) : null;
  const spots = spotsOf(row.count);
  const money = moneyLines({ priceCents, spots, saleMethod: row.mode, goalCents, raisedCents: null });
  const at = stepIndex(step);
  const last = at === BUILDER_STEPS.length - 1;
  const rows = draft.deliverables.length ? draft.deliverables : [{ ...EMPTY_DELIVERABLE_DRAFT }];
  const named = rows.map((d, i) => ({ ...d, index: i })).filter((d) => d.title.trim());
  const setDeliverable = (index: number, patch: Partial<OfferDeliverableDraft>) => setTerms({ deliverables: rows.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  const asksMaterials = draft.materialType !== "" && draft.materialType !== "none";
  const name = (f: string) => `${f}_${k}`;
  const box = { templateKey: k, idPrefix: ids, disabled: locked };

  return (
    <>
    <form
      action={action}
      noValidate
      className="min-w-0"
      onSubmit={(e) => {
        // The one thing the database cannot store an option without. Said here, on the step it
        // belongs to, rather than as a refusal from the server after everything else was typed.
        if (!priceAcceptable(row.price)) {
          e.preventDefault();
          setPriceNotice("Set a price between $10 and $100,000 before saving. Everything else can wait.");
          onStep("price");
        }
      }}
    >
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="only" value={k} />
      <input type="hidden" name={`on_${k}`} value="1" />

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="heading text-[clamp(20px,2.4vw,24px)]">{template.name}</h2>
        <span className="caps text-[14px] text-muted">{option.savedSpots > 0 ? "Saved option" : "New option"}</span>
      </div>
      {locked && (
        <p className="mb-5 flex max-w-[62ch] items-start gap-2.5 text-[14.5px] text-accent-ink">
          <Locked size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          A sponsor has already bid on or paid for this option, so its price and its terms stay as they are: they are what that sponsor bought. Spots can still be added.
        </p>
      )}

      <ol className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Steps of this option">
        {BUILDER_STEPS.map((s, i) => (
          <li key={s.key} aria-current={s.key === step ? "step" : undefined}>
            <button type="button" onClick={() => onStep(s.key)} className="block w-full cursor-pointer text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-line">
              <span aria-hidden="true" className={`block h-[3px] w-full ${i <= at ? "bg-accent" : "bg-line"} ${i < at ? "opacity-60" : ""}`} />
              <span className={`caps mt-1.5 block truncate text-[14px] ${s.key === step ? "text-ink" : "text-muted"}`}>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="heading mb-5 text-[18px]">{BUILDER_STEPS[at].question}</p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="min-w-0">
          {/* ---------------------------------------------------- 1 Placement */}
          <section hidden={step !== "placement"}>
            <PlacementDiagram group={template.group} name={template.name} className="mb-5 max-w-[320px]" />
            {template.seenBy && <p className="mb-4 text-[14.5px] text-muted">Door Money&apos;s note on this placement: seen by {template.seenBy}. A description, not a term of your offer.</p>}
            <Field {...box} field={F.placement} label="Exactly where it appears" value={draft.placement} onValue={(v) => setTerms({ placement: v })} placeholder="Above the entrance, on the front of the riser, in the end credits" />
            <Field {...box} field={F.format} label="In what form" value={draft.format} onValue={(v) => setTerms({ format: v })} placeholder="A printed panel, a screen credit, a spoken line, a printed card" />
            <Field {...box} field={F.appearance} label="Size or prominence (only if it is a term)" value={draft.appearance} onValue={(v) => setTerms({ appearance: v })} placeholder="Optional" />
          </section>

          {/* ---------------------------------------------------- 2 Appearances */}
          <section hidden={step !== "appearances"}>
            <div className="grid gap-x-4 md:grid-cols-[140px_1fr]">
              <Field {...box} field={F.quantity} label="How many times" inputMode="numeric" value={draft.quantity} onValue={(v) => setTerms({ quantity: v.replace(/[^0-9]/g, "") })} />
              <Field {...box} field={F.unit} label="Each one is" value={draft.unit} onValue={(v) => setTerms({ unit: v })} placeholder="A night, a fixture, a screening, a post, a service" />
            </div>
            <Field {...box} field={F.schedule} label="Or describe the schedule" value={draft.schedule} onValue={(v) => setTerms({ schedule: v })} help="Where a count does not say it on its own: every home fixture, the first four nights." />
            <fieldset className="mt-6 border-t border-line pt-5">
              <legend className={labelClass}>When it appears</legend>
              <div className="grid gap-x-4 md:grid-cols-3">
                <Field {...box} field={F.windowStart} label="From" type="date" value={draft.windowStart} onValue={(v) => setTerms({ windowStart: v })} />
                <Field {...box} field={F.windowEnd} label="Until" type="date" value={draft.windowEnd} onValue={(v) => setTerms({ windowEnd: v })} />
                <Field {...box} field={F.deadline} label="Everything done by" type="date" value={draft.deadline} onValue={(v) => setTerms({ deadline: v })} />
              </div>
              <details className="mt-2">
                <summary className="caps cursor-pointer text-[14px] text-accent-ink">Time zone</summary>
                <Field {...box} field={F.timezone} label="The zone those dates are read in" value={draft.timezone} onValue={(v) => setTerms({ timezone: v })} placeholder="America/New_York" />
              </details>
            </fieldset>
            <fieldset className="mt-6 border-t border-line pt-5">
              <legend className={labelClass}>Who sees it</legend>
              <label className={`${labelClass} my-4 block`}>The audience for this placement
                <textarea name={name(F.audience)} value={draft.audience} disabled={locked} rows={2} onChange={(e) => setTerms({ audience: e.target.value })} placeholder="Who is in the space, and what brought them" className={inputClass} />
              </label>
            </fieldset>
          </section>

          {/* ---------------------------------------------------- 3 Price */}
          <section hidden={step !== "price"}>
            {priceNotice && <p role="alert" className="mb-4 text-[14.5px] text-accent-ink">{priceNotice}</p>}
            <div className="grid gap-x-4 md:grid-cols-[1fr_120px_1fr]">
              <label className={`${labelClass} my-4 block`}>Price per spot, dollars
                <input name={`price_${k}`} inputMode="decimal" value={row.price} readOnly={locked} onChange={(e) => setRow({ price: e.target.value })} aria-invalid={priceNotice ? true : undefined} className={inputClass} />
                <span className={hintClass}>
                  {template.defaultPriceCents !== null
                    ? `Door Money suggests ${formatMoney(template.defaultPriceCents)} per ${template.period}, from past sales. Your number is the price.`
                    : "No price is suggested for this kind of work yet. Your number is the only number."}
                </span>
              </label>
              <label className={`${labelClass} my-4 block`}>Spots
                <input name={`count_${k}`} type="number" min={1} max={MAX_SPOTS} value={row.count} onChange={(e) => setRow({ count: e.target.value.replace(/[^0-9]/g, "").slice(0, 1) })} onBlur={() => setRow({ count: String(spotsOf(row.count)) })} className={inputClass} />
                <span className={hintClass}>One sponsor per spot, up to {MAX_SPOTS}.</span>
              </label>
              <label className={`${labelClass} my-4 block`}>Sold as
                <select name={`mode_${k}`} value={row.mode} disabled={locked} onChange={(e) => setRow({ mode: e.target.value === "auction" ? "auction" : "fixed" })} className={inputClass}>
                  <option value="fixed">Fixed price</option>
                  <option value="auction">Bidding, the price is the reserve</option>
                </select>
                {locked && <input type="hidden" name={`mode_${k}`} value={row.mode} />}
              </label>
            </div>
            {row.mode === "auction" && (
              <Field {...box} field="buynow" label="Take it now, dollars (optional)" inputMode="decimal" value={row.buyNow} disabled={false} readOnly={locked} onValue={(v) => setRow({ buyNow: v })} help="A price that ends the bidding outright. Has to be above the reserve." />
            )}
            <dl className="edge mt-4 grid gap-2 bg-panel p-4">
              {money.slice(0, 3).map((m) => (
                <div key={m.key} className="grid grid-cols-[1fr_auto] gap-x-4">
                  <dt className="text-[14.5px] text-muted">{m.label}</dt>
                  <dd className="heading text-right text-[15px]">{m.value}</dd>
                  {m.note && <dd className="col-span-2 text-[14px] text-muted">{m.note}</dd>}
                </div>
              ))}
            </dl>
            <p className="mt-3 max-w-[62ch] text-[14.5px] text-muted">
              The funding goal{goalCents !== null ? `, ${formatMoney(goalCents)},` : ""} is what the work needs and lives on the funding stage. An option&apos;s price is what one sponsor pays. Neither is money raised.
            </p>
            <details className="mt-6 border-t border-line pt-4" open={row.reach ? true : undefined}>
              <summary className="caps cursor-pointer text-[14px] text-accent-ink">Expected reach (optional)</summary>
              <div className="grid gap-x-4 md:grid-cols-[180px_1fr]">
                <label className={`${labelClass} my-4 block`}>People reached
                  <input name={`reach_${k}`} inputMode="numeric" value={row.reach} onChange={(e) => setRow({ reach: e.target.value.replace(/[^0-9]/g, "") })} className={inputClass} />
                </label>
                <label className={`${labelClass} my-4 block`}>How do you know?
                  <input name={`reachbasis_${k}`} value={row.reachBasis} onChange={(e) => setRow({ reachBasis: e.target.value })} placeholder={row.reach ? "Average attendance over the last six" : "Only needed if you give a number"} className={inputClass} />
                  <span className={hintClass}>An estimate, shown as one, with its basis. A number cannot be saved without the reason for it. Never a promise of impressions or sales.</span>
                </label>
              </div>
            </details>
          </section>

          {/* ---------------------------------------------------- 4 Materials */}
          <section hidden={step !== "materials"}>
            <Choice name={name(F.materialType)} label="What the sponsor sends" value={draft.materialType} disabled={locked} onValue={(v) => setTerms({ materialType: v })} options={SPONSOR_MATERIAL_TYPES} />
            {draft.materialType !== "none" && (
              <>
                <Field {...box} field={F.materials} label="What exactly" value={draft.materials} onValue={(v) => setTerms({ materials: v })} placeholder="A high resolution file, or the wording as it should read" />
                <Field {...box} field={F.materialsDays} label="Days to send it, counted from the day they pay" inputMode="numeric" value={draft.materialsDays} onValue={(v) => setTerms({ materialsDays: v.replace(/[^0-9]/g, "") })}
                  placeholder={materialsWindowDays ? String(materialsWindowDays) : "Optional"} help={materialsWindowDays ? `Blank means Door Money's ${materialsWindowDays} days.` : undefined} />
              </>
            )}
            {(asksMaterials || draft.materials.trim()) && (
              <fieldset className="mt-6 border-t border-line pt-5">
                <legend className={labelClass}>Approval</legend>
                <div className="grid gap-x-4 md:grid-cols-[1fr_160px]">
                  <Choice name={name(F.approvalRule)} label="Who accepts it" value={draft.approvalRule} disabled={locked} onValue={(v) => setTerms({ approvalRule: v })} options={APPROVAL_RULES} />
                  <Field {...box} field={F.approvalDays} label="Days to answer" inputMode="numeric" value={draft.approvalDays} onValue={(v) => setTerms({ approvalDays: v.replace(/[^0-9]/g, "") })} placeholder="Optional" help="Counted from the day it arrives." />
                </div>
                <Field {...box} field={F.approvalNote} label="How you will answer" value={draft.approvalNote} onValue={(v) => setTerms({ approvalNote: v })} placeholder="Optional" />
              </fieldset>
            )}
            {(draft.materialType === "none" || !asksMaterials) && (
              // The rule still has to travel, so the server reads what was chosen even while the fieldset is folded away.
              <>
                <input type="hidden" name={name(F.approvalRule)} value={draft.approvalRule} />
                <input type="hidden" name={name(F.approvalDays)} value={draft.approvalDays} />
                <input type="hidden" name={name(F.approvalNote)} value={draft.approvalNote} />
              </>
            )}
            {draft.materialType === "none" && (
              <>
                <input type="hidden" name={name(F.materials)} value="" />
                <input type="hidden" name={name(F.materialsDays)} value="" />
              </>
            )}
            <p className="mt-4 max-w-[62ch] text-[14px] text-muted">{LATE_MATERIALS_CONSEQUENCE}</p>
          </section>

          {/* ---------------------------------------------------- 5 Production and exclusivity */}
          <section hidden={step !== "production"}>
            <Check name={name(F.productionIncluded)} label="Producing it is included in the price" checked={draft.productionIncluded} disabled={locked} onValue={(v) => setTerms({ productionIncluded: v })} />
            {!draft.productionIncluded && (
              <div className="grid gap-x-4 md:grid-cols-[1fr_170px]">
                <Choice name={name(F.productionPayer)} label="Who pays to produce it" value={draft.productionPayer} disabled={locked} onValue={(v) => setTerms({ productionPayer: v })} options={PRODUCTION_PAYERS} />
                <Field {...box} field={F.productionCost} label="Cost, dollars" inputMode="decimal" value={draft.productionCost} onValue={(v) => setTerms({ productionCost: v })} placeholder="Optional" />
              </div>
            )}
            {draft.productionIncluded && (
              <>
                <input type="hidden" name={name(F.productionPayer)} value={draft.productionPayer} />
                <input type="hidden" name={name(F.productionCost)} value={draft.productionCost} />
              </>
            )}
            <Field {...box} field={F.productionNote} label="What it covers" value={draft.productionNote} onValue={(v) => setTerms({ productionNote: v })} placeholder="Optional" />
            <p className="max-w-[62ch] text-[14px] text-muted">Door Money moves the sponsorship price and nothing else. A production cost a sponsor covers, and any product or service they supply, is settled between the two of you.</p>
            <fieldset className="mt-6 border-t border-line pt-5">
              <legend className={labelClass}>Exclusivity</legend>
              <Check name={name(F.exclusive)} label="This sponsorship is exclusive" checked={draft.exclusive} disabled={locked} onValue={(v) => setTerms({ exclusive: v })} />
              {draft.exclusive ? (
                <div className="grid gap-x-4 md:grid-cols-2">
                  <Field {...box} field={F.exclusiveScope} label="Exclusive to what" value={draft.exclusiveScope} onValue={(v) => setTerms({ exclusiveScope: v })} placeholder="One business of this kind" />
                  <Field {...box} field={F.exclusiveNote} label="What that means here" value={draft.exclusiveNote} onValue={(v) => setTerms({ exclusiveNote: v })} placeholder="Optional" />
                </div>
              ) : (
                <>
                  <input type="hidden" name={name(F.exclusiveScope)} value="" />
                  <input type="hidden" name={name(F.exclusiveNote)} value="" />
                </>
              )}
            </fieldset>
          </section>

          {/* ---------------------------------------------------- 6 Deliverables and evidence */}
          <section hidden={step !== "deliver"}>
            <p className="max-w-[62ch] text-[14.5px] text-muted">One line per promise. A line with nothing owed on it is ignored, whatever else is on it.</p>
            {rows.map((d, i) => (
              <div key={i} className="mt-3 grid gap-x-4 border-t border-line pt-3 first:border-t-0 md:grid-cols-[1fr_110px_170px]">
                <label className={`${labelClass} my-2 block`}>What is owed
                  <input name={deliverableField("title", i, k)} value={d.title} disabled={locked} onChange={(e) => setDeliverable(i, { title: e.target.value })} placeholder={i === 0 ? "Name on the printed program" : "Another promise"} className={inputClass} />
                </label>
                <label className={`${labelClass} my-2 block`}>How many
                  <input name={deliverableField("qty", i, k)} inputMode="numeric" value={d.quantity} disabled={locked} onChange={(e) => setDeliverable(i, { quantity: e.target.value.replace(/[^0-9]/g, "") })} className={inputClass} />
                </label>
                <label className={`${labelClass} my-2 block`}>Due by
                  <input name={deliverableField("due", i, k)} type="date" value={d.dueOn} disabled={locked} onChange={(e) => setDeliverable(i, { dueOn: e.target.value })} className={inputClass} />
                </label>
                <label className={`${labelClass} my-2 block md:col-span-3`}>In your own words
                  <input name={deliverableField("note", i, k)} value={d.description} disabled={locked} onChange={(e) => setDeliverable(i, { description: e.target.value })} placeholder="Optional" className={inputClass} />
                </label>
                {d.title.trim() ? (
                  <div className="grid gap-x-4 md:col-span-3 md:grid-cols-2">
                    <Choice name={deliverableField("evidence", i, k)} label="Documented by" value={d.evidenceMethod} disabled={locked} onValue={(v) => setDeliverable(i, { evidenceMethod: v })} options={EVIDENCE_KINDS.map((kind) => ({ key: kind, label: EVIDENCE_LABELS[kind] }))} />
                    <Choice name={deliverableField("visibility", i, k)} label="Who sees the documentation" value={d.evidenceVisibility} disabled={locked} onValue={(v) => setDeliverable(i, { evidenceVisibility: v })} options={EVIDENCE_VISIBILITIES} />
                  </div>
                ) : (
                  <span hidden>
                    <input type="hidden" name={deliverableField("evidence", i, k)} value={d.evidenceMethod} readOnly />
                    <input type="hidden" name={deliverableField("visibility", i, k)} value={d.evidenceVisibility} readOnly />
                  </span>
                )}
              </div>
            ))}
            {rows.length < DELIVERABLE_LIMIT && !locked && (
              <p className="mt-3"><button type="button" onClick={() => setTerms({ deliverables: [...rows, { ...EMPTY_DELIVERABLE_DRAFT }] })} className={quietClass}>Add another deliverable</button></p>
            )}
            <p className="mt-4 max-w-[62ch] text-[14px] text-muted">
              Documentation comes from you and Door Money passes it on: it never checks whether it is good and never claims to have inspected anything. Each item is private to the sponsor unless you publish that one item afterwards, and an item showing a minor is never published.
            </p>
            <fieldset className="mt-6 border-t border-line pt-5">
              <legend className={labelClass}>Cancellation and refunds: Door Money&apos;s policy decides</legend>
              {policy.map((p) => (
                <p key={p.key} className="max-w-[62ch] text-[14.5px]"><span className="text-muted">{p.label}: </span>{p.sentence}</p>
              ))}
              <details className="mt-3">
                <summary className="caps cursor-pointer text-[14px] text-accent-ink">Add a note beside the policy</summary>
                <p className="mt-2 max-w-[62ch] text-[14px] text-muted">{DISPLAY_ONLY_NOTE}</p>
                <div className="grid gap-x-4 md:grid-cols-2">
                  <Field {...box} field={F.cancellationNote} label="Your note on cancelling" value={draft.cancellationNote} onValue={(v) => setTerms({ cancellationNote: v })} placeholder="Optional, shown to sponsors" />
                  <Field {...box} field={F.refundNote} label="Your note on refunds" value={draft.refundNote} onValue={(v) => setTerms({ refundNote: v })} placeholder="Optional, shown to sponsors" />
                </div>
              </details>
            </fieldset>
            {named.length === 0 && <p className="mt-4 text-[14.5px] text-muted">Name at least one deliverable. It is what a sponsor is buying, and what your share is released against.</p>}
          </section>
        </div>

        <SponsorshipOptionSummary
          className="self-start lg:sticky lg:top-24"
          input={{
            templateName: template.name,
            terms: offerTermsView(terms, lot),
            priceCents, saleMethod: row.mode, buyNowCents: row.mode === "auction" && row.buyNow ? priceCentsOf(row.buyNow) : null, spots,
            policy, money, missing, locked, grandfathered: option.grandfathered,
          }}
        />
      </div>

      <div className="mt-10 border-t border-line pt-6">
        <p className="mb-5 flex items-center gap-2.5 text-[14.5px] text-muted">
          <Locked size={16} aria-hidden="true" className="flex-none" />
          A private draft. The option is saved when you choose Save, and not before. Moving between steps saves nothing and loses nothing.
        </p>
        {(state.error || (!parsed.ok && parsed.error)) && (
          <p role="alert" tabIndex={-1} className="mb-5 max-w-[62ch] text-[15px] text-accent-ink outline-none">{state.error ?? (!parsed.ok ? parsed.error : null)}</p>
        )}
        {removeState.error && <p role="alert" className="mb-5 max-w-[62ch] text-[15px] text-accent-ink">{removeState.error}</p>}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          {/* Two elements, keyed apart. Reusing one button and flipping its type from "button" to
              "submit" inside the click handler lets the browser's default action for that same
              click submit the form, one step early. */}
          {last ? (
            <Button key="save" type="submit" disabled={pending || removing}>{pending ? "Saving…" : locked ? "Save the spots" : "Save this option"}</Button>
          ) : (
            <Button key="next" type="button" arrow onClick={() => onStep(BUILDER_STEPS[at + 1].key)}>Next</Button>
          )}
          <button type="button" onClick={() => (at === 0 ? onLeave() : onStep(BUILDER_STEPS[at - 1].key))} className={quietClass}>
            {at === 0 ? (option.savedSpots > 0 ? "Back to your options" : "Choose a different placement") : "Back"}
          </button>
          {!last && <button type="submit" disabled={pending || removing} className={quietClass}>{pending ? "Saving…" : "Save what is here"}</button>}
        </div>
      </div>

      {option.savedSpots > 0 && !locked && (
        <div className="mt-8 border-t border-line pt-5">
          {!confirmRemove ? (
            <button type="button" onClick={() => setConfirmRemove(true)} className="caps cursor-pointer text-[14px] text-muted hover:text-accent-ink">Stop offering this option</button>
          ) : (
            <div className="edge max-w-[620px] bg-panel p-5">
              <p className="text-[15px]">This takes {template.name} off the fundraiser. Nothing has been bought on it, so nothing is refunded. Its terms are not kept.</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {/* A second, tiny form: the same action, scoped to this option, with it switched off. */}
                <button type="submit" form={`${ids}-remove`} disabled={removing} className={quietClass}>{removing ? "Removing…" : "Yes, stop offering it"}</button>
                <button type="button" onClick={() => setConfirmRemove(false)} className={quietClass}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
    {/* Its own form, beside the builder's rather than inside it: a form inside a form is not a form. */}
    {option.savedSpots > 0 && !locked && (
      <form id={`${ids}-remove`} action={removeAction} hidden>
        <input type="hidden" name="run_id" value={runId} />
        <input type="hidden" name="only" value={k} />
      </form>
    )}
    </>
  );
}

// ---------------------------------------------------------------
// A category with nothing to price
// ---------------------------------------------------------------

const initialDraft: DraftState = { ok: false };

function NoTemplates({ runId, categoryLabel, reason, sponsorPromise, continueHref, backHref }: {
  runId: string; categoryLabel: string; reason: NoTemplatesReason; sponsorPromise: string | null; continueHref: string; backHref: string;
}) {
  const [state, action, pending] = useActionState(saveSponsorVisibility, initialDraft);
  const [value, setValue] = useState(sponsorPromise ?? "");
  const [dirty, setDirty] = useState(false);
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    setDirty(false);
  }
  return (
    <div className="min-w-0">
      {reason === "music_type" ? (
        <p className="max-w-[62ch] text-[15px]">
          Music&apos;s sponsorship options depend on what kind of musician this is: a touring band, a house act or a soloist.{" "}
          <Link href="/dashboard/act" className="text-accent-ink underline decoration-1 underline-offset-4">Say which on the organizer page</Link>, and the options appear here.
        </p>
      ) : (
        <p className="max-w-[62ch] text-[15px]">
          {categoryLabel} has no sponsorship option templates yet, so no priced option can be saved on this fundraiser and nothing on it can be bought. What you can do is say what visibility you propose, in your own words. It is saved as a private draft with the fundraiser, and it is what Door Money reads to learn what this kind of work needs.
        </p>
      )}
      {reason === "none" && (
        <form action={action} noValidate onChange={() => setDirty(true)} className="mt-6">
          <input type="hidden" name="id" value={runId} />
          <label className={`${labelClass} block`}>What could a sponsor count on receiving?
            <textarea name="sponsor_promise" value={value} onChange={(e) => setValue(e.target.value)} rows={5} aria-invalid={state.errors?.sponsor_promise ? true : undefined} className={inputClass} />
            <span className={hintClass}>Where a sponsor&apos;s name would appear, how many times, for how long, and how you would document it. Only what you can deliver: no audience numbers you cannot stand behind.</span>
          </label>
          {state.error && <p role="alert" className="my-4 text-[15px] text-accent-ink">{state.error}</p>}
          {state.ok && !dirty && <p role="status" className="my-4 text-[15px]">Saved as a private draft.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save the description"}</Button>
          </div>
        </form>
      )}
      <StageFooter publishable={false} continueHref={continueHref} backHref={backHref} continueLabel="Continue to review" />
    </div>
  );
}

// ---------------------------------------------------------------

function StageFooter({ publishable, continueHref, backHref, continueLabel }: { publishable: boolean; continueHref: string; backHref: string; continueLabel: string }) {
  return (
    <div className="mt-10 border-t border-line pt-6">
      <p className="mb-5 flex items-center gap-2.5 text-[14.5px] text-muted">
        <Locked size={16} aria-hidden="true" className="flex-none" />
        {publishable
          ? "Nothing is public. Publishing is a separate decision, made on the review stage."
          : "Nothing is public, and this category cannot be published or bought yet. Everything here stays a private draft."}
      </p>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        <Link href={continueHref} className="group caps inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-3 border border-accent-line bg-accent px-7 py-4 text-[14px] tracking-[0.16em] text-on-accent no-underline">
          {continueLabel} <span aria-hidden="true">&rarr;</span>
        </Link>
        <Link href={backHref} className={quietClass}>Back</Link>
      </div>
      <p className="mt-6 text-[14.5px] text-muted">Next: read the fundraiser the way a sponsor would, and decide whether to publish.</p>
    </div>
  );
}

const EVIDENCE_LABELS: Record<(typeof EVIDENCE_KINDS)[number], string> = {
  photo: "A photograph", link: "A link", document: "A document", note: "Your own written record",
};

type FieldProps = {
  field: string; templateKey: string; idPrefix: string; label: string; help?: string; value: string; onValue: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name">;

/** One labelled box, posted under `<field>_<template key>`. Declared at module level so React never remounts it mid-keystroke. */
function Field({ field, templateKey, idPrefix, label, help, value, onValue, ...rest }: FieldProps) {
  const helpId = help ? `${idPrefix}-${field}-help` : undefined;
  return (
    <label className={`${labelClass} my-4 block`}>{label}
      <input name={`${field}_${templateKey}`} value={value} aria-describedby={helpId} onChange={(e) => onValue(e.target.value)} {...rest} className={inputClass} />
      {help && <span id={helpId} className={hintClass}>{help}</span>}
    </label>
  );
}

function Choice({ name, label, value, options, disabled, onValue }: { name: string; label: string; value: string; disabled?: boolean; options: readonly { key: string; label: string }[]; onValue: (v: string) => void }) {
  return (
    <label className={`${labelClass} my-4 block`}>{label}
      <select name={name} value={value} disabled={disabled} onChange={(e) => onValue(e.target.value)} className={inputClass}>
        <option value="">Not said</option>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {disabled && <input type="hidden" name={name} value={value} />}
    </label>
  );
}

function Check({ name, label, checked, disabled, onValue }: { name: string; label: string; checked: boolean; disabled?: boolean; onValue: (v: boolean) => void }) {
  return (
    <label className="my-3 flex items-center gap-2.5 text-[15px]">
      <input type="checkbox" name={name} value="1" checked={checked} disabled={disabled} onChange={(e) => onValue(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
      {label}
      {disabled && checked && <input type="hidden" name={name} value="1" />}
    </label>
  );
}
