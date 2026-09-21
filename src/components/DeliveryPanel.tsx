"use client";
import { useActionState, useId } from "react";
import { setEvidenceVisibilityAction, submitEvidenceAction, type DeliveryState } from "@/app/actions/delivery";
import { Button } from "@/components/Button";
import { MarkDecision } from "@/components/MarkDecision";
import { decisionWords, materialsWords } from "@/lib/materials-words";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { deliveryStatusLine, type DeliveryRow } from "@/lib/delivery-dashboard";
import { EVIDENCE_KINDS } from "@/lib/delivery-policy";

/*
  Where an organizer documents what they delivered, one deliverable at a time.

  Everything typed here is stored private. Publishing an item is its own button, on that item, and
  publishes nothing else. Door Money checks that documentation exists and never whether it is good,
  so nothing here asks for approval from anybody.

  Real forms and real buttons, labelled fields, every state said in words, and every message in a
  live region, the way ProfileForms does it.
*/

const initial: DeliveryState = { ok: false };
const KIND_LABEL: Record<(typeof EVIDENCE_KINDS)[number], string> = { photo: "A photograph", link: "A link", document: "A document", note: "A written note" };

function EvidenceForm({ row }: { row: DeliveryRow }) {
  const [state, action, pending] = useActionState(submitEvidenceAction, initial);
  const uid = useId();
  return (
    <form action={action} className="mt-4 grid gap-3" noValidate>
      <input type="hidden" name="deliverable_id" value={row.deliverableId} />
      <div className="grid gap-3 md:grid-cols-[200px_1fr]">
        <label className="block" htmlFor={`${uid}-kind`}>
          <span className={labelClass}>What this is</span>
          <select id={`${uid}-kind`} name="kind" defaultValue="photo" className={inputClass}>
            {EVIDENCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block" htmlFor={`${uid}-url`}>
          <span className={labelClass}>Link</span>
          <input id={`${uid}-url`} name="url" type="url" maxLength={500} placeholder="https://" className={inputClass} aria-describedby={`${uid}-help`} />
        </label>
      </div>
      <label className="block" htmlFor={`${uid}-note`}>
        <span className={labelClass}>Note</span>
        <textarea id={`${uid}-note`} name="note" rows={2} maxLength={2000} className={`${inputClass} leading-[1.6]`} aria-describedby={`${uid}-help`} />
      </label>
      <p id={`${uid}-help`} className="max-w-[62ch] text-[14px] text-muted">
        A link, a note, or both. Say where and when. It is stored private: only you, the sponsor and Door Money can see it.
      </p>
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" name="shows_minor" value="1" className="mt-1 h-5 w-5 accent-[var(--accent)]" />
        <span>This shows somebody under 18. It can then never be made public.</span>
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : row.delivered ? "Add more documentation" : "Document this"}</Button>
        <span role="status" aria-live="polite" className="text-[14.5px] text-muted">
          {state.ok ? state.message : ""}
        </span>
      </div>
      {state.error && (
        <p role="alert" className="text-[14.5px] text-accent-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}

function VisibilityButton({ evidenceId, isPublic, label }: { evidenceId: string; isPublic: boolean; label: string }) {
  const [state, action, pending] = useActionState(setEvidenceVisibilityAction, initial);
  return (
    <form action={action} className="sm:justify-self-end">
      <input type="hidden" name="evidence_id" value={evidenceId} />
      <input type="hidden" name="visibility" value={isPublic ? "private" : "public"} />
      <button type="submit" disabled={pending} className="caps edge cursor-pointer bg-transparent px-4 py-2.5 text-[14px] text-ink transition-colors hover:border-ink disabled:cursor-default disabled:opacity-60">
        {isPublic ? "Make private" : "Make public"}
        <span className="sr-only">: {label}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state.ok ? state.message : ""}
      </span>
      {state.error && (
        <p role="alert" className="mt-2 text-[14.5px] text-accent-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * What the sponsor sent, and the organizer's yes or no. This is the only place an organizer outside
 * music can answer: the workspace table that holds the same buttons is music's dashboard.
 */
function MaterialsDecision({ row, categoryKey }: { row: DeliveryRow; categoryKey: string }) {
  if (!row.submitted) return null;
  const words = decisionWords(materialsWords(categoryKey));
  return (
    <div className="edge mt-4 bg-panel p-4">
      <p className="caps text-[14px] text-accent-ink">{words.heading}</p>
      <div className="mt-3 grid gap-2 text-[15px]">
        {row.submitted.text && <p className="max-w-none">&ldquo;{row.submitted.text}&rdquo;</p>}
        {row.submitted.fileUrl && (
          <p className="max-w-none">
            <a href={row.submitted.fileUrl} rel="noopener noreferrer" target="_blank" className="text-accent-ink underline decoration-1 underline-offset-4">
              {words.fileSent}
            </a>
          </p>
        )}
        {row.submitted.note && <p className="max-w-none text-[14.5px] text-muted">{row.submitted.note}</p>}
        {!row.submitted.text && !row.submitted.fileUrl && !row.submitted.note && <p className="max-w-none text-muted">{words.fileSent}</p>}
      </div>
      <p className="mb-3 mt-3 max-w-[62ch] text-[14.5px] text-muted">{words.declineWarning}</p>
      <MarkDecision purchaseId={row.purchaseId} categoryKey={categoryKey} />
    </div>
  );
}

export function DeliveryPanel({ rows, youth, categoryKey }: { rows: DeliveryRow[]; /** A youth team's documentation is never published. */ youth: boolean; /** The fundraiser's category, for the words. */ categoryKey: string }) {
  return (
    <ul className="grid gap-px bg-line">
      {rows.map((row) => (
        <li key={row.deliverableId} className="bg-ground p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <b className="text-[16px] font-medium">{row.title}</b>
            <span className="caps text-[14px] text-muted">
              {row.sponsorName ?? "A sponsor"}
              {row.dueAt ? `, due ${new Date(row.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}
            </span>
          </div>
          <p className={`caps mt-2 text-[14px] ${row.delivered ? "text-accent-ink" : "text-muted"}`}>{row.delivered ? "Documented" : "Not documented yet"}</p>
          <p className="mt-2 max-w-[62ch] text-[15px] text-muted">{deliveryStatusLine(row)}</p>
          <MaterialsDecision row={row} categoryKey={categoryKey} />

          {row.evidence.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {row.evidence.map((e) => {
                const label = e.url ?? e.note ?? KIND_LABEL[e.kind];
                const locked = youth || e.showsMinor;
                return (
                  <li key={e.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                    <div className="min-w-0 text-[15px]">
                      <span className="caps mr-3 text-[14px] text-accent-ink">{e.isPublic ? "Public" : "Private"}</span>
                      {e.url ? (
                        <a href={e.url} rel="noopener noreferrer nofollow ugc" target="_blank" className="break-all text-accent-ink underline decoration-1 underline-offset-4">
                          {e.url}
                        </a>
                      ) : (
                        KIND_LABEL[e.kind]
                      )}
                      {e.note && <span className="mt-1 block text-[14.5px] text-muted">{e.note}</span>}
                    </div>
                    {locked ? (
                      <span className="text-[14px] text-muted sm:text-right">{youth ? "Youth team: stays private" : "Shows a minor: stays private"}</span>
                    ) : (
                      <VisibilityButton evidenceId={e.id} isPublic={e.isPublic} label={label} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {row.open && <EvidenceForm row={row} />}
        </li>
      ))}
    </ul>
  );
}
