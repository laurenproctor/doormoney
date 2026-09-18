import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { FundraiserDraftForm } from "@/components/FundraiserDraftForm";
import { draftCategories } from "@/app/actions/drafts";
import { requireUser, ownedAct } from "@/lib/auth";

export const metadata: Metadata = { title: "New fundraiser" };

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
      accent="fundraiser"
      intro={<p>Describe what the funding enables and who the sponsorship can reach. Unknown details can wait.</p>}
    >
      <Card className="max-w-[760px]">
        <FundraiserDraftForm draft={null} categories={await draftCategories()} musicOrganizer={act.type !== null} />
      </Card>
    </DashboardShell>
  );
}

