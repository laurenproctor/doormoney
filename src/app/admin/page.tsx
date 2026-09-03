import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDateRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Admin" };

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** Read-only view of everything, for Door Money staff. Actions come later in Phase 7. */
export default async function AdminPage() {
  await requireAdmin();
  const db = supabaseAdmin();

  const [acts, runs, lots, purchases, notes, waitlist] = await Promise.all([
    db.from("acts").select("id,slug,name,type,city,stripe_account_id,stripe_payouts_enabled,founding,created_at,profiles(email)").order("created_at", { ascending: false }),
    db.from("runs").select("id,act_id,title,kind,status,starts_on,ends_on,show_count,created_at").order("created_at", { ascending: false }),
    db.from("lots").select("id,run_id,surface_key,label,price_cents,mode,status"),
    db.from("purchases").select("id,lot_id,amount_cents,fee_cents,payment_status,mark_status,created_at").order("created_at", { ascending: false }),
    db.from("contact_messages").select("id,reason,name,organization,email,subject,message,status,created_at").order("created_at", { ascending: false }).limit(100),
    db.from("waitlist").select("id,role,name,email,city,act_type,created_at").order("created_at", { ascending: false }).limit(200),
  ]);

  type ActRow = { id: string; slug: string; name: string; type: string; city: string; stripe_account_id: string | null; stripe_payouts_enabled: boolean; founding: boolean; created_at: string; profiles: { email: string } | null };
  const actRows = (acts.data ?? []) as unknown as ActRow[];
  const runRows = runs.data ?? [];
  const lotRows = lots.data ?? [];
  const lotsByRun = new Map<string, typeof lotRows>();
  for (const l of lotRows) lotsByRun.set(l.run_id, [...(lotsByRun.get(l.run_id) ?? []), l]);
  const actName = new Map(actRows.map((a) => [a.id, a.name]));

  const held = (purchases.data ?? []).filter((p) => p.payment_status === "held").reduce((n, p) => n + p.amount_cents, 0);

  return (
    <DashboardShell current="/admin" actName="Door Money staff" eyebrow="Read only" title="Admin" accent="">
      <div className="grid gap-[30px]">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat n={String(actRows.length)} label="acts" />
          <Stat n={String(runRows.filter((r) => r.status === "open" || r.status === "live").length)} label="boards up" />
          <Stat n={String(lotRows.filter((l) => l.status === "sold").length)} label="spots sold" />
          <Stat n={formatMoney(held)} label="held" />
          <Stat n={String((waitlist.data ?? []).length)} label="on the list" />
        </dl>

        <Card>
          <CardHead eyebrow="Acts">{actRows.length} listed</CardHead>
          <Table
            head={["Act", "Owner", "Type", "City", "Stripe", "Runs", "Listed"]}
            rows={actRows.map((a) => [
              <Link key="n" href={`/board/${a.slug}`} className="text-accent-ink underline decoration-1 underline-offset-4">{a.name}</Link>,
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
            head={["Act", "Run", "Status", "Dates", "Shows", "Spots", "Sold", "Listed at"]}
            rows={runRows.map((r) => {
              const ls = lotsByRun.get(r.id) ?? [];
              return [
                actName.get(r.act_id) ?? "",
                r.title,
                r.status,
                formatDateRange(r.starts_on, r.ends_on),
                String(r.show_count),
                String(ls.length),
                `${ls.filter((l) => l.status === "sold").length} (${formatMoney(ls.filter((l) => l.status === "sold").reduce((n, l) => n + l.price_cents, 0))})`,
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
          <CardHead eyebrow="Contact notes">{(notes.data ?? []).length} received</CardHead>
          {(notes.data ?? []).length === 0 ? (
            <p className="max-w-none text-[15px] text-muted">No notes yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(notes.data ?? []).map((n) => (
                <li key={n.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b className="text-[15px]">{n.subject}</b>
                    <span className="caps text-[14px] text-muted">{when.format(new Date(n.created_at))} · {n.status}</span>
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
      </div>
    </DashboardShell>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="edge bg-panel p-4">
      <dt className="display text-[28px] leading-none">{n}</dt>
      <dd className="caps text-[14px] text-muted">{label}</dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p className="max-w-none text-[15px] text-muted">Nothing here yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[15px]">
        <thead>
          <tr className="caps border-b border-line text-left text-[14px] text-muted">
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
