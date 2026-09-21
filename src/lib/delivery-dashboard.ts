import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceKind } from "@/lib/delivery-policy";

/*
  What an organizer sees of delivery on one of their own fundraisers.

  Read under the organizer's own session, never with the service role. Row level security returns a
  deliverable and its evidence only to the two parties to that purchase (migration 0045), so a
  fundraiser id that is not theirs comes back empty whatever is asked for. The sponsor's name comes
  from lot_buyers, the public view the fundraiser page already draws from: nothing here reads an
  amount, an email address or a payment identity.
*/

export type DeliveryEvidence = { id: string; kind: EvidenceKind; url: string | null; note: string | null; isPublic: boolean; showsMinor: boolean; createdAt: string };

/** What a sponsor sent and the organizer has not answered yet. Never read by the browser's own session. */
export type SubmittedMaterials = { text: string | null; note: string | null; fileUrl: string | null };

export type DeliveryRow = {
  deliverableId: string;
  /** The sponsorship this deliverable belongs to. The decision on its materials is made against it. */
  purchaseId: string;
  /** Set only while the sponsor's materials are waiting for the organizer's answer. */
  submitted: SubmittedMaterials | null;
  title: string;
  sponsorName: string | null;
  /** purchases.mark_status: whether the organizer has accepted what the sponsor sent. */
  materials: "none" | "submitted" | "approved" | "declined";
  delivered: boolean;
  dueAt: string | null;
  /** True while the sponsorship is still held. A refunded one cannot be delivered against. */
  open: boolean;
  evidence: DeliveryEvidence[];
};

type RawEvidence = { id: string; kind: EvidenceKind; url: string | null; note: string | null; visibility: string; shows_minor: boolean; created_at: string; removed_at?: string | null };
export type RawDeliverable = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  position: number;
  purchases: { id: string; lot_id: string; mark_status: string; payment_status: string };
  evidence: RawEvidence[] | null;
};

const MATERIALS = ["none", "submitted", "approved", "declined"] as const;

/** Rows as the panel draws them. Oldest purchase first is not knowable here, so: by title, then position. */
export function shapeDelivery(
  rows: readonly RawDeliverable[],
  buyers: readonly { lot_id: string; name: string }[],
  materials: ReadonlyMap<string, SubmittedMaterials> = new Map(),
): DeliveryRow[] {
  const names = new Map(buyers.map((b) => [b.lot_id, b.name]));
  return rows
    .map((d) => ({
      deliverableId: d.id,
      purchaseId: d.purchases.id,
      // Only while it is waiting: once decided, what was sent is on the record, not on a to-do list.
      submitted: d.purchases.mark_status === "submitted" ? (materials.get(d.purchases.id) ?? { text: null, note: null, fileUrl: null }) : null,
      title: d.title,
      sponsorName: names.get(d.purchases.lot_id) ?? null,
      materials: (MATERIALS as readonly string[]).includes(d.purchases.mark_status) ? (d.purchases.mark_status as DeliveryRow["materials"]) : "none",
      delivered: d.status === "delivered",
      dueAt: d.due_at,
      open: d.purchases.payment_status === "held",
      evidence: (d.evidence ?? [])
        .filter((e) => !e.removed_at)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({ id: e.id, kind: e.kind, url: e.url, note: e.note, isPublic: e.visibility === "public", showsMinor: e.shows_minor, createdAt: e.created_at })),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The deliverables on one fundraiser's sponsorships. Empty for a music fundraiser, which owes no
 * deliverable rows, and empty before migration 0045 is applied, where the read errors.
 */
export async function loadRunDelivery(sb: SupabaseClient, lotIds: string[], admin?: SupabaseClient): Promise<DeliveryRow[]> {
  if (lotIds.length === 0) return [];
  try {
    const { data, error } = await sb
      .from("deliverables")
      .select("id,title,status,due_at,position,purchases!inner(id,lot_id,mark_status,payment_status),evidence(id,kind,url,note,visibility,shows_minor,created_at)")
      .in("purchases.lot_id", lotIds)
      .order("position");
    if (error || !data) return [];
    const { data: buyers } = await sb.from("lot_buyers").select("lot_id,name").in("lot_id", lotIds);
    const rows = data as unknown as RawDeliverable[];
    return shapeDelivery(rows, (buyers ?? []) as { lot_id: string; name: string }[], admin ? await loadSubmittedMaterials(admin, rows) : new Map());
  } catch {
    return [];
  }
}

/**
 * What each waiting sponsor sent. The organizer's own session cannot read these columns (migration
 * 0029 took the name, the file and the note off the Data API), so this read uses the service role,
 * the way the workspace dashboard reads its logo queue. It is safe on the same terms: it is asked
 * only for purchases that the organizer's own session just returned under row level security, so
 * it can never reach a sponsorship on somebody else's fundraiser.
 */
async function loadSubmittedMaterials(admin: SupabaseClient, rows: readonly RawDeliverable[]): Promise<Map<string, SubmittedMaterials>> {
  const ids = [...new Set(rows.filter((r) => r.purchases.mark_status === "submitted").map((r) => r.purchases.id))];
  const out = new Map<string, SubmittedMaterials>();
  if (ids.length === 0) return out;
  const { data } = await admin.from("purchases").select("id,mark_text,mark_note,mark_url").in("id", ids).eq("mark_status", "submitted");
  for (const p of (data ?? []) as { id: string; mark_text: string | null; mark_note: string | null; mark_url: string | null }[]) {
    out.set(p.id, { text: p.mark_text, note: p.mark_note, fileUrl: p.mark_url && p.mark_url.startsWith("https://") ? p.mark_url : null });
  }
  return out;
}

/** One line on where a deliverable stands, in the organizer's own second person. */
export function deliveryStatusLine(row: Pick<DeliveryRow, "materials" | "delivered" | "open">): string {
  if (!row.open) return "This sponsorship is no longer held, so there is nothing to deliver against.";
  if (row.delivered) return row.materials === "approved" ? "Documented. Your share is set for the next Friday." : "Documented. Your share moves once you accept the sponsor's materials.";
  if (row.materials === "none") return "Waiting on the sponsor's materials. You can still document delivery now.";
  if (row.materials === "submitted") return "The sponsor's materials are waiting for your answer.";
  if (row.materials === "declined") return "You declined the sponsor's materials.";
  return "Materials accepted. Document this when it has been delivered.";
}
