"use client";
import { useActionState, useEffect, useId, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { saveDraftForm } from "@/app/actions/drafts";
import type { FundraiserDraft } from "@/lib/fundraiser-drafts";
import { categoryFormNote, detailFields, titleLabel, type DetailField } from "@/lib/categories";
import { categoryLabel } from "@/lib/category-words";
import { STAGE_HEADING, STAGE_LABEL, type FormStage } from "@/lib/fundraiser-stages";
import { initialsFor } from "@/lib/organizer-setup";
import { AVAILABILITY_NOTE } from "@/lib/starting-categories";
import { STARTER_KIT_ERROR_MESSAGE, starterKit, starterKitGroups, type KitCategory, type KitTextField, type StarterKitError } from "@/lib/starter-kits";
import { initialKitDraft, kitDraftReducer, type KitDraftAction, type KitDraftState } from "@/lib/starter-kit-draft";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { Locked, Organization, UserProfile } from "@/components/dashboard/icons";
import { ActivityLocationsField, isBlankLocation, type LocationRow } from "@/components/ActivityLocationsField";
import { FundraiserDraftPreview, type PreviewOrganizer } from "@/components/FundraiserDraftPreview";
import { StarterKitPicker } from "@/components/StarterKitPicker";
import { DiscoveryTagFields } from "@/components/DiscoveryTagFields";
import { EMPTY_REGISTRY, type DiscoveryRegistry } from "@/lib/discovery";
import type { KitRecommendation } from "@/lib/starter-kit-recommendations";

/*
  The draft, in two stages: the project, then the funding.

  One form, drawn one stage at a time. Every field of both stages is in the document whatever the
  stage, the other stage's folded away with `hidden`, so a save from either stage writes the whole
  draft and a value typed on one stage is still there after Back. Nothing is saved by moving: the
  three buttons at the bottom all save, and the stage a save lands on is in the address afterwards
  (src/lib/fundraiser-stages.ts), so a reload keeps the place.

  What a stage asks for is the shared contract's questions (what the funding enables, who it
  reaches, what a sponsor receives) with the category's own details beside them, from the registry.
  The starter kit rules are the reducer in src/lib/starter-kit-draft.ts and are unchanged: a kit
  fills examples into empty fields of its own category, and every example is an ordinary input.
  A category with no kits, which is Other today and any category added to the registry tomorrow,
  starts from scratch without being told it is missing something.

  The preview beside the form is the form's state and nothing more. Nothing is saved by looking at
  it, and the line under the buttons says when something was.
*/

/**
 * Starter kits, on a new fundraiser only. A saved draft is edited as it is: the kit was creation
 * context, and it is not stored with the draft (src/lib/starter-kit-draft.ts).
 */
export type StarterKitContext = {
  /** A kit named in the link, already checked against the registry. */
  initialKitKey: string | null;
  /** Why the link's kit was refused. */
  linkError: StarterKitError | null;
  /** The sponsorship options each kit points at, narrowed to what this organizer could offer. Names only. */
  recommendations: Record<string, KitRecommendation[]>;
};

/** Who the fundraiser is created under, for the card at the top of the project and for the preview. */
export type DraftFormOrganizer = PreviewOrganizer & {
  slug: string | null;
  /** The site's address without the scheme, for showing the public link. */
  host: string;
};

/** What the last save said, keyed by input name. */
export type DraftFieldErrors = Record<string, string>;

const EXAMPLE_HINT = "An example from the starter kit. Change it to fit your own work.";
const hintClass = "mt-2 block text-[14px] normal-case tracking-normal text-muted";
const errorClass = "mt-2 block text-[14.5px] normal-case tracking-normal text-accent-ink";
const choiceClass = "caps edge min-w-[200px] flex-1 cursor-pointer bg-panel p-3 text-center text-[14.5px] has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:checked]:border-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-line";
const quietClass = "caps inline-flex min-h-[44px] cursor-pointer items-center text-[14px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-line disabled:cursor-default disabled:opacity-60";

/** Which stage each input is drawn on, for saying where an error is when it is on the other one. */
const FIELD_STAGE: Record<string, FormStage> = {
  category_key: "project", title: "project", description: "project", audience_description: "project",
  purpose: "funding", sponsor_promise: "funding", goal_amount: "funding", goal_currency: "funding", activity_mode: "funding", activity_locations: "funding",
  fundraising_starts_on: "funding", fundraising_ends_on: "funding", starts_on: "funding", ends_on: "funding", timezone: "funding",
  kind: "funding", show_count: "funding", bidding_closes_utc: "funding", expected_attendance: "funding", discovery_tags: "funding",
};

/** The fields a kit never touches, controlled here so the preview can read them. */
type Facts = {
  description: string; goal_amount: string;
  fundraising_starts_on: string; fundraising_ends_on: string; starts_on: string; ends_on: string; timezone: string;
  show_count: string; expected_attendance: string; bidding_closes_utc: string;
};

const asText = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function initialFacts(draft: FundraiserDraft | null): Facts {
  return {
    description: draft?.description ?? "",
    goal_amount: draft?.goal_cents == null ? "" : (draft.goal_cents / 100).toFixed(2),
    fundraising_starts_on: draft?.fundraising_starts_on ?? "",
    fundraising_ends_on: draft?.fundraising_ends_on ?? "",
    starts_on: draft?.starts_on ?? "",
    ends_on: draft?.ends_on ?? "",
    timezone: draft?.timezone ?? "",
    show_count: asText(draft?.show_count),
    expected_attendance: asText(draft?.expected_attendance),
    bidding_closes_utc: draft?.bidding_closes_at ? new Date(draft.bidding_closes_at).toISOString().slice(0, 16) : "",
  };
}

export function FundraiserDraftForm({
  draft, categories, musicOrganizer, starterKits, discovery = EMPTY_REGISTRY, stage = "project", organizer = null, carriedKit = null, backHref = "/dashboard/runs",
}: {
  draft: FundraiserDraft | null; categories: KitCategory[]; musicOrganizer: boolean; starterKits?: StarterKitContext;
  /** The discovery facets and tags to offer. Empty draws no discovery questions. */
  discovery?: DiscoveryRegistry;
  /** The stage to draw. The other stage's fields stay in the form, folded away. */
  stage?: FormStage;
  /** Who this is created under. Null draws no card and no name in the preview. */
  organizer?: DraftFormOrganizer | null;
  /** The starter kit the address carried in on a saved draft, to carry it one stage further. Never stored. */
  carriedKit?: string | null;
  /** Where Back goes from the first stage. */
  backHref?: string;
}) {
  const [state, action, pending] = useActionState(saveDraftForm, { ok: false });
  const [form, dispatch] = useReducer(
    (current: KitDraftState, change: KitDraftAction) => kitDraftReducer(current, change, categories),
    undefined,
    () => initialKitDraft({ draft, musicOrganizer, categories, kitKey: starterKits?.initialKitKey, linkError: starterKits?.linkError }),
  );
  const [facts, setFacts] = useState<Facts>(() => initialFacts(draft));
  const [locations, setLocations] = useState<LocationRow[]>(() =>
    (draft?.activity_locations ?? []).map((l) => ({ city: l.city ?? "", region: l.region ?? "", country_code: l.country_code ?? "" })),
  );
  /**
   * Discovery tags are the organizer's own answer and are never part of a starter kit: a kit fills
   * in examples, and a tag is a fact about this fundraiser. Kept in plain state beside the reducer
   * for that reason. Switching category needs no cleanup here, because only a box that is drawn can
   * be submitted and DiscoveryTagFields draws only what the new category may use.
   */
  const [tags, setTags] = useState<string[]>(() => draft?.discovery_tags ?? []);
  const toggleTag = (key: string, on: boolean) => setTags((current) => (on ? [...current, key] : current.filter((k) => k !== key)));
  // Whether anything changed since the last answer from the server, so "Draft saved" is only said
  // while it is true. Reset when a new answer arrives, during the render that first sees it.
  const [dirty, setDirty] = useState(false);
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    setDirty(false);
  }
  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) alertRef.current?.focus();
  }, [state]);
  const ids = useId();

  const { fields } = form;
  const category = fields.category_key;
  const categoryRow = categories.find((item) => item.key === category) ?? null;
  const detailInputs = detailFields(category, categoryRow?.detail_keys ?? []);
  const formNote = categoryFormNote(category);
  const kit = starterKit(form.kitKey);
  const group = starterKitGroups(categories).find((g) => g.category.key === category) ?? null;
  // The choice between an idea and scratch is offered while there is a choice to make: before a
  // category is chosen, and for a category that has kits. A category with none simply starts.
  const offerKits = Boolean(starterKits) && (category === "" || group !== null);
  /** True while a field still holds the kit's own example, which is when the hint under it is true. */
  const isExample = (name: KitTextField) => Boolean(kit?.prefill[name]) && fields[name] === kit?.prefill[name];
  const set = (name: KitTextField | "activity_mode" | "kind") => (value: string) => dispatch({ type: "field", name, value });
  const setFact = (name: keyof Facts) => (value: string) => setFacts((current) => ({ ...current, [name]: value }));
  const errors: DraftFieldErrors = state.errors ?? {};
  const errorFor = (name: string) => errors[name];
  const elsewhere = Object.keys(errors).filter((name) => FIELD_STAGE[name] && FIELD_STAGE[name] !== stage);
  const heading = STAGE_HEADING[stage];
  const kitForAddress = form.kitKey ?? carriedKit;
  const hasMusicFacts = Boolean(fields.kind || facts.show_count || facts.bidding_closes_utc);

  const serializedLocations = JSON.stringify(
    locations.filter((row) => !isBlankLocation(row)).map((row) => ({ city: row.city.trim() || null, region: row.region.trim() || null, country_code: row.country_code || null })),
  );

  return <form action={action} noValidate onChange={() => setDirty(true)} className="min-w-0">
    {draft && <input type="hidden" name="id" value={draft.id} />}
    <input type="hidden" name="stage" value={stage} />
    {/* Read once, after each save, to carry the kit to the next stage. Never stored with the draft. */}
    {kitForAddress && <input type="hidden" name="starter_kit" value={kitForAddress} />}
    <input type="hidden" name="activity_locations" value={serializedLocations} />
    <input type="hidden" name="goal_currency" value="USD" />
    <input type="hidden" name="delivery_due_at" value={draft?.delivery_due_at ?? ""} />

    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
      <div className="min-w-0">
        {/* ------------------------------------------------------------ Project */}
        <section hidden={stage !== "project"} aria-labelledby={`${ids}-project`}>
          <h2 id={`${ids}-project`} className="sr-only">Project</h2>
          {organizer && <OrganizerCard organizer={organizer} href={draft ? "/dashboard/act" : `/dashboard/act/new${form.kitKey ? `?template=${form.kitKey}` : ""}`} label={draft ? "Edit" : "Change"} />}

          <label className={labelClass}>Category
            <select name="category_key" value={category} onChange={(e) => dispatch({ type: "category", key: e.target.value })} aria-invalid={errorFor("category_key") ? true : undefined} className={inputClass}>
              <option value="">Choose a category</option>
              {categories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            {errorFor("category_key") ? <span className={errorClass}>{errorFor("category_key")}</span> : <span className={hintClass}>
              The category belongs to this fundraiser, not to your account. It sets the words and the details this form asks for. These are the starting categories, and more can be added.
            </span>}
          </label>
          <p className="mt-3 text-[14.5px] text-muted">{AVAILABILITY_NOTE}</p>
          {formNote && <p className="my-4 text-[14.5px] text-accent-ink">{formNote}</p>}
          {form.notice && <p role="alert" className="my-4 text-accent-ink">{STARTER_KIT_ERROR_MESSAGE[form.notice]}</p>}

          {offerKits && <fieldset className="mt-6 mb-2 flex flex-wrap gap-2">
            <legend className={labelClass}>How do you want to start?</legend>
            <label className={choiceClass}>
              <input type="radio" name="start_from" value="idea" checked={form.mode === "idea"} onChange={() => dispatch({ type: "mode", mode: "idea" })} className="sr-only" />
              Start from a sponsorship idea
            </label>
            <label className={choiceClass}>
              <input type="radio" name="start_from" value="scratch" checked={form.mode === "scratch"} onChange={() => dispatch({ type: "mode", mode: "scratch" })} className="sr-only" />
              Start from scratch
            </label>
          </fieldset>}
          {offerKits && <p className="mb-2 text-[14.5px] text-muted">A starter idea fills in examples only when you pick one. Every example can be changed, and none of them offers, prices or publishes anything.</p>}
          {starterKits && !offerKits && categoryRow && <p className="mt-6 text-[14.5px] text-muted">
            There are no starter ideas for {categoryLabel(categoryRow)}. The fields below are the whole form: say it in your own words.
          </p>}
          {offerKits && form.mode === "idea" && <StarterKitPicker
            group={group}
            categoryChosen={category !== ""}
            selectedKey={form.kitKey}
            recommendations={form.kitKey ? starterKits?.recommendations[form.kitKey] ?? [] : []}
            onSelect={(key) => dispatch({ type: "kit", key })}
          />}

          <Controlled label={titleLabel(category)} name="title" value={fields.title} onChange={set("title")} error={errorFor("title")} hint={isExample("title") ? EXAMPLE_HINT : "The name sponsors see. It can change while this is a draft."} />
          {detailInputs.map((field) => <Detail key={`${category}-${field.key}`} field={field} value={fields.category_details[field.key] ?? ""} onChange={(value) => dispatch({ type: "detail", key: field.key, value })} error={errorFor(`detail_${field.key}`)} />)}
          <TextArea label="The story" name="description" value={facts.description} onChange={setFact("description")} error={errorFor("description")} rows={5}
            hint="What do you want to make happen, and why does it matter? Sponsors read this first. Your own words, as plain as you like." />
          <Controlled label="Who will experience it?" name="audience_description" value={fields.audience_description} onChange={set("audience_description")} error={errorFor("audience_description")}
            hint={isExample("audience_description") ? EXAMPLE_HINT : "The people who will be there, watch, listen or take part. Describe the audience you know today; a number can come later, as an estimate."} />
        </section>

        {/* ------------------------------------------------------------ Funding */}
        <section hidden={stage !== "funding"} aria-labelledby={`${ids}-funding`}>
          <h2 id={`${ids}-funding`} className="sr-only">Funding</h2>
          <p className="text-[14.5px] text-muted">A sponsor needs two answers from every fundraiser: what the funding enables, and what they can count on receiving.</p>
          <Controlled label="What will the funding enable?" name="purpose" value={fields.purpose} onChange={set("purpose")} error={errorFor("purpose")}
            hint={isExample("purpose") ? EXAMPLE_HINT : "What the money pays for, as concretely as you can say it today."} />
          <label className={`${labelClass} my-4 block`}>Funding goal (USD, optional)
            <input name="goal_amount" type="text" inputMode="decimal" value={facts.goal_amount} onChange={(e) => setFact("goal_amount")(e.target.value)} aria-invalid={errorFor("goal_amount") ? true : undefined} placeholder="5000" className={inputClass} />
            {errorFor("goal_amount") && <span className={errorClass}>{errorFor("goal_amount")}</span>}
            <span className={hintClass}>
              What the work needs, in your own number. A goal is separate from the sponsorship options you price next: their total is not a goal, and neither number is money raised. Leave it empty rather than guess.
            </span>
          </label>
          <Controlled label="What can sponsors count on receiving?" name="sponsor_promise" value={fields.sponsor_promise} onChange={set("sponsor_promise")} error={errorFor("sponsor_promise")}
            hint={isExample("sponsor_promise") ? "An example from the starter kit. Promise only what you will deliver, in your own words." : "One line for the whole fundraiser. Each priced option says its own placement in the next stage."} />

          <fieldset className="mt-8 border-t border-line pt-6">
            <legend className="caps mb-1 text-[14px] text-muted">When</legend>
            <p className="mb-4 text-[14.5px] text-muted">Fundraising dates are when sponsors can buy. Activity dates are when the work happens. Neither is required now, and neither is guessed from the other.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Fundraising starts" name="fundraising_starts_on" type="date" value={facts.fundraising_starts_on} onChange={setFact("fundraising_starts_on")} error={errorFor("fundraising_starts_on")} />
              <Field label="Fundraising ends" name="fundraising_ends_on" type="date" value={facts.fundraising_ends_on} onChange={setFact("fundraising_ends_on")} error={errorFor("fundraising_ends_on")} />
              <Field label="Activity starts" name="starts_on" type="date" value={facts.starts_on} onChange={setFact("starts_on")} error={errorFor("starts_on")} />
              <Field label="Activity ends" name="ends_on" type="date" value={facts.ends_on} onChange={setFact("ends_on")} error={errorFor("ends_on")} />
            </div>
            <Field label="Time zone (optional)" name="timezone" value={facts.timezone} onChange={setFact("timezone")} error={errorFor("timezone")} hint="For timed deadlines, so they mean the same hour to everyone. For example Europe/London." />
          </fieldset>

          <fieldset className="mt-8 border-t border-line pt-6">
            <legend className="caps mb-1 text-[14px] text-muted">Where</legend>
            <label className={`${labelClass} my-4 block`}>Where will the activity take place?
              <select name="activity_mode" value={fields.activity_mode} onChange={(e) => set("activity_mode")(e.target.value)} aria-invalid={errorFor("activity_mode") ? true : undefined} className={inputClass}>
                <option value="">To be confirmed</option><option value="in_person">In person</option><option value="online">Online</option><option value="hybrid">In person and online</option>
              </select>
              {errorFor("activity_mode") && <span className={errorClass}>{errorFor("activity_mode")}</span>}
            </label>
            <ActivityLocationsField rows={locations} onChange={(rows) => { setLocations(rows); setDirty(true); }} />
            {errorFor("activity_locations") && <p className="text-[14.5px] text-accent-ink">{errorFor("activity_locations")}</p>}
          </fieldset>

          <fieldset className="mt-8 border-t border-line pt-6">
            <legend className="caps mb-1 text-[14px] text-muted">Audience facts</legend>
            <Field label="Expected audience size (optional)" name="expected_attendance" type="number" value={facts.expected_attendance} onChange={setFact("expected_attendance")} error={errorFor("expected_attendance")}
              hint="An estimate, shown as one. Leave it empty rather than guess." />
            <DiscoveryTagFields registry={discovery} categoryKey={category} selected={tags} onToggle={toggleTag} />
            {errorFor("discovery_tags") && <p className="text-[14.5px] text-accent-ink">{errorFor("discovery_tags")}</p>}
          </fieldset>

          {category === "music" && <details open={hasMusicFacts || undefined} className="mt-8 border-t border-line pt-6">
            <summary className="caps cursor-pointer text-[14px] text-accent-ink">Performances and bidding (music, optional)</summary>
            <p className="mt-3 mb-2 text-[14.5px] text-muted">
              Not every music fundraiser has performances: a recording can leave these empty. To publish, a music fundraiser still needs a performance format, both activity dates and a number of performances.
            </p>
            <label className={`${labelClass} my-4 block`}>Performance format
              <select name="kind" value={fields.kind} onChange={(e) => set("kind")(e.target.value)} aria-invalid={errorFor("kind") ? true : undefined} className={inputClass}>
                <option value="">Not applicable or not yet known</option><option value="tour">Tour</option><option value="season">Season</option><option value="residency">Residency</option>
              </select>
              {errorFor("kind") && <span className={errorClass}>{errorFor("kind")}</span>}
            </label>
            <Field label="Number of performances" name="show_count" type="number" value={facts.show_count} onChange={setFact("show_count")} error={errorFor("show_count")} />
            <Field label="Bidding closes (UTC, required for auctions)" name="bidding_closes_utc" type="datetime-local" value={facts.bidding_closes_utc} onChange={setFact("bidding_closes_utc")} error={errorFor("bidding_closes_utc")} />
          </details>}
        </section>
      </div>

      <FundraiserDraftPreview
        className="min-w-0 self-start lg:sticky lg:top-24"
        input={{
          categoryLabel: categoryRow ? categoryLabel(categoryRow) : null,
          organizer: organizer ?? { name: null, photoUrl: null, kindLabel: null },
          title: fields.title, description: facts.description, audience: fields.audience_description, purpose: fields.purpose, sponsorPromise: fields.sponsor_promise,
          goalAmount: facts.goal_amount, activityMode: fields.activity_mode, locations,
          fundraisingStartsOn: facts.fundraising_starts_on, fundraisingEndsOn: facts.fundraising_ends_on, activityStartsOn: facts.starts_on, activityEndsOn: facts.ends_on,
        }}
      />
    </div>

    {/* ------------------------------------------------------------ the three ways to save */}
    <div className="mt-10 border-t border-line pt-6">
      <p className="mb-5 flex items-center gap-2.5 text-[14.5px] text-muted">
        <Locked size={16} aria-hidden="true" className="flex-none" />
        Nothing is public. The draft is saved when you choose Continue, Back or Save draft, and not before.
      </p>
      {state.error && <p ref={alertRef} tabIndex={-1} role="alert" className="mb-5 max-w-[62ch] text-[15px] text-accent-ink outline-none">
        {state.error}
        {elsewhere.length > 0 && <span className="mt-1 block text-[14.5px]">
          {elsewhere.length === 1 ? "One of these is" : "Some of these are"} on the {STAGE_LABEL[FIELD_STAGE[elsewhere[0]]]} stage. Back or Continue saves what is here first.
        </span>}
      </p>}
      {state.ok && !state.error && !dirty && <p role="status" className="mb-5 text-[15px]">Draft saved.</p>}
      {dirty && <p role="status" className="mb-5 text-[14.5px] text-muted">Changes not saved yet.</p>}
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        <Button type="submit" name="intent" value="continue" arrow disabled={pending}>{pending ? "Saving…" : heading.continueLabel}</Button>
        {stage === "project"
          ? <Link href={backHref} className={quietClass}>Back</Link>
          : <button type="submit" name="intent" value="back" disabled={pending} className={quietClass}>Back</button>}
        <button type="submit" name="intent" value="save" disabled={pending} className={quietClass}>Save draft</button>
      </div>
      <p className="mt-6 text-[14.5px] text-muted">
        {stage === "project" ? "Next: what the funding enables, and a goal if you have one." : "Next: the sponsorship options, each with its own placement and price."}
      </p>
    </div>
  </form>;
}

/** Who the fundraiser is created under, compactly. The organizer-choice screen stays where it is; this points back to it. */
function OrganizerCard({ organizer, href, label }: { organizer: DraftFormOrganizer; href: string; label: string }) {
  const initials = initialsFor(organizer.name);
  const organization = organizer.kindLabel !== null && organizer.kindLabel !== "A person";
  return (
    <div className="edge mb-7 flex min-w-0 items-center gap-4 bg-panel p-4">
      {organizer.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={organizer.photoUrl} alt="" className="h-11 w-11 flex-none object-cover" />
      ) : (
        <span aria-hidden="true" className="heading flex h-11 w-11 flex-none items-center justify-center border border-line text-[15px] text-accent-ink">
          {initials || (organization ? <Organization size={20} /> : <UserProfile size={20} />)}
        </span>
      )}
      <span className="min-w-0">
        <span className="caps block text-[14px] text-muted">Raising as</span>
        <span className="heading block truncate text-[16px] text-ink">{organizer.name ?? "This account"}</span>
        <span className="block truncate text-[14px] text-muted">
          {[organizer.kindLabel, organizer.slug ? `${organizer.host}/${organizer.slug}` : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Link href={href} className={`${quietClass} ml-auto flex-none`}>{label}</Link>
    </div>
  );
}

/**
 * One detail this category asks for. The registry decides the key; src/lib/categories.ts decides
 * how it is asked. A closed list is a select, everything else is a line of text.
 */
function Detail({ field, value, onChange, error }: { field: DetailField; value: string; onChange: (value: string) => void; error?: string }) {
  const name = `detail_${field.key}`;
  return <label className={`${labelClass} my-4 block`}>{field.label}
    {field.options
      ? <select name={name} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className={inputClass}>
          <option value="">Not yet known</option>
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      : <input name={name} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} aria-invalid={error ? true : undefined} className={inputClass} />}
    {error ? <span className={errorClass}>{error}</span> : field.help && <span className={hintClass}>{field.help}</span>}
  </label>;
}

/** A field a starter kit may fill. Controlled, so a kit can set it and the organizer can still change every character. */
function Controlled({ label, name, value, onChange, hint, error }: { label: string; name: string; value: string; onChange: (value: string) => void; hint?: string; error?: string }) {
  return <label className={`${labelClass} my-4 block`}>{label}
    <input name={name} type="text" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className={inputClass} />
    {error ? <span className={errorClass}>{error}</span> : hint && <span className={hintClass}>{hint}</span>}
  </label>;
}

function TextArea({ label, name, value, onChange, hint, error, rows = 4 }: { label: string; name: string; value: string; onChange: (value: string) => void; hint?: string; error?: string; rows?: number }) {
  return <label className={`${labelClass} my-4 block`}>{label}
    <textarea name={name} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} aria-invalid={error ? true : undefined} className={inputClass} />
    {error ? <span className={errorClass}>{error}</span> : hint && <span className={hintClass}>{hint}</span>}
  </label>;
}

function Field({ label, name, value, onChange, type = "text", hint, error }: { label: string; name: string; value: string; onChange: (value: string) => void; type?: string; hint?: string; error?: string }) {
  return <label className={`${labelClass} my-4 block`}>{label}
    <input name={name} type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className={inputClass} />
    {error ? <span className={errorClass}>{error}</span> : hint && <span className={hintClass}>{hint}</span>}
  </label>;
}
