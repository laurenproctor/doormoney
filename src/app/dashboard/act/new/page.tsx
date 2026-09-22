import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { ActForm } from "@/components/ActForm";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardNav } from "@/lib/dashboardModel";
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
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  if (act) redirect("/dashboard/act");
  // The username claimed at sign-up is the board address, so the field starts there.
  const username = await usernameFor(supabaseAdmin(), user.id);

  return (
    <DashboardShell
      current="/dashboard/profile"
      nav={dashboardNav({ hasAct: false, roles: profile?.roles ?? [] })}
      identity={fullName(profile)}
      eyebrow="Creating"
      title="Name the"
      accent="organizer"
      intro={
        <p>
          The name sponsors and audiences will know, which can be a band, a team, a company or your own. It is
          separate from your account name, and creating it publishes nothing. Location and a photo are optional.
          Next, describe what you are raising funds for.
        </p>
      }
    >
      <Card className="max-w-[720px]">
        <ActForm act={null} siteUrl={SITE.url} username={username} starterKitKey={kit?.key ?? null} />
      </Card>
      <p className="mt-6 text-[14.5px] text-muted">
        <Link href="/dashboard/profile" className="text-accent-ink underline underline-offset-4">
          Back to your profile
        </Link>
      </p>
    </DashboardShell>
  );
}
