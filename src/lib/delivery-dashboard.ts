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

export type DeliveryRow = {
  deliverableId: string;
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
export function shapeDelivery(rows: readonly RawDeliverable[], buyers: readonly { lot_id: string; name: string }[]): DeliveryRow[] {
  const names = new Map(buyers.map((b) => [b.lot_id, b.name]));
  return rows
    .map((d) => ({
      deliverableId: d.id,
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
export async function loadRunDelivery(sb: SupabaseClient, lotIds: string[]): Promise<DeliveryRow[]> {
  if (lotIds.length === 0) return [];
  try {
    const { data, error } = await sb
      .from("deliverables")
      .select("id,title,status,due_at,position,purchases!inner(id,lot_id,mark_status,payment_status),evidence(id,kind,url,note,visibility,shows_minor,created_at)")
      .in("purchases.lot_id", lotIds)
      .order("position");
    if (error || !data) return [];
    const { data: buyers } = await sb.from("lot_buyers").select("lot_id,name").in("lot_id", lotIds);
    return shapeDelivery(data as unknown as RawDeliverable[], (buyers ?? []) as { lot_id: string; name: string }[]);
  } catch {
    return [];
  }
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
