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

/*
  The organizer's own record, which is one part of one profile.

  The address stays: it is where the sidebar used to point, it is where saveAct redirects a new organizer,
  and it is linked from the profile page. What changed is that it no longer presents itself as a
  separate profile for a separate person. `acts` is still its own table, written only by saveAct,
  and nothing here reads or writes the patron page or the account holder's name.
*/

export const metadata: Metadata = { title: "Organizer profile" };

export default async function EditActPage() {
  const user = await requireUser("/dashboard/act");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  if (!act) redirect("/dashboard/act/new");
  const username = await usernameFor(supabaseAdmin(), user.id);

  return (
    <DashboardShell
      current="/dashboard/profile"
      nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })}
      actName={act.name}
      identity={fullName(profile)}
      eyebrow="Creating"
      title="The"
      accent="organizer"
      intro={
        <p>
          The name, address and details sponsors and audiences see. This is part of{" "}
          <Link href="/dashboard/profile" className="text-accent-ink underline decoration-1 underline-offset-4">
            your profile
          </Link>
          , and it is kept apart from your account name and from any patron page.
        </p>
      }
    >
      <Card className="max-w-[720px]">
        <ActForm act={act} siteUrl={SITE.url} username={username} />
      </Card>
      <p className="mt-6 text-[14.5px] text-muted">
        <Link href="/dashboard/profile" className="text-accent-ink underline underline-offset-4">
          Back to your profile
        </Link>
      </p>
    </DashboardShell>
  );
}
