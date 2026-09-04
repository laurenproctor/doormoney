import { CATALOG } from "@/lib/catalog";
import { markReminder, sendEmail } from "@/lib/email";
import { SITE } from "@/lib/site";
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

/* ---------------------------------------------------------------------------------------------
   The reminder. A spot that is paid for but has no mark cannot run, and the patron is the only
   one who can fix that. One nudge, a few days after the money lands, then silence.
   --------------------------------------------------------------------------------------------- */

const REMIND_AFTER_DAYS = 3;

type Waiting = {
  id: string;
  created_at: string;
  patrons: { name: string; contact_email: string } | null;
  lots: { label: string | null; surface_key: string; runs: { title: string; status: string; acts: { name: string } } };
};

/**
 * Sends one reminder per purchase that has been paid for at least REMIND_AFTER_DAYS and still has
 * no mark. Called by the daily job. Idempotent: the send is recorded, and a purchase is only ever
 * picked up once.
 */
export async function sendMarkReminders(sb: ReturnType<typeof supabaseAdmin>, now = new Date()) {
  const cutoff = new Date(now.getTime() - REMIND_AFTER_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from("purchases")
    .select("id,created_at,patrons(name,contact_email),lots!inner(label,surface_key,runs!inner(title,status,acts!inner(name)))")
    .eq("mark_status", "none")
    .in("payment_status", ["held", "released"])
    .is("mark_reminded_at", null)
    .lte("created_at", cutoff)
    .limit(200);
  if (error) throw new Error(`mark reminders: ${error.message}`);

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as unknown as Waiting[]) {
    // A run that is over or cancelled has nothing left to put a mark on.
    if (!["open", "live"].includes(row.lots.runs.status)) continue;
    const to = row.patrons?.contact_email;
    if (!to) continue;
    const mail = markReminder({
      to,
      patronName: row.patrons?.name ?? "A patron",
      actName: row.lots.runs.acts.name,
      lotName: row.lots.label ?? CATALOG.find((c) => c.key === row.lots.surface_key)?.name ?? row.lots.surface_key,
      runTitle: row.lots.runs.title,
      markUrl: `${SITE.url}/mark/${row.id}`,
    });
    const r = await sendEmail(mail);
    // Recorded either way: a bad address should not be retried every day.
    await sb.from("purchases").update({ mark_reminded_at: new Date().toISOString() }).eq("id", row.id);
    if (r.sent) sent += 1;
    else {
      failed += 1;
      console.error("mark reminder not sent", row.id, r.reason);
    }
  }
  return { sent, failed };
}
