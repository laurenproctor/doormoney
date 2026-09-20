import type { EvidenceView } from "@/lib/domain";

/**
 * The documentation an organizer attached, as far as this viewer may see it.
 *
 * The caller decides what the viewer may see and hands in only that, plus a count of the rest.
 * This component cannot widen it: it is given no ids, no storage paths and no way to fetch. A
 * public fundraiser makes none of this public. Says who supplied it, and never that anybody
 * checked it.
 */
export function EvidenceSummary({ evidence, organizerName }: { evidence: EvidenceView; organizerName: string }) {
  const { items, withheld } = evidence;
  if (items.length === 0 && withheld === 0) return null;
  return (
    <div>
      {items.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((e, i) => (
            <li key={`${e.title}-${i}`} className="py-4 text-[15px]">
              <span className="caps mr-3 text-[14px] text-accent-ink">{e.isPublic ? "Published" : "Private"}</span>
              {e.url ? (
                <a href={e.url} rel="noopener noreferrer nofollow ugc" target="_blank" className="break-all text-accent-ink underline decoration-1 underline-offset-4">
                  {e.title}
                </a>
              ) : (
                e.title
              )}
              {e.note && <span className="mt-1 block text-[14.5px] text-muted">{e.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {withheld > 0 && (
        <p className="mt-4 max-w-[62ch] text-[14.5px] text-muted">
          {withheld === 1 ? "One more item is" : `${withheld} more items are`} private to the sponsor and to {organizerName}.
        </p>
      )}
      <p className="mt-4 max-w-[62ch] text-[14.5px] text-muted">Documentation comes from {organizerName}, and Door Money passes it on.</p>
    </div>
  );
}
