import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { FundraiserDraftForm } from "@/components/FundraiserDraftForm";
import { FundraiserStages } from "@/components/FundraiserStages";
import { draftCategories, draftDiscoveryRegistry } from "@/app/actions/drafts";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardNav } from "@/lib/dashboardModel";
import { STAGE_HEADING } from "@/lib/fundraiser-stages";
import { entityKindLabel } from "@/lib/participation";
import { SITE } from "@/lib/site";
import { supabaseServer } from "@/lib/supabase/server";
import { loadKitRecommendations } from "@/lib/starter-kit-recommendations";
import { starterKitFromLink } from "@/lib/starter-kits";

/*
  A new fundraiser starts here, on the first of four stages: Project, Funding, Sponsorships, Review.

  Only the project is asked for on this address. The first save gives the draft an address of its
  own (/dashboard/runs/<id>?stage=funding) and every stage after that lives there, so nothing
  typed is ever held only in a browser. The organizer was chosen one step earlier, on
  /dashboard/act/new, and is shown here rather than asked for again.
*/

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
  const heading = STAGE_HEADING.project;

  return (
    <DashboardShell
      current="/dashboard/runs"
      nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })}
      actName={act.name}
      identity={fullName(profile)}
      eyebrow="New fundraiser"
      title={heading.title}
      accent={heading.accent}
      intro={
        <>
          <p>{heading.intro}</p>
          <p className="mt-3">
            A starter kit is an example, not a rule: change any part of it.
            Picking one saves nothing, offers nothing and sets no price.
          </p>
        </>
      }
    >
      <FundraiserStages current="project" className="mb-7 max-w-[760px]" />
      <Card>
        <FundraiserDraftForm
          draft={null}
          stage="project"
          categories={categories}
          musicOrganizer={act.type !== null}
          discovery={discovery}
          organizer={{
            name: act.name,
            photoUrl: act.photo_url,
            kindLabel: entityKindLabel(act.entity_kind),
            slug: act.slug,
            host: SITE.url.replace(/^https?:\/\//, ""),
          }}
          backHref={asked ? `/dashboard/act/new?template=${asked}` : "/dashboard/act/new"}
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
