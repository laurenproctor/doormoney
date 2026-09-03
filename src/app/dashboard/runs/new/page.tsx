import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { RunForm } from "@/components/RunForm";
import { requireUser, ownedAct } from "@/lib/auth";

export const metadata: Metadata = { title: "New run" };

export default async function NewRunPage() {
  const user = await requireUser("/dashboard/runs/new");
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

  return (
    <DashboardShell
      current="/dashboard"
      actName={act.name}
      eyebrow="Step two of three"
      title="Describe the"
      accent="run"
      intro={<p>The dates, the number of shows, and a name for the board. Patrons back the run, not a single night.</p>}
    >
      <Card className="max-w-[760px]">
        <RunForm run={null} actType={act.type} />
      </Card>
    </DashboardShell>
  );
}
