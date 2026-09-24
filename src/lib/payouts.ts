import { tierPlace } from "@/lib/catalog";
import { alertsAddress, payoutProblem, recordReady, sendEmail } from "@/lib/email";
import { recordTransfer } from "@/lib/ledger";
import { lotName, notifyPayout } from "@/lib/purchases";
import { slicePlan } from "@/lib/release";
import { SITE } from "@/lib/site";
import { transferSliceToAct } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

/*
  The Friday job. Every payout_schedule row that is due and still scheduled becomes one Transfer
  from Door Money's balance to the act's Connect account, sourced from the patron's charge.
  A row belongs to a lot purchase or to a fan backing; both move the same way, and `slicePlan`
  in src/lib/release.ts decides which ones may move at all. A sponsorship waits for the musician's
  yes on the logo; a backing has no logo and goes on the calendar.
  Safe to run any day and any number of times: rows flip to paid as they go, and the Stripe
  idempotency key is the row id, so a retry after a crash cannot send a slice twice.
*/

export type PayoutSummary = {
  ranOn: string;
  paid: number;
  paidCents: number;
  /** Rows left for another day, with the reason. */
  skipped: Record<string, number>;
  errors: { payoutId: string; message: string }[];
  /** Runs that started since the last run of the job. */
  wentLive: number;
  /** Runs that ended; each patron got the record. */
  closed: number;
};

type Source = { id: string; amount_cents: number; fee_cents: number; stripe_charge_id: string | null; payment_status: string; mark_status?: string | null };
type DueRow = {
  id: string;
  act_id: string;
  amount_cents: number;
  due_on: string;
  purchase_id: string | null;
  backing_id: string | null;
  purchases?: Source | null;
  backings?: Source | null;
  acts: { id: string; name: string; slug: string; owner_id: string | null; stripe_account_id: string | null; stripe_payouts_enabled: boolean };
};

const ACT = "acts!inner(id,name,slug,owner_id,stripe_account_id,stripe_payouts_enabled)";

/** Every due slice, whether it came from a lot purchase or a fan backing, oldest first. */
async function dueRows(sb: ReturnType<typeof supabaseAdmin>, ranOn: string) {
  const base = (source: "purchases" | "backings") =>
    sb
      .from("payout_schedule")
      // A sponsorship's logo decides whether its money is owed, so the Friday job reads it here.
      .select(`id,act_id,amount_cents,due_on,purchase_id,backing_id,${source}!inner(id,amount_cents,fee_cents,stripe_charge_id,payment_status${source === "purchases" ? ",mark_status" : ""}),${ACT}`)
      .eq("status", "scheduled")
      .not(source === "purchases" ? "purchase_id" : "backing_id", "is", null)
      .lte("due_on", ranOn);
  const [p, b] = await Promise.all([base("purchases"), base("backings")]);
  if (p.error) throw new Error(`load schedule: ${p.error.message}`);
  if (b.error) throw new Error(`load backing schedule: ${b.error.message}`);
  const rows = [...(p.data ?? []), ...(b.data ?? [])] as unknown as DueRow[];
  return rows.sort((x, y) => x.due_on.localeCompare(y.due_on));
}

export async function runWeeklyPayouts(today = new Date()): Promise<PayoutSummary> {
  const sb = supabaseAdmin();
  const ranOn = today.toISOString().slice(0, 10);
  const summary: PayoutSummary = { ranOn, paid: 0, paidCents: 0, skipped: {}, errors: [], wentLive: 0, closed: 0 };
  const skip = (reason: string) => (summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1);

  const rows = await dueRows(sb, ranOn);

  const paidByAct = new Map<string, { act: DueRow["acts"]; cents: number; slices: number }>();
  const touchedPurchases = new Set<string>();
  const touchedBackings = new Set<string>();

  for (const row of rows) {
    const source = row.purchases
      ? ({ kind: "sponsorship", ...row.purchases } as const)
      : row.backings
        ? ({ kind: "backing", ...row.backings } as const)
        : null;
    const plan = slicePlan(source, row.acts);
    if (!plan.ok) {
      skip(plan.hold);
      continue;
    }
    if (!source) continue; // slicePlan has already refused a slice with no payment behind it
    try {
      const transfer = await transferSliceToAct({
        amountCents: row.amount_cents,
        stripeAccountId: plan.stripeAccountId,
        sourceChargeId: plan.chargeId,
        idempotencyKey: `payout_${row.id}`,
        metadata: { payout_id: row.id, ...(row.purchase_id ? { purchase_id: row.purchase_id } : { backing_id: row.backing_id ?? "" }), act_id: row.act_id, due_on: row.due_on },
      });
      const { data: marked } = await sb
        .from("payout_schedule")
        .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "scheduled")
        .select("id");
      if (marked?.length) {
        summary.paid += 1;
        summary.paidCents += row.amount_cents;
        const entry = paidByAct.get(row.act_id) ?? { act: row.acts, cents: 0, slices: 0 };
        entry.cents += row.amount_cents;
        entry.slices += 1;
        paidByAct.set(row.act_id, entry);
        if (row.purchase_id) touchedPurchases.add(row.purchase_id);
        if (row.backing_id) touchedBackings.add(row.backing_id);

        // The books: the slice left, and the fee it earns. Keyed by the row, so a transfer.created
        // delivery for this same transfer finds it written. If this write fails the transfer has
        // still gone and the row still says paid, which is the truth; the failure is reported
        // below with the others so a person hears about it today rather than at reconciliation.
        try {
          await recordTransfer(sb, row.purchase_id ? { purchaseId: row.purchase_id } : { backingId: row.backing_id ?? "" }, {
            payoutId: row.id,
            sliceCents: row.amount_cents,
            transferId: transfer.id,
            occurredAt: new Date(transfer.created * 1000),
            amountCents: source.amount_cents,
            feeCents: source.fee_cents,
          });
        } catch (e) {
          summary.errors.push({ payoutId: row.id, message: `transfer ${transfer.id} was sent and the slice is marked paid, but the ledger entry was not written: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    } catch (e) {
      summary.errors.push({ payoutId: row.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // A purchase or backing with nothing left to send is released.
  for (const purchaseId of touchedPurchases) {
    const { count } = await sb.from("payout_schedule").select("id", { count: "exact", head: true }).eq("purchase_id", purchaseId).neq("status", "paid");
    if (count === 0) await sb.from("purchases").update({ payment_status: "released" }).eq("id", purchaseId).eq("payment_status", "held");
  }
  for (const backingId of touchedBackings) {
    const { count } = await sb.from("payout_schedule").select("id", { count: "exact", head: true }).eq("backing_id", backingId).neq("status", "paid");
    if (count === 0) await sb.from("backings").update({ payment_status: "released" }).eq("id", backingId).eq("payment_status", "held");
  }

  for (const { act, cents, slices } of paidByAct.values()) await notifyPayout(sb, act, cents, slices);

  // A transfer that failed is Door Money's problem to look at, not the act's to discover.
  const staff = alertsAddress();
  if (summary.errors.length && staff) {
    const r = await sendEmail(payoutProblem({ to: staff, ranOn, failures: summary.errors, adminUrl: `${SITE.url}/admin` }));
    if (!r.sent) console.error("payout problem notice not sent", r.reason);
  }

  // The calendar moves runs along: open becomes live on the first date, live becomes closed after the last.
  const { data: live } = await sb.from("runs").update({ status: "live" }).eq("status", "open").lte("starts_on", ranOn).select("id");
  summary.wentLive = live?.length ?? 0;
  summary.closed = await closeFinishedRuns(sb, ranOn);

  return summary;
}

type EndedRun = { id: string; title: string; show_count: number; acts: { name: string; slug: string } };
type EndedPurchase = { id: string; patrons: { name: string; contact_email: string } | null; lots: { label: string | null; surface_key: string } };
type EndedBacking = { id: string; display_name: string; tier: string; patrons: { contact_email: string } | null };

/** Closes every run whose last date has passed and sends each patron the record. */
async function closeFinishedRuns(sb: ReturnType<typeof supabaseAdmin>, ranOn: string) {
  const { data } = await sb.from("runs").select("id,title,show_count,acts!inner(name,slug)").in("status", ["open", "live"]).lt("ends_on", ranOn);
  const ended = (data ?? []) as unknown as EndedRun[];
  let closed = 0;
  for (const run of ended) {
    const { data: marked } = await sb.from("runs").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", run.id).in("status", ["open", "live"]).select("id");
    if (!marked?.length) continue;
    closed += 1;
    // Anything still open on the board goes unsold; anything sold gets its record.
    await sb.from("lots").update({ status: "unsold" }).eq("run_id", run.id).in("status", ["open", "pending_funding"]);
    const { count: played } = await sb.from("shows").select("id", { count: "exact", head: true }).eq("run_id", run.id).eq("played", true);
    const record = (id: string, to: string, patronName: string, what: string) =>
      sendEmail(recordReady({ to, patronName, actName: run.acts.name, runTitle: run.title, lotName: what, playedCount: played ?? 0, showCount: run.show_count, recordUrl: `${SITE.url}/record/${id}` }));
    const paid = ["held", "released", "partially_refunded"];

    const { data: lotRows } = await sb.from("lots").select("id").eq("run_id", run.id);
    const lotIds = (lotRows ?? []).map((l) => l.id);
    const { data: purchases } = lotIds.length ? await sb.from("purchases").select("id,patrons(name,contact_email),lots!inner(label,surface_key)").in("lot_id", lotIds).in("payment_status", paid) : { data: [] };
    for (const p of (purchases ?? []) as unknown as EndedPurchase[]) {
      if (!p.patrons?.contact_email) continue;
      const r = await record(p.id, p.patrons.contact_email, p.patrons.name, lotName(p.lots));
      if (!r.sent) console.error("record not sent", p.id, r.reason);
    }
    // The fans get theirs too.
    const { data: backings } = await sb.from("backings").select("id,display_name,tier,patrons(contact_email)").eq("run_id", run.id).in("payment_status", paid);
    for (const b of (backings ?? []) as unknown as EndedBacking[]) {
      if (!b.patrons?.contact_email) continue;
      const r = await record(b.id, b.patrons.contact_email, b.display_name, `name on ${tierPlace(b.tier)}`);
      if (!r.sent) console.error("record not sent", b.id, r.reason);
    }
  }
  return closed;
}
