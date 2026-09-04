import { CATALOG } from "@/lib/catalog";
import { supabaseAdmin } from "@/lib/supabase/server";

/*
  The mark: the patron's name or logo, as it will appear. The act's side (approve or decline) lives
  on the dashboard. The patron's side is the page at /mark/<purchase id>, which needs no account:
  the id is an unguessable UUID, the same trust model as the record page. Nothing reachable through
  that link can move money or change a price.
*/

export type MarkStatus = "none" | "submitted" | "approved" | "declined";

export type MarkTarget = {
  id: string;
  payment_status: string;
  mark_status: MarkStatus;
  mark_url: string | null;
  mark_text: string | null;
  mark_note: string | null;
  patrons: { name: string } | null;
  lots: {
    label: string | null;
    surface_key: string;
    runs: { title: string; kind: string; status: string; starts_on: string; ends_on: string; acts: { name: string; slug: string } };
  };
};

const SELECT =
  "id,payment_status,mark_status,mark_url,mark_text,mark_note,patrons(name),lots!inner(label,surface_key,runs!inner(title,kind,status,starts_on,ends_on,acts!inner(name,slug)))";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The purchase behind a mark link, or null. Only a paid purchase has one. */
export async function markTarget(purchaseId: string): Promise<MarkTarget | null> {
  if (!ID.test(purchaseId)) return null;
  const sb = supabaseAdmin();
  const { data } = await sb.from("purchases").select(SELECT).eq("id", purchaseId).in("payment_status", ["held", "released"]).maybeSingle();
  return (data as unknown as MarkTarget | null) ?? null;
}

/** True while the act is still waiting to see a mark, or to see a different one. */
export function markOpen(p: MarkTarget) {
  return ["none", "submitted"].includes(p.mark_status) && p.lots.runs.status !== "cancelled";
}

/** What the mark goes on: the act's own label, else the standard-card name. */
export function markSurface(p: MarkTarget) {
  return p.lots.label ?? CATALOG.find((c) => c.key === p.lots.surface_key)?.name ?? p.lots.surface_key;
}

/** What the standard card says a patron gets on this surface, for the note under the form. */
export function markSeenBy(p: MarkTarget) {
  return CATALOG.find((c) => c.key === p.lots.surface_key)?.seenBy ?? null;
}
