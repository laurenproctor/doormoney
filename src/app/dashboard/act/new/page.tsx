import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { ActForm } from "@/components/ActForm";
import { requireUser, ownedAct } from "@/lib/auth";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "New act" };

export default async function NewActPage() {
  const user = await requireUser("/dashboard/act/new");
  const act = await ownedAct(user.id);
  if (act) redirect("/dashboard/act");

  return (
    <DashboardShell
      current="/dashboard/act"
      tape="Step one of three"
      title="Name the"
      accent="act"
      intro={<p>The name, the board address and a photo. Everything here can change later. The run and the prices come next.</p>}
    >
      <Card className="max-w-[720px]">
        <ActForm act={null} siteUrl={SITE.url} />
      </Card>
    </DashboardShell>
  );
}
