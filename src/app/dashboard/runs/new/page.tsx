import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { FundraiserDraftForm } from "@/components/FundraiserDraftForm";
import { draftCategories, draftDiscoveryRegistry } from "@/app/actions/drafts";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardNav } from "@/lib/dashboardModel";
import { supabaseServer } from "@/lib/supabase/server";
import { loadKitRecommendations } from "@/lib/starter-kit-recommendations";
import { starterKitFromLink } from "@/lib/starter-kits";

export const metadata: Metadata = { title: "New fundraiser" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewRunPage({ searchParams }: Props) {
  const { template } = await searchParams;
  // Only a well-formed key goes back into an address, so signing in returns to the same kit.
  const asked = typeof template === "string" && /^[a-z][a-z0-9_]{1,39}$/.test(template) ? template : null;
  const user = await requireUser(asked ? `/dashboard/runs/new?template=${asked}` : "/dashboard/runs/new");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  // No organizer profile yet: make one first, and come back to the same starter kit afterwards.
  if (!act) redirect(asked ? `/dashboard/act/new?template=${asked}` : "/dashboard/act/new");

  const [categories, discovery] = await Promise.all([draftCategories(), draftDiscoveryRegistry()]);
  // /dashboard/runs/new?template=fund_tour. The registry decides whether the kit may be used.
  const link = starterKitFromLink(template, categories);
  const recommendations = await loadKitRecommendations(await supabaseServer(), categories, act.type);

  return (
    <DashboardShell
      current="/dashboard"
      nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })}
      actName={act.name}
      identity={fullName(profile)}
      eyebrow="Step two of three"
      title="Describe the"
      accent="fundraiser"
      intro={
        <>
          <p>Describe what the funding enables and who the sponsorship can reach. Unknown details can wait.</p>
          <p className="mt-3">
            Start from a sponsorship idea or from an empty form. A starter kit is an example, not a rule: change any part of it.
            Picking one saves nothing, offers nothing and sets no price.
          </p>
        </>
      }
    >
      <Card className="max-w-[760px]">
        <FundraiserDraftForm
          draft={null}
          categories={categories}
          musicOrganizer={act.type !== null}
          discovery={discovery}
          starterKits={{
            initialKitKey: link.status === "ready" ? link.kit.key : null,
            linkError: link.status === "refused" ? link.error : null,
            recommendations,
          }}
        />
      </Card>
    </DashboardShell>
  );
}
