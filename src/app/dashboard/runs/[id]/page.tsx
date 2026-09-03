import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { RunForm, type RunInput } from "@/components/RunForm";
import { LotsEditor, type ExistingLot } from "@/components/LotsEditor";
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
    .select("id,kind,title,starts_on,ends_on,show_count,expected_attendance,bidding_closes_at,status")
    .eq("id", id)
    .eq("act_id", act.id)
    .maybeSingle();
  if (!run) notFound();

  const { data: lots } = await sb.from("lots").select("id,surface_key,label,price_cents,mode,status").eq("run_id", id).order("created_at");
  const surfaces = CATALOG.filter((s) => s.appliesTo.includes(act.type));
  const boardHref = `${SITE.url}/board/${act.slug}`;

  return (
    <DashboardShell
      current="/dashboard"
      actName={act.name}
      tape={STATUS_LABEL[run.status] ?? run.status}
      title={run.title}
      accent=""
      intro={
        <p className="typewriter">
          {run.show_count} {run.kind === "season" ? "gigs" : "shows"}, {formatDateRange(run.starts_on, run.ends_on)}.
        </p>
      }
    >
      <Card className="mb-10">
        <CardHead eyebrow="Step three of three">Price the spots</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-gray">
          The standard card for this kind of act. Card prices are a starting point; the act&apos;s own number always wins. Sold spots stay as they are.
        </p>
        <LotsEditor runId={run.id} runStatus={run.status} surfaces={surfaces} lots={(lots ?? []) as ExistingLot[]} boardHref={boardHref} />
      </Card>

      <Card className="max-w-[760px]">
        <CardHead eyebrow="The run">Dates and details</CardHead>
        <RunForm run={run as RunInput} actType={act.type} />
      </Card>
    </DashboardShell>
  );
}
