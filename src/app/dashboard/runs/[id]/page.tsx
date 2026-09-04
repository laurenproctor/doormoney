import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { ReadinessChecklist } from "@/components/ReadinessChecklist";
import { RunForm, type RunInput } from "@/components/RunForm";
import { LotsEditor, type ExistingLot } from "@/components/LotsEditor";
import { ShowsPanel, type ShowRow } from "@/components/ShowsPanel";
import { VerificationEditor } from "@/components/VerificationEditor";
import { requireUser, ownedAct } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { CATALOG } from "@/lib/catalog";
import { SITE } from "@/lib/site";
import { formatDateRange } from "@/lib/dates";

export const metadata: Metadata = { title: "The run" };

type Props = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<string, string> = { draft: "Draft, not public", open: "Open, taking bids and orders", live: "Live, the run is on", closed: "Closed", cancelled: "Cancelled" };

export default async function RunPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/runs/${id}`);
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

  const sb = await supabaseServer();
  const { data: run } = await sb
    .from("runs")
    .select("id,kind,title,starts_on,ends_on,show_count,expected_attendance,bidding_closes_at,status,verification_methods,verification_other")
    .eq("id", id)
    .eq("act_id", act.id)
    .maybeSingle();
  if (!run) notFound();

  const { data: lots } = await sb.from("lots").select("id,surface_key,label,price_cents,mode,status,buy_now_cents").eq("run_id", id).order("created_at");
  const { data: shows } = await sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", id).order("played_on");
  const surfaces = CATALOG.filter((s) => s.appliesTo.includes(act.type));
  const boardHref = `${SITE.url}/board/${act.slug}`;
  const allLots = lots ?? [];
  const methods: string[] = run.verification_methods ?? [];
  const settled = run.status === "closed" || run.status === "cancelled";

  return (
    <DashboardShell
      current="/dashboard"
      actName={act.name}
      eyebrow={STATUS_LABEL[run.status] ?? run.status}
      title={run.title}
      accent=""
      intro={
        <p className="caps">
          {run.show_count} {run.kind === "season" ? "gigs" : "shows"}, {formatDateRange(run.starts_on, run.ends_on)}.
        </p>
      }
    >
      {!settled && (
        <Card className="mb-10 max-w-[860px]">
          <CardHead eyebrow="Where this stands">{run.status === "draft" ? "Before the board goes up" : "The board is up"}</CardHead>
          <ReadinessChecklist
            input={{
              act,
              run: { ...run, methods, other: run.verification_other ?? null },
              lotCount: allLots.length,
              auctionCount: allLots.filter((l) => l.mode === "auction").length,
            }}
            previewHref={`/dashboard/runs/${run.id}/preview`}
          />
        </Card>
      )}

      <Card id="placements" className="mb-10">
        <CardHead eyebrow="Step three of four">Price the spots</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
          The standard card for this kind of act. Card prices are a starting point; the act&apos;s own number always wins. Sold spots stay as they are.
        </p>
        <LotsEditor runId={run.id} runStatus={run.status} surfaces={surfaces} lots={allLots as ExistingLot[]} boardHref={boardHref} />
      </Card>

      <Card id="verification" className="mb-10 max-w-[860px]">
        <CardHead eyebrow="Step four of four">How the placements will be recorded</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
          Select what patrons will receive or be able to review after the placement runs. Only the methods chosen here go on the board, and the board never
          claims more than that.
        </p>
        <VerificationEditor runId={run.id} methods={methods} other={run.verification_other ?? null} runStatus={run.status} />
      </Card>

      <Card className="mb-10">
        <CardHead eyebrow="The shows">Every date on the run</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
          Enter the dates once. Through the run, one tap marks a show played. A photo and a headcount are optional and go on the record patrons get at the end.
        </p>
        <ShowsPanel runId={run.id} shows={(shows ?? []) as ShowRow[]} defaultCity={act.city} />
      </Card>

      <Card id="run-details" className="max-w-[760px]">
        <CardHead eyebrow="The run">Dates and details</CardHead>
        <RunForm run={run as RunInput} actType={act.type} />
      </Card>
    </DashboardShell>
  );
}
