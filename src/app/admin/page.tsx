import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { adminNav } from "@/lib/dashboardModel";
import { requireAdmin } from "@/lib/admin";
import { openFlags } from "@/lib/flags";
import { ClearFlag, RemoveAccountTotp } from "./FlagActions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDateRange } from "@/lib/dates";
import { actPath } from "@/lib/urls";

export const metadata: Metadata = { title: "Admin" };

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** Read-only view of everything, for Door Money staff. Actions come later in Phase 7. */
export default async function AdminPage() {
  await requireAdmin();
  const db = supabaseAdmin();

  const flags = await openFlags(db);
  const [acts, runs, lots, purchases, backings, notes, waitlist, newsletter, mailRuns, owedRefunds, stuckEvents, books, imbalances] = await Promise.all([
    db.from("acts").select("id,slug,name,type,city,stripe_account_id,stripe_payouts_enabled,founding,created_at,profiles(email)").order("created_at", { ascending: false }),
    db.from("runs").select("id,act_id,title,kind,status,starts_on,ends_on,show_count,created_at").order("created_at", { ascending: false }),
    db.from("lots").select("id,run_id,surface_key,label,price_cents,mode,status"),
    db.from("purchases").select("id,lot_id,amount_cents,fee_cents,refunded_cents,payment_status,mark_status,created_at").order("created_at", { ascending: false }),
    db.from("backings").select("id,run_id,tier,amount_cents,fee_cents,payment_status,display_name,source,origin,created_at").order("created_at", { ascending: false }).limit(200),
    db.from("contact_messages").select("id,reason,name,organization,email,subject,message,status,created_at").order("created_at", { ascending: false }).limit(100),
    db.from("waitlist").select("id,role,name,email,city,act_type,created_at").order("created_at", { ascending: false }).limit(200),
    db.from("newsletter").select("id,email,source,created_at,unsubscribed_at").order("created_at", { ascending: false }).limit(200),
    db.from("mail_runs").select("id,kind,sent_at,recipients,failures").order("sent_at", { ascending: false }).limit(20),
    // Refunds Door Money owes and has not managed to send. A 'failed' row is out of attempts and
    // waiting on a person (migration 0032, src/lib/outbox.ts).
    db
      .from("financial_operations")
      .select("id,purchase_id,backing_id,reason,status,attempts,last_error,next_attempt_at,created_at")
      .eq("kind", "refund")
      .in("status", ["pending", "processing", "retryable", "failed"])
      .order("created_at", { ascending: false })
      .limit(100),
    // Stripe events that have not finished. A 'failed' row is out of attempts and wants a person
    // (migration 0039, src/lib/stripeEvents.ts).
    db
      .from("stripe_events")
      .select("id,type,status,attempts,last_error,next_attempt_at,received_at")
      .in("status", ["received", "processing", "retryable", "failed"])
      .order("received_at", { ascending: false })
      .limit(100),
    // The books, summed by account with the sample data left out (migration 0064). Revenue is read
    // from here and nowhere else: the fee earned as money released, never a sum of list prices.
    db.from("ledger_balances").select("account_key,label,kind,balance_cents,entry_count"),
    // Always empty while the constraint trigger stands (migration 0055). Read so that "always" is checked.
    db.from("ledger_imbalances").select("purchase_id,backing_id,event_key,off_by_cents,occurred_at"),
  ]);
  const subscribers = (newsletter.data ?? []).filter((n) => !n.unsubscribed_at);

  type ActRow = { id: string; slug: string; name: string; type: string; city: string; stripe_account_id: string | null; stripe_payouts_enabled: boolean; founding: boolean; created_at: string; profiles: { email: string } | null };
  const actRows = (acts.data ?? []) as unknown as ActRow[];
  const runRows = runs.data ?? [];
  const lotRows = lots.data ?? [];
  const lotsByRun = new Map<string, typeof lotRows>();
  for (const l of lotRows) lotsByRun.set(l.run_id, [...(lotsByRun.get(l.run_id) ?? []), l]);
  const actName = new Map(actRows.map((a) => [a.id, a.name]));

  const backingRows = backings.data ?? [];
  const runTitle = new Map(runRows.map((r) => [r.id, `${actName.get(r.act_id) ?? ""}, ${r.title}`]));
  const held = [...(purchases.data ?? []), ...backingRows].filter((p) => p.payment_status === "held").reduce((n, p) => n + p.amount_cents, 0);
  // Money Door Money is holding that cannot move on a Friday yet, because nobody has approved the
  // logo (migration 0031). A sponsorship sitting here past the end of its fundraiser is the case
  // Door Money looks at by hand: see docs/DECISIONS.md, decision 16.
  type OwedRefund = { id: string; purchase_id: string | null; backing_id: string | null; reason: string; status: string; attempts: number; last_error: string | null; next_attempt_at: string; created_at: string };
  const owed = (owedRefunds.data ?? []) as OwedRefund[];
  const stuckRefunds = owed.filter((o) => o.status === "failed").length;

  // Every webhook Stripe sent that did not finish. Before migration 0039 these were console lines
  // on a server nobody reads, and an event whose handler refused looked exactly like one that
  // worked.
  type EventRow = { id: string; type: string; status: string; attempts: number; last_error: string | null; next_attempt_at: string; received_at: string };
  const events = (stuckEvents.data ?? []) as EventRow[];
  const deadEvents = events.filter((e) => e.status === "failed").length;

  const waitingOnLogo = (purchases.data ?? [])
    .filter((p) => p.payment_status === "held" && p.mark_status !== "approved")
    .reduce((n, p) => n + p.amount_cents, 0);

  // What each run actually took: every purchase that was charged, refunds off. A spot won at
  // auction sells above its list price and a refund takes money back, so the lot's price says
  // neither; before 2026-09-24 this column summed list prices.
  const CHARGED = ["held", "released", "partially_refunded", "refunded"];
  const takenByLot = new Map<string, number>();
  for (const p of purchases.data ?? []) {
    if (!CHARGED.includes(p.payment_status)) continue;
    takenByLot.set(p.lot_id, (takenByLot.get(p.lot_id) ?? 0) + p.amount_cents - (p.refunded_cents ?? 0));
  }

  // The books. A liability, revenue or fee account carries a credit balance, which the ledger
  // stores as a negative number; it is shown here from its own side, so "Door Money revenue"
  // reads as money earned rather than as a minus sign.
  type Balance = { account_key: string; label: string; kind: string; balance_cents: number; entry_count: number };
  const balances = ((books.data ?? []) as Balance[]).map((b) => ({ ...b, balance_cents: Number(b.balance_cents), shown: b.kind === "asset" || b.kind === "expense" ? Number(b.balance_cents) : -Number(b.balance_cents) }));
  const balance = (key: string) => balances.find((b) => b.account_key === key)?.shown ?? 0;
  const bookEntries = balances.reduce((n, b) => n + Number(b.entry_count), 0);
  type Imbalance = { purchase_id: string | null; backing_id: string | null; event_key: string; off_by_cents: number; occurred_at: string };
  const unbalanced = (imbalances.data ?? []) as Imbalance[];

  return (
    <DashboardShell current="/admin" nav={adminNav()} actName="Door Money staff" theme="mono" eyebrow="Staff" title="Admin" accent="">
      <div className="grid gap-[30px]">
        <Card>
          <CardHead eyebrow="Account support">Somebody locked out of two-factor</CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
            An account with an authenticator app cannot get past the code screen without it, and there is no way
            for Door Money to read the code. This removes the app from one account so its password works on its
            own again. It does not touch the password, and it is the only thing here that changes somebody
            else&apos;s account.
          </p>
          <RemoveAccountTotp />
        </Card>

        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat n={String(actRows.length)} label="acts" />
          <Stat n={String(runRows.filter((r) => r.status === "open" || r.status === "live").length)} label="fundraisers up" />
          <Stat n={String(lotRows.filter((l) => l.status === "sold").length)} label="spots sold" />
          <Stat n={formatMoney(held)} label="held" />
          <Stat n={formatMoney(waitingOnLogo)} label="waiting on a logo" />
          <Stat n={formatMoney(balance("platform_fee"))} label="earned" />
          <Stat n={String(owed.length)} label={owed.length === 1 ? "refund owed" : "refunds owed"} />
          <Stat n={String(events.length)} label={events.length === 1 ? "event unfinished" : "events unfinished"} />
          <Stat n={String(flags.length)} label={flags.length === 1 ? "flag open" : "flags open"} />
          <Stat n={String((waitlist.data ?? []).length)} label="on the list" />
          <Stat n={String(subscribers.length)} label="get new fundraisers" />
        </dl>

        <Card>
          <CardHead eyebrow="The books">
            {books.error ? "Not readable" : `${bookEntries} ${bookEntries === 1 ? "entry" : "entries"}${unbalanced.length ? `, ${unbalanced.length} out of balance` : ""}`}
          </CardHead>
          <p className="mb-5 max-w-none text-[15px] text-muted">
            Every charge, transfer, fee and refund is written to the ledger by the path that moved it, as balanced entries that cannot be edited
            (migrations 0055 and 0064). Sample data is left out of these sums. Door Money earns its fee as the money releases, so &ldquo;earned&rdquo; is
            what has been released, not what has been charged; &ldquo;not yet earned&rdquo; is the fee on money still held.
          </p>
          {books.error ? (
            <p className="max-w-none text-[15px] text-muted">The ledger views are not on this database yet. Apply migration 0064.</p>
          ) : (
            <Table
              head={["Account", "Balance", "Entries", "What it is"]}
              rows={balances.map((b) => [
                b.label,
                formatMoney(b.shown, { cents: true }),
                String(b.entry_count),
                b.kind === "asset" ? "money Door Money holds or is owed" : b.kind === "liability" ? "money Door Money owes" : b.kind === "revenue" ? "earned" : "spent",
              ])}
            />
          )}
          {unbalanced.length > 0 && (
            <>
              <p className="mt-5 max-w-none text-[15px] text-muted">
                An event whose entries do not sum to zero. The database refuses one at the moment it is written, so anything here got past that and wants a
                person.
              </p>
              <Table
                head={["Payment", "Event", "Off by", "When"]}
                rows={unbalanced.map((u) => [
                  <Link key="r" href={`/record/${u.purchase_id ?? u.backing_id}`} className="text-accent-ink underline decoration-1 underline-offset-4">
                    {u.purchase_id ? "Sponsorship" : "Backing"}
                  </Link>,
                  u.event_key,
                  formatMoney(Number(u.off_by_cents), { cents: true }),
                  when.format(new Date(u.occurred_at)),
                ])}
              />
            </>
          )}
        </Card>

        {owed.length > 0 && (
          <Card>
            <CardHead eyebrow="Refunds owed">
              {owed.length} not back yet{stuckRefunds ? `, ${stuckRefunds} out of attempts` : ""}
            </CardHead>
            <p className="mb-5 max-w-none text-[15px] text-muted">
              Every refund Door Money owes is written down before Stripe is called, so one that fails is still owed. The daily job keeps trying and the
              patron is told when it lands. A row that is out of attempts has stopped on its own and wants a person: refund it in the Stripe Dashboard,
              and the row settles the next time the job sees it.
            </p>
            <Table
              head={["Payment", "Why", "State", "Tries", "Next try", "Last error"]}
              rows={owed.map((o) => [
                <Link key="r" href={`/record/${o.purchase_id ?? o.backing_id}`} className="text-accent-ink underline decoration-1 underline-offset-4">
                  {o.purchase_id ? "Sponsorship" : "Backing"}
                </Link>,
                o.reason === "mark_declined" ? "logo declined" : "fundraiser cancelled",
                o.status,
                String(o.attempts),
                o.status === "failed" ? "stopped" : when.format(new Date(o.next_attempt_at)),
                o.last_error ?? "",
              ])}
            />
          </Card>
        )}

        {events.length > 0 && (
          <Card>
            <CardHead eyebrow="Stripe events">
              {events.length} unfinished{deadEvents ? `, ${deadEvents} out of attempts` : ""}
            </CardHead>
            <p className="mb-5 max-w-none text-[15px] text-muted">
              Every event Stripe delivers is written down before it is acted on, so one whose handler failed is still on the list. The daily job keeps
              trying. A row that is out of attempts has stopped on its own and wants a person: the error says what refused, and the stored payload is
              what a replay would use.
            </p>
            <Table
              head={["Event", "Type", "State", "Tries", "Next try", "Last error"]}
              rows={events.map((e) => [
                e.id,
                e.type,
                e.status,
                String(e.attempts),
                e.status === "failed" ? "stopped" : when.format(new Date(e.next_attempt_at)),
                e.last_error ?? "",
              ])}
            />
          </Card>
        )}

        {flags.length > 0 && (
          <Card>
            <CardHead eyebrow="Flagged by a patron">{flags.length} waiting on Door Money</CardHead>
            <p className="mb-5 max-w-none text-[15px] text-muted">
              Every payment still to go out on these is on hold. Releasing the hold puts the paused slices back in the queue for the next Friday. To send
              the money back instead, cancel the run from the act&apos;s dashboard or refund the purchase in Stripe.
            </p>
            <ul className="divide-y divide-line">
              {flags.map((f) => (
                <li key={f.id} className="grid gap-4 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <b className="block text-[15px]">
                      {f.patronName} holds {f.what} on {f.actName}&apos;s {f.runTitle.toLowerCase()}
                    </b>
                    <span className="text-[14px] text-muted">
                      {when.format(new Date(f.flaggedAt))} · {formatMoney(f.amountCents)} paid · {formatMoney(f.pausedCents)} held
                    </span>
                    {f.note && <p className="mt-2 max-w-none whitespace-pre-wrap text-[15px]">{f.note}</p>}
                    <p className="mt-1 text-[14px]">
                      <Link href={`/record/${f.id}`} className="text-accent-ink underline decoration-1 underline-offset-4">
                        The record
                      </Link>
                    </p>
                  </div>
                  <ClearFlag source={f.source} id={f.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHead eyebrow="Acts">{actRows.length} listed</CardHead>
          <Table
            head={["Act", "Owner", "Type", "City", "Stripe", "Runs", "Listed"]}
            rows={actRows.map((a) => [
              <Link key="n" href={actPath(a.slug)} className="text-accent-ink underline decoration-1 underline-offset-4">{a.name}</Link>,
              a.profiles?.email ?? "",
              a.type.replace("_", " "),
              a.city,
              a.stripe_payouts_enabled ? "payouts on" : a.stripe_account_id ? "started" : "none",
              String(runRows.filter((r) => r.act_id === a.id).length),
              when.format(new Date(a.created_at)),
            ])}
          />
        </Card>

        <Card>
          <CardHead eyebrow="Runs">{runRows.length} described</CardHead>
          <Table
            head={["Act", "Run", "Status", "Dates", "Shows", "Spots", "Sold", "Taken", "Listed at"]}
            rows={runRows.map((r) => {
              const ls = lotsByRun.get(r.id) ?? [];
              return [
                actName.get(r.act_id) ?? "",
                r.title,
                r.status,
                formatDateRange(r.starts_on, r.ends_on),
                String(r.show_count),
                String(ls.length),
                String(ls.filter((l) => l.status === "sold").length),
                formatMoney(ls.reduce((n, l) => n + (takenByLot.get(l.id) ?? 0), 0)),
                formatMoney(ls.reduce((n, l) => n + l.price_cents, 0)),
              ];
            })}
          />
        </Card>

        <Card>
          <CardHead eyebrow="Payments">{(purchases.data ?? []).length} purchases</CardHead>
          {(purchases.data ?? []).length === 0 ? (
            <p className="max-w-none text-[15px] text-muted">Nothing yet. Phase 3.</p>
          ) : (
            <Table
              head={["When", "Lot", "Amount", "Fee", "Payment", "Mark"]}
              rows={(purchases.data ?? []).map((p) => {
                const l = lotRows.find((x) => x.id === p.lot_id);
                return [when.format(new Date(p.created_at)), l?.label ?? l?.surface_key ?? p.lot_id, formatMoney(p.amount_cents), formatMoney(p.fee_cents), p.payment_status, p.mark_status];
              })}
            />
          )}
        </Card>

        <Card>
          <CardHead eyebrow="Fan backings">{backingRows.length} through the widget</CardHead>
          <Table
            head={["Run", "Name", "Tier", "Amount", "Fee", "Status", "From", "When"]}
            rows={backingRows.map((b) => [
              runTitle.get(b.run_id) ?? "",
              b.display_name,
              b.tier.replace("_", " "),
              formatMoney(b.amount_cents),
              formatMoney(b.fee_cents),
              b.payment_status.replace("_", " "),
              b.origin ? b.origin.replace(/^https?:\/\//, "") : b.source,
              when.format(new Date(b.created_at)),
            ])}
          />
        </Card>

        <Card>
          <CardHead eyebrow="Contact notes">{(notes.data ?? []).length} received</CardHead>
          {(notes.data ?? []).length === 0 ? (
            <p className="max-w-none text-[15px] text-muted">No notes yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(notes.data ?? []).map((n) => (
                <li key={n.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b className="text-[15px]">{n.subject}</b>
                    <span className="text-[14px] text-muted">{when.format(new Date(n.created_at))} · {n.status}</span>
                  </div>
                  <p className="max-w-none text-[14.5px] text-muted">
                    {n.reason.replace(/_/g, " ")} · {n.name}
                    {n.organization ? `, ${n.organization}` : ""} · <a href={`mailto:${n.email}`} className="text-accent-ink underline decoration-1 underline-offset-4">{n.email}</a>
                  </p>
                  <p className="mt-2 max-w-none whitespace-pre-wrap text-[15px]">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead eyebrow="Waitlist">{(waitlist.data ?? []).length} names</CardHead>
          <Table
            head={["When", "Role", "Name", "Email", "City", "Act type"]}
            rows={(waitlist.data ?? []).map((w) => [when.format(new Date(w.created_at)), w.role, w.name, w.email, w.city ?? "", w.act_type?.replace("_", " ") ?? ""])}
          />
        </Card>

        <Card>
          <CardHead eyebrow="Mail sent on a schedule">{(mailRuns.data ?? []).length} runs</CardHead>
          <p className="mb-5 max-w-none text-[15px] text-muted">
            The new-fundraisers email and this digest both go out weekly, from the daily job. Neither sends twice in a week, and a fundraiser is only ever in one of them.
          </p>
          <Table
            head={["When", "What", "Sent", "Failed"]}
            rows={(mailRuns.data ?? []).map((m) => [
              when.format(new Date(m.sent_at)),
              m.kind === "new_boards" ? "New fundraisers" : "Digest",
              String(m.recipients),
              m.failures ? String(m.failures) : "",
            ])}
          />
        </Card>

        <Card>
          <CardHead eyebrow="New fundraisers by email">{subscribers.length} addresses</CardHead>
          <Table
            head={["When", "Email", "From", "Status"]}
            rows={(newsletter.data ?? []).map((n) => [when.format(new Date(n.created_at)), n.email, n.source ?? "", n.unsubscribed_at ? "unsubscribed" : "on"])}
          />
        </Card>
      </div>
    </DashboardShell>
  );
}

/* The register's tile, as a definition pair: the whole block is a <dl>, so each one is dt over dd. */
function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-4 shadow-1">
      <dt className="heading text-[26px] leading-none tabular-nums text-ink">{n}</dt>
      <dd className="m-0 text-[14px] text-muted">{label}</dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p className="max-w-none text-[15px] text-muted">Nothing here yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[15px]">
        <thead>
          <tr className="border-b border-line text-left text-[14px] font-medium text-muted">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
