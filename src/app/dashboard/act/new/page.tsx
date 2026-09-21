import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { ActForm } from "@/components/ActForm";
import { requireUser, ownedAct } from "@/lib/auth";
import { usernameFor } from "@/lib/username";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";
import { starterKit } from "@/lib/starter-kits";

export const metadata: Metadata = { title: "Organizer profile" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewActPage({ searchParams }: Props) {
  // A starter kit picked before there was a profile to hang a fundraiser on. It is looked up in the
  // kit registry, so only a real kit's key travels on, and it is carried, never stored.
  const { template } = await searchParams;
  const kit = typeof template === "string" ? starterKit(template) : null;
  const user = await requireUser(kit ? `/dashboard/act/new?template=${kit.key}` : "/dashboard/act/new");
  const act = await ownedAct(user.id);
  if (act) redirect("/dashboard/act");
  // The username claimed at sign-up is the board address, so the field starts there.
  const username = await usernameFor(supabaseAdmin(), user.id);

  return (
    <DashboardShell
      current="/dashboard/act"
      eyebrow="Step one of three"
      title="Name the"
      accent="organizer"
      intro={<p>Start with your name and profile address. Location and a photo are optional. Next, describe what you are raising funds for.</p>}
    >
      <Card className="max-w-[720px]">
        <ActForm act={null} siteUrl={SITE.url} username={username} starterKitKey={kit?.key ?? null} />
      </Card>
    </DashboardShell>
  );
}

