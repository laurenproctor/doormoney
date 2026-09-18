"use client";
import { useActionState, useState } from "react";
import { saveDraftForm } from "@/app/actions/drafts";
import type { FundraiserCategory, FundraiserDraft } from "@/lib/fundraiser-drafts";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";

export function FundraiserDraftForm({ draft, categories, musicOrganizer }: {
  draft: FundraiserDraft | null; categories: FundraiserCategory[]; musicOrganizer: boolean;
}) {
  const [state, action, pending] = useActionState(saveDraftForm, { ok: false });
  const [category, setCategory] = useState(draft?.category_key ?? (musicOrganizer ? "music" : ""));
  const details = draft && category === draft.category_key ? draft.category_details : {};
  return <form action={action}>
    {draft && <input type="hidden" name="id" value={draft.id} />}
    <input type="hidden" name="category_details" value={JSON.stringify(details)} />
    <input type="hidden" name="activity_locations" value={JSON.stringify(draft?.activity_locations ?? [])} />
    <p className="mb-6 text-muted">Save what is known now. Sports, film and theater are available as private drafts while their publishing flows are being built.</p>
    <label className={labelClass}>Category
      <select name="category_key" value={category} onChange={(e) => setCategory(e.target.value)} required className={inputClass}>
        <option value="">Choose a category</option>
        {categories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select>
    </label>
    <Field label="Fundraiser name" name="title" value={draft?.title} />
    <Field label="What will the funding enable?" name="purpose" value={draft?.purpose} />
    <label className={labelClass}>Description<textarea name="description" defaultValue={draft?.description ?? ""} rows={4} className={inputClass} /></label>
    <Field label="What can sponsors count on receiving?" name="sponsor_promise" value={draft?.sponsor_promise} />
    <Field label="Who will the sponsorship reach?" name="audience_description" value={draft?.audience_description} />
    <Field label="Funding goal (USD, optional)" name="goal_amount" value={draft?.goal_cents == null ? "" : (draft.goal_cents / 100).toFixed(2)} />
    <input type="hidden" name="goal_currency" value="USD" />
    <label className={labelClass}>Where will the activity take place?
      <select name="activity_mode" defaultValue={draft?.activity_mode ?? ""} className={inputClass}>
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
        <select name="kind" defaultValue={draft?.kind ?? ""} className={inputClass}>
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
function Field({ label, name, value, type = "text" }: { label: string; name: string; value?: string | number | null; type?: string }) {
  return <label className={`${labelClass} my-4 block`}>{label}<input name={name} type={type} defaultValue={value ?? ""} className={inputClass} /></label>;
}
