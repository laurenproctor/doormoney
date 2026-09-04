import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { ActForm } from "@/components/ActForm";
import { requireUser, ownedAct } from "@/lib/auth";
import { usernameFor } from "@/lib/username";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "The act" };

export default async function EditActPage() {
  const user = await requireUser("/dashboard/act");
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");
  const username = await usernameFor(supabaseAdmin(), user.id);

  return (
    <DashboardShell current="/dashboard/act" actName={act.name} eyebrow="Who is playing" title="The" accent="act">
      <Card className="max-w-[720px]">
        <ActForm act={act} siteUrl={SITE.url} username={username} />
      </Card>
    </DashboardShell>
  );
}
