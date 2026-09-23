import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "@/components/dashboard/icons";
import { DashboardShell, Card } from "@/components/DashboardShell";
import { DashboardEmptyState } from "@/components/dashboard/panels";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { loadDashboard } from "@/lib/dashboard";
import { dashboardNav, lifecycleLabel } from "@/lib/dashboardModel";
import { formatDateRange } from "@/lib/dates";

/*
  Every fundraiser this organizer has.

  The sidebar needed somewhere for "Fundraisers" to go: the editor lives at
  /dashboard/runs/<id> and creation at /dashboard/runs/new, but nothing listed them. This is the
  smallest index that makes the section real, and it reads the same loader the overview does.
*/

export const metadata: Metadata = { title: "Fundraisers" };

export default async function FundraisersPage() {
  const user = await requireUser("/dashboard/runs");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  // No organizer profile yet, and a fundraiser hangs off one. This used to ask which kind of
  // account it was and send a patron to /patron instead; every account can do both now, and
  // somebody who opened the fundraisers page came here to make one.
  if (!act) redirect("/dashboard/act/new");

  const view = await loadDashboard(act);
  const nav = dashboardNav({ hasAct: true, roles: profile?.roles ?? [] });

  return (
    <DashboardShell
      current="/dashboard/runs"
      nav={nav}
      actName={act.name}
      actSlug={act.slug}
      identity={fullName(profile)}
      eyebrow="Creating"
      title="Your"
      accent="fundraisers"
    >
      {view.runs.length === 0 ? (
        <DashboardEmptyState
          heading="No fundraiser yet"
          body="One named funding effort, with the sponsorship options you choose to offer on it."
          action={{ href: "/dashboard/runs/new", label: "Create a fundraiser" }}
        />
      ) : (
        <>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {view.runs.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/dashboard/runs/${run.id}`}
                    className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 px-5 py-4 no-underline outline-none hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15.5px] font-medium text-ink">{run.title}</span>
                      <span className="mt-1 block text-[14px] text-muted">
                        {formatDateRange(run.startsOn, run.endsOn)}
                        {run.showCount !== null && ` · ${run.showCount} ${run.kind === "season" ? "gigs" : "shows"}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="caps border border-line px-2 py-1 text-[14px] text-muted">{lifecycleLabel(run.status)}</span>
                      <ArrowRight size={16} aria-hidden="true" className="text-muted" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-6">
            <Link href="/dashboard/runs/new" className="caps text-[14px] text-accent-ink underline underline-offset-4">
              Create a fundraiser
            </Link>
          </p>
        </>
      )}
    </DashboardShell>
  );
}
