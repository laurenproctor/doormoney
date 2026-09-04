import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { ButtonLink } from "@/components/Button";
import { MarkDecision } from "@/components/MarkDecision";
import { requireUser, ownedAct } from "@/lib/auth";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { CATALOG } from "@/lib/catalog";
import { SITE } from "@/lib/site";
import { formatMoney } from "@/lib/money";
import { formatDateRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS: Record<string, string> = { draft: "Draft", open: "Open", live: "Live", closed: "Closed", cancelled: "Cancelled" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

  const sb = await supabaseServer();
  const { data: runs } = await sb
    .from("runs")
    .select("id,kind,title,starts_on,ends_on,show_count,status")
    .eq("act_id", act.id)
    .neq("status", "cancelled")
    .order("starts_on", { ascending: false });
  const current = runs?.[0] ?? null;

  const { data: lots } = current
    ? await sb.from("lots").select("id,surface_key,label,price_cents,mode,status").eq("run_id", current.id).order("created_at")
    : { data: [] as { id: string; surface_key: string; label: string | null; price_cents: number; mode: string; status: string }[] };
  const allLots = lots ?? [];
  const sold = allLots.filter((l) => l.status === "sold");
  const pending = allLots.filter((l) => l.status === "pending_funding");
  const open = allLots.filter((l) => l.status === "open");
  const worth = sold.reduce((n, l) => n + l.price_cents, 0);
  const { data: fanRows } = current ? await sb.from("run_backers").select("display_name,amount_cents").eq("run_id", current.id) : { data: [] as { display_name: string; amount_cents: number }[] };
  const fans = fanRows ?? [];
  const fanCents = fans.reduce((n, f) => n + f.amount_cents, 0);
  const { data: shows } = current ? await sb.from("shows").select("id,played").eq("run_id", current.id) : { data: [] as { id: string; played: boolean }[] };
  const showRows = shows ?? [];
  const playedCount = showRows.filter((s) => s.played).length;

  // Marks waiting on the act's yes, across every run. Read with the service role: the patron's
  // name comes from patron_names, which came off the Data API in 0022. The query is still scoped
  // to this act's own runs.
  const { data: marks } = await supabaseAdmin()
    .from("purchases")
    .select("id,mark_url,mark_text,mark_note,mark_submitted_at,created_at,lots!inner(label,surface_key,runs!inner(act_id)),patron_names(name)")
    .eq("mark_status", "submitted")
    .eq("lots.runs.act_id", act.id)
    .order("mark_submitted_at");
  type MarkRow = {
    id: string;
    mark_url: string | null;
    mark_text: string | null;
    mark_note: string | null;
    lots: { label: string | null; surface_key: string };
    patron_names: { name: string } | null;
  };
  const waiting = ((marks ?? []) as unknown as MarkRow[]).map((m) => ({
    id: m.id,
    patron: m.patron_names?.name ?? "A patron",
    lot: m.lots.label ?? CATALOG.find((c) => c.key === m.lots.surface_key)?.name ?? m.lots.surface_key,
    url: m.mark_url,
    text: m.mark_text,
    note: m.mark_note,
  }));

  const boardHref = `/board/${act.slug}`;
  const boardLive = current && (current.status === "open" || current.status === "live");
  const snippet = `<script src="${SITE.url}/embed.js" data-act="${act.slug}"></script>`;
  const buttonSrc = `${SITE.url}/badge/button.svg?act=${encodeURIComponent(act.name)}`;
  const buttonSnippet = `<a href="${SITE.url}${boardHref}"><img src="${buttonSrc}" alt="Back ${act.name} on Door Money" height="44"></a>`;

  return (
    <DashboardShell
      current="/dashboard"
      actName={act.name}
      eyebrow={act.city}
      title={act.name}
      accent=""
      intro={
        <p className="caps">
          {boardLive ? (
            <>
              The board is up at <Link href={boardHref} className="break-all text-accent-ink underline decoration-1 underline-offset-4">{SITE.url}{boardHref}</Link>.
            </>
          ) : current ? (
            "The board is private until the run is published."
          ) : (
            "No run yet. Describe one and the board follows."
          )}
        </p>
      }
    >
      <div className="grid gap-[30px] md:grid-cols-2">
        <Card>
          <CardHead eyebrow="The run">{current ? current.title : "Start a run"}</CardHead>
          {current ? (
            <>
              <p className="mb-4 text-[15px]">
                {STATUS[current.status]}. {current.show_count} {current.kind === "season" ? "gigs" : "shows"}, {formatDateRange(current.starts_on, current.ends_on)}.
              </p>
              <dl className="mb-6 grid grid-cols-2 gap-3 border-y border-line py-3 sm:grid-cols-4">
                <Fact n={String(sold.length)} label="sold" />
                <Fact n={String(open.length + pending.length)} label="open" />
                <Fact n={String(fans.length)} label={fans.length === 1 ? "fan" : "fans"} />
                <Fact n={formatMoney(worth + fanCents)} label="backed so far" />
              </dl>
              {fans.length > 0 && (
                <p className="-mt-2 mb-5 max-w-none text-[14.5px] text-muted">
                  Fans, as their names should appear: {fans.map((f) => f.display_name).join(", ")}.
                </p>
              )}
              {showRows.length > 0 && (
                <p className="-mt-2 mb-5 text-[14.5px] text-muted">
                  {playedCount} of {showRows.length} shows played.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={`/dashboard/runs/${current.id}`}>{current.status === "draft" ? "Price and publish" : "Edit the spots"}</ButtonLink>
                {boardLive && <ButtonLink href={boardHref} variant="ghost">See the board</ButtonLink>}
              </div>
              {runs && runs.length > 1 && (
                <p className="mt-5 max-w-none text-[14px] text-muted">
                  Earlier runs:{" "}
                  {runs.slice(1).map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && ", "}
                      <Link href={`/dashboard/runs/${r.id}`} className="text-accent-ink underline decoration-1 underline-offset-4">{r.title}</Link>
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mb-6 max-w-none text-[15px] text-muted">A tour, a season, or a residency month. Dates, a show count, then prices on the spots.</p>
              <ButtonLink href="/dashboard/runs/new">Describe the run</ButtonLink>
            </>
          )}
        </Card>

        <Card>
          <CardHead eyebrow="Payouts">{act.stripe_payouts_enabled ? "Payouts on" : "Getting paid"}</CardHead>
          <p className="mb-6 max-w-none text-[15px] text-muted">
            {act.stripe_payouts_enabled
              ? "Door Money pays every Friday through the run. Nothing to chase."
              : act.stripe_account_id
                ? "Stripe still needs a few details before money can move."
                : "Door Money holds every payment and pays the act weekly through Stripe. Setup takes a few minutes."}
          </p>
          <ButtonLink href="/dashboard/payouts" variant={act.stripe_payouts_enabled ? "ghost" : "solid"}>
            {act.stripe_payouts_enabled ? "Payout details" : act.stripe_account_id ? "Finish Stripe setup" : "Set up payouts"}
          </ButtonLink>
        </Card>

        <Card className="md:col-span-2">
          <CardHead eyebrow="Marks waiting on a yes">{waiting.length ? `${waiting.length} to look at` : "Nothing waiting"}</CardHead>
          {waiting.length === 0 ? (
            <p className="max-w-none text-[15px] text-muted">When a patron sends a mark for a spot they bought, it shows here. Nothing goes on the gear without the act&apos;s yes.</p>
          ) : (
            <ul className="divide-y divide-line">
              {waiting.map((m) => (
                <li key={m.id} className="grid gap-4 py-4 md:grid-cols-[120px_1fr_auto] md:items-center">
                  <div className="edge flex h-[100px] w-[120px] items-center justify-center bg-ground p-2">
                    {m.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={`${m.patron} mark`} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="caps text-center text-[15px] leading-tight">{m.text ?? m.patron}</span>
                    )}
                  </div>
                  <div>
                    <b className="block text-[15px]">{m.patron}</b>
                    <span className="caps text-[14.5px] text-muted">{m.lot}</span>
                    {m.text && m.url && <span className="mt-1.5 block text-[14.5px]">Name to set: {m.text}</span>}
                    {m.note && <p className="mt-1.5 max-w-[52ch] text-[14.5px] leading-[1.55] text-muted">&ldquo;{m.note}&rdquo;</p>}
                  </div>
                  <MarkDecision purchaseId={m.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {boardLive && (
          <Card className="md:col-span-2">
            <CardHead eyebrow="The widget">One line for the act&apos;s own site</CardHead>
            <p className="mb-4 max-w-none text-[15px] text-muted">
              Paste this where the widget should sit: an embed block, a code block, a footer. It shows the run, the fan tiers and a button to back it, and takes the payment on the page.
            </p>
            <pre className="edge max-w-full overflow-x-auto bg-panel p-4 font-mono text-[14.5px] leading-[1.6] text-ink">
              <code>{snippet}</code>
            </pre>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="heading mb-2 text-[18px]">The link button</h3>
                <p className="mb-4 max-w-none text-[14.5px] text-muted">
                  For platforms that only allow links: a link-in-bio page, Bandcamp, a newsletter footer, an Instagram bio. It sends the fan to the board, where the same payment happens.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={buttonSrc} alt={`Back ${act.name} on Door Money`} height={44} className="mb-4 block h-11 w-auto max-w-full" />
                <pre className="edge max-w-full overflow-x-auto bg-panel p-4 font-mono text-[14px] leading-[1.6] text-ink">
                  <code>{buttonSnippet}</code>
                </pre>
                <p className="mt-3 max-w-none text-[14px] text-muted">
                  Or the address alone: <span className="break-all text-ink">{SITE.url}{boardHref}</span>
                </p>
              </div>
              <div>
                <h3 className="heading mb-2 text-[18px]">The badge</h3>
                <p className="mb-4 max-w-none text-[14.5px] text-muted">&quot;Backed on Door Money&quot;, for a website footer, a poster credit or a merch table card. Dark and light.</p>
                <div className="flex flex-wrap items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badge/dark.svg" alt="Backed on Door Money, dark badge" width={236} height={48} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badge/light.svg" alt="Backed on Door Money, light badge" width={236} height={48} />
                </div>
                <p className="mt-4 max-w-none text-[14px] text-muted">
                  Download:{" "}
                  <a href="/badge/dark.svg" download="backed-on-door-money-dark.svg" className="text-accent-ink underline decoration-1 underline-offset-4">dark</a>,{" "}
                  <a href="/badge/light.svg" download="backed-on-door-money-light.svg" className="text-accent-ink underline decoration-1 underline-offset-4">light</a>,{" "}
                  <a href={`/badge/button.svg?act=${encodeURIComponent(act.name)}`} download="back-on-door-money-button.svg" className="text-accent-ink underline decoration-1 underline-offset-4">the button</a>.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

function Fact({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <dt className="heading text-[26px] leading-none">{n}</dt>
      <dd className="caps text-[14px] text-muted">{label}</dd>
    </div>
  );
}
