"use client";
import { useActionState, useReducer } from "react";
import { saveDraftForm } from "@/app/actions/drafts";
import type { FundraiserDraft } from "@/lib/fundraiser-drafts";
import { detailFields, titleLabel, type DetailField } from "@/lib/categories";
import { AVAILABILITY_NOTE } from "@/lib/starting-categories";
import { STARTER_KIT_ERROR_MESSAGE, starterKit, starterKitGroups, type KitCategory, type KitTextField, type StarterKitError } from "@/lib/starter-kits";
import { initialKitDraft, kitDraftReducer, type KitDraftAction, type KitDraftState } from "@/lib/starter-kit-draft";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { StarterKitPicker } from "@/components/StarterKitPicker";
import type { KitRecommendation } from "@/lib/starter-kit-recommendations";

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

const EXAMPLE_HINT = "An example from the starter kit. Change it to fit your own work.";
const hintClass = "mt-2 block text-[14px] normal-case tracking-normal text-muted";
const choiceClass = "caps edge min-w-[200px] flex-1 cursor-pointer bg-panel p-3 text-center text-[14.5px] has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:checked]:border-accent";

export function FundraiserDraftForm({ draft, categories, musicOrganizer, starterKits }: {
  draft: FundraiserDraft | null; categories: KitCategory[]; musicOrganizer: boolean; starterKits?: StarterKitContext;
}) {
  const [state, action, pending] = useActionState(saveDraftForm, { ok: false });
  const [form, dispatch] = useReducer(
    (current: KitDraftState, change: KitDraftAction) => kitDraftReducer(current, change, categories),
    undefined,
    () => initialKitDraft({ draft, musicOrganizer, categories, kitKey: starterKits?.initialKitKey, linkError: starterKits?.linkError }),
  );
  const { fields } = form;
  const category = fields.category_key;
  const detailInputs = detailFields(category, categories.find((item) => item.key === category)?.detail_keys ?? []);
  const kit = starterKit(form.kitKey);
  /** True while a field still holds the kit's own example, which is when the hint under it is true. */
  const isExample = (name: KitTextField) => Boolean(kit?.prefill[name]) && fields[name] === kit?.prefill[name];
  const set = (name: KitTextField | "activity_mode" | "kind") => (value: string) => dispatch({ type: "field", name, value });

  return <form action={action}>
    {draft && <input type="hidden" name="id" value={draft.id} />}
    {/* Read once, after the first save, to carry the kit to the next page. Never stored with the draft. */}
    {starterKits && form.kitKey && <input type="hidden" name="starter_kit" value={form.kitKey} />}
    <input type="hidden" name="activity_locations" value={JSON.stringify(draft?.activity_locations ?? [])} />
    {starterKits && <fieldset className="mb-6 flex flex-wrap gap-2">
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
    <p className="mb-3 text-muted">Save what is known now. Anything you do not know yet can stay empty: an unknown is never filled in for you.</p>
    {starterKits && <p className="mb-3 text-muted">A starter kit fills in examples only when you pick one, and every example can be changed.</p>}
    <p className="mb-6 text-muted">{AVAILABILITY_NOTE}</p>
    <label className={labelClass}>Category
      <select name="category_key" value={category} onChange={(e) => dispatch({ type: "category", key: e.target.value })} required className={inputClass}>
        <option value="">Choose a category</option>
        {categories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select>
      <span className={hintClass}>
        The category belongs to this fundraiser, not to your account. It sets the words and the details this form asks for. These are the starting categories, and more can be added.
      </span>
    </label>
    {form.notice && <p role="alert" className="my-4 text-accent-ink">{STARTER_KIT_ERROR_MESSAGE[form.notice]}</p>}
    {starterKits && form.mode === "idea" && <StarterKitPicker
      group={starterKitGroups(categories).find((group) => group.category.key === category) ?? null}
      categoryChosen={category !== ""}
      selectedKey={form.kitKey}
      recommendations={form.kitKey ? starterKits.recommendations[form.kitKey] ?? [] : []}
      onSelect={(key) => dispatch({ type: "kit", key })}
    />}
    <Controlled label={titleLabel(category)} name="title" value={fields.title} onChange={set("title")} hint={isExample("title") ? EXAMPLE_HINT : undefined} />
    {detailInputs.map((field) => <Detail key={`${category}-${field.key}`} field={field} value={fields.category_details[field.key] ?? ""} onChange={(value) => dispatch({ type: "detail", key: field.key, value })} />)}
    <p className="mt-6 text-[14.5px] text-muted">A sponsor needs two answers from every fundraiser: what the funding enables, and what they can count on receiving.</p>
    <Controlled label="What will the funding enable?" name="purpose" value={fields.purpose} onChange={set("purpose")} hint={isExample("purpose") ? EXAMPLE_HINT : undefined} />
    <label className={labelClass}>Description<textarea name="description" defaultValue={draft?.description ?? ""} rows={4} className={inputClass} /></label>
    <Controlled label="What can sponsors count on receiving?" name="sponsor_promise" value={fields.sponsor_promise} onChange={set("sponsor_promise")}
      hint={isExample("sponsor_promise") ? "An example from the starter kit. Promise only what you will deliver, in your own words." : undefined} />
    <Controlled label="Who will the sponsorship reach?" name="audience_description" value={fields.audience_description} onChange={set("audience_description")} hint={isExample("audience_description") ? EXAMPLE_HINT : undefined} />
    <Field label="Funding goal (USD, optional)" name="goal_amount" value={draft?.goal_cents == null ? "" : (draft.goal_cents / 100).toFixed(2)} />
    <input type="hidden" name="goal_currency" value="USD" />
    <label className={labelClass}>Where will the activity take place?
      <select name="activity_mode" value={fields.activity_mode} onChange={(e) => set("activity_mode")(e.target.value)} className={inputClass}>
        <option value="">To be confirmed</option><option value="in_person">In person</option><option value="online">Online</option><option value="hybrid">In person and online</option>
      </select>
    </label>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Fundraising starts" name="fundraising_starts_on" type="date" value={draft?.fundraising_starts_on} />
      <Field label="Fundraising ends" name="fundraising_ends_on" type="date" value={draft?.fundraising_ends_on} />
      <Field label="Activity starts" name="starts_on" type="date" value={draft?.starts_on} />
      <Field label="Activity ends" name="ends_on" type="date" value={draft?.ends_on} />
    </div>
    <Field label="Time zone (for example Europe/London)" name="timezone" value={draft?.timezone} />
    <input type="hidden" name="delivery_due_at" value={draft?.delivery_due_at ?? ""} />
    {category === "music" && <>
      <label className={labelClass}>Performance format (optional)
        <select name="kind" value={fields.kind} onChange={(e) => set("kind")(e.target.value)} className={inputClass}>
          <option value="">Not applicable or not yet known</option><option value="tour">Tour</option><option value="season">Season</option><option value="residency">Residency</option>
        </select>
      </label>
      <Field label="Bidding closes (UTC, required for auctions)" name="bidding_closes_utc" type="datetime-local" value={draft?.bidding_closes_at ? new Date(draft.bidding_closes_at).toISOString().slice(0, 16) : ""} />
      <Field label="Number of performances (optional)" name="show_count" type="number" value={draft?.show_count} />
    </>}
    <Field label="Expected audience size (optional)" name="expected_attendance" type="number" value={draft?.expected_attendance} />
    {state.error && <p role="alert" className="my-4 text-accent-ink">{state.error}</p>}
    {state.ok && <p role="status" className="my-4">Draft saved.</p>}
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button>
  </form>;
}
/**
 * One detail this category asks for. The registry decides the key; src/lib/categories.ts decides
 * how it is asked. A closed list is a select, everything else is a line of text.
 */
function Detail({ field, value, onChange }: { field: DetailField; value: string; onChange: (value: string) => void }) {
  const name = `detail_${field.key}`;
  return <label className={`${labelClass} my-4 block`}>{field.label}
    {field.options
      ? <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Not yet known</option>
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      : <input name={name} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={inputClass} />}
    {field.help && <span className={hintClass}>{field.help}</span>}
  </label>;
}
/** A field a starter kit may fill. Controlled, so a kit can set it and the organizer can still change every character. */
function Controlled({ label, name, value, onChange, hint }: { label: string; name: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label className={`${labelClass} my-4 block`}>{label}
    <input name={name} type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    {hint && <span className={hintClass}>{hint}</span>}
  </label>;
}
function Field({ label, name, value, type = "text" }: { label: string; name: string; value?: string | number | null; type?: string }) {
  return <label className={`${labelClass} my-4 block`}>{label}<input name={name} type={type} defaultValue={value ?? ""} className={inputClass} /></label>;
}
