import type { SupabaseClient } from "@supabase/supabase-js";
import { lotName } from "@/lib/purchases";
import { tierPlace } from "@/lib/catalog";
import { flagConfirmation, flagRaised, sendEmail } from "@/lib/email";
import { SITE } from "@/lib/site";

/*
  The patron flag (docs/ROADMAP.md, Phase 6). A patron who does not think the run happened says so,
  and the money that has not gone out yet stops moving for that placement alone. Slices already
  released stay released; Door Money looks and then either releases the hold or refunds.

  This is deliberately not an accusation sent to the act. Door Money reads it first.

  Every step is safe to run twice: the writes are conditional on the state they expect.
*/

type Admin = SupabaseClient;

/** A flag hangs off a purchase or a fan backing. The two behave the same. */
export const FLAG_SOURCES = {
  purchases: { column: "purchase_id", noun: "placement" },
  backings: { column: "backing_id", noun: "backing" },
} as const;
export type FlagSource = keyof typeof FLAG_SOURCES;
export const PAUSED_REASON = "patron flag";

type Row = {
  id: string;
  payment_status: string;
  flagged_at: string | null;
  flag_cleared_at: string | null;
  amount_cents: number;
};

export type FlagTarget = Row & {
  source: FlagSource;
  /** How the patron would name what they hold. */
  what: string;
  patronName: string;
  patronEmail: string | null;
  actName: string;
  actSlug: string;
  runTitle: string;
  runStatus: string;
  /** runs.kind, so the pages can name the period rather than call it "the run". */
  kind: string;
};

const RUN = "runs!inner(title,kind,status,acts!inner(name,slug))";
type RunShape = { title: string; kind: string; status: string; acts: { name: string; slug: string } };

/** The purchase or backing behind a record id, in the shape the flag pages need. Null if nothing matches. */
export async function flagTarget(sb: Admin, id: string): Promise<FlagTarget | null> {
  const paid = ["held", "released", "partially_refunded"];
  const { data: p } = await sb
    .from("purchases")
    .select(`id,payment_status,flagged_at,flag_cleared_at,amount_cents,patrons(name,contact_email),lots!inner(label,surface_key,${RUN})`)
    .eq("id", id)
    .in("payment_status", paid)
    .maybeSingle();
  if (p) {
    const row = p as unknown as Row & { patrons: { name: string; contact_email: string } | null; lots: { label: string | null; surface_key: string; runs: RunShape } };
    const run = row.lots.runs;
    return {
      ...row,
      source: "purchases",
      what: `the ${lotName(row.lots).toLowerCase()}`,
      patronName: row.patrons?.name ?? "A patron",
      patronEmail: row.patrons?.contact_email ?? null,
      actName: run.acts.name,
      actSlug: run.acts.slug,
      runTitle: run.title,
      runStatus: run.status,
      kind: run.kind,
    };
  }
  const { data: b } = await sb
    .from("backings")
    .select(`id,payment_status,flagged_at,flag_cleared_at,amount_cents,display_name,tier,patrons(contact_email),${RUN}`)
    .eq("id", id)
    .in("payment_status", paid)
    .maybeSingle();
  if (!b) return null;
  const row = b as unknown as Row & { display_name: string; tier: string; patrons: { contact_email: string } | null; runs: RunShape };
  return {
    ...row,
    source: "backings",
    what: `a name on ${tierPlace(row.tier)}`,
    patronName: row.display_name,
    patronEmail: row.patrons?.contact_email ?? null,
    actName: row.runs.acts.name,
    actSlug: row.runs.acts.slug,
    runTitle: row.runs.title,
    runStatus: row.runs.status,
    kind: row.runs.kind,
  };
}

/**
 * Raises the flag and pauses every slice still to go out on it. Idempotent: a second call on an
 * open flag changes nothing and reports it as already raised.
 */
export async function raiseFlag(sb: Admin, target: FlagTarget, note: string | null) {
  if (target.flagged_at && !target.flag_cleared_at) return { ok: true as const, already: true, paused: 0 };

  const now = new Date().toISOString();
  const { data: marked, error } = await sb
    .from(target.source)
    .update({ flagged_at: now, flag_note: note, flag_cleared_at: null })
    .eq("id", target.id)
    .is("flag_cleared_at", target.flagged_at ? undefined : null)
    .select("id");
  if (error) throw new Error(`flag ${target.id}: ${error.message}`);
  if (!marked?.length) return { ok: true as const, already: true, paused: 0 };

  // Hold the money that has not moved. Slices already paid stay paid: the run did happen for those weeks.
  const { column } = FLAG_SOURCES[target.source];
  const { data: paused } = await sb
    .from("payout_schedule")
    .update({ status: "paused", paused_reason: PAUSED_REASON })
    .eq(column, target.id)
    .eq("status", "scheduled")
    .select("id");

  const count = paused?.length ?? 0;
  const admin = process.env.CONTACT_TO_EMAIL;
  if (admin) {
    const r = await sendEmail(
      flagRaised({
        to: admin,
        patronName: target.patronName,
        what: target.what,
        actName: target.actName,
        runTitle: target.runTitle,
        note,
        pausedCount: count,
        adminUrl: `${SITE.url}/admin`,
        recordUrl: `${SITE.url}/record/${target.id}`,
      }),
    );
    if (!r.sent) console.error("flag notice not sent", target.id, r.reason);
  }
  if (target.patronEmail) {
    const r = await sendEmail(
      flagConfirmation({
        to: target.patronEmail,
        patronName: target.patronName,
        what: target.what,
        actName: target.actName,
        runTitle: target.runTitle,
        pausedCount: count,
        recordUrl: `${SITE.url}/record/${target.id}`,
      }),
    );
    if (!r.sent) console.error("flag confirmation not sent", target.id, r.reason);
  }
  return { ok: true as const, already: false, paused: count };
}

/**
 * Door Money looked and the run is fine: the hold comes off and the paused slices go back in the
 * queue, so the next Friday job sends them. Refunding instead is the existing refund path.
 */
export async function clearFlag(sb: Admin, source: FlagSource, id: string) {
  const { data: marked } = await sb
    .from(source)
    .update({ flag_cleared_at: new Date().toISOString() })
    .eq("id", id)
    .not("flagged_at", "is", null)
    .is("flag_cleared_at", null)
    .select("id");
  if (!marked?.length) return { ok: true as const, already: true, resumed: 0 };

  const { column } = FLAG_SOURCES[source];
  const { data: resumed } = await sb
    .from("payout_schedule")
    .update({ status: "scheduled", paused_reason: null })
    .eq(column, id)
    .eq("status", "paused")
    .eq("paused_reason", PAUSED_REASON)
    .select("id");
  return { ok: true as const, already: false, resumed: resumed?.length ?? 0 };
}

export type OpenFlag = {
  id: string;
  source: FlagSource;
  flaggedAt: string;
  note: string | null;
  amountCents: number;
  patronName: string;
  what: string;
  actName: string;
  runTitle: string;
  pausedCents: number;
};

/** Everything flagged and still waiting on Door Money, newest first. For the admin page. */
export async function openFlags(sb: Admin): Promise<OpenFlag[]> {
  const out: OpenFlag[] = [];
  for (const source of ["purchases", "backings"] as const) {
    const { data } = await sb
      .from(source)
      .select(
        source === "purchases"
          ? `id,flagged_at,flag_note,amount_cents,patrons(name),lots!inner(label,surface_key,${RUN})`
          : `id,flagged_at,flag_note,amount_cents,display_name,tier,${RUN}`,
      )
      .not("flagged_at", "is", null)
      .is("flag_cleared_at", null)
      .order("flagged_at", { ascending: false });
    for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
      const id = raw.id as string;
      const { column } = FLAG_SOURCES[source];
      const { data: slices } = await sb.from("payout_schedule").select("amount_cents").eq(column, id).eq("status", "paused");
      const run = (source === "purchases" ? (raw.lots as { runs: RunShape }).runs : (raw.runs as RunShape)) as RunShape;
      out.push({
        id,
        source,
        flaggedAt: raw.flagged_at as string,
        note: (raw.flag_note as string | null) ?? null,
        amountCents: raw.amount_cents as number,
        patronName: source === "purchases" ? ((raw.patrons as { name: string } | null)?.name ?? "A patron") : (raw.display_name as string),
        what: source === "purchases" ? `the ${lotName(raw.lots as { label: string | null; surface_key: string }).toLowerCase()}` : `a name on ${tierPlace(raw.tier as string)}`,
        actName: run.acts.name,
        runTitle: run.title,
        pausedCents: (slices ?? []).reduce((n, s) => n + (s.amount_cents as number), 0),
      });
    }
  }
  return out.sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt));
}
