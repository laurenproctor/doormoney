import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { ButtonLink } from "@/components/Button";
import { Warning } from "@/components/dashboard/icons";
import { FundraiserSelector } from "@/components/dashboard/FundraiserSelector";
import { ShareFundraiser } from "@/components/dashboard/ShareFundraiser";
import { SponsorshipWorkTable } from "@/components/dashboard/SponsorshipWorkTable";
import {
  DashboardEmptyState,
  FundraiserSummary,
  MetricRow,
  NextShowPanel,
  PayoutSummary,
  PreviewLink,
} from "@/components/dashboard/panels";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { loadDashboard, withToday } from "@/lib/dashboard";
import { dashboardNav, isShareable, previewTarget } from "@/lib/dashboardModel";
import { supabaseServer } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Overview" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);

  // No act yet. Somebody here to back musicians belongs on their own page, not in the middle of
  // listing a band they never came to list. Anyone else is here to organize, so carry on to step one.
  if (!act) {
    const roles = profile?.roles;
    redirect(hasRole(roles, "patron") && !hasRole(roles, "musician") && !hasRole(roles, "organizer") ? "/patron" : "/dashboard/act/new");
  }

  const nav = dashboardNav({ hasAct: true, roles: profile?.roles ?? [] });
  const shell = {
    current: "/dashboard",
    nav,
    actName: act.name,
    eyebrow: act.city ?? "Organizer",
    title: "Your",
    accent: "fundraising",
  } as const;

  /*
    The overview below reads the music workflow: weekly shows, attendance, a logo on a piece of
    gear. Expansion Phase 2 opened fundraisers to categories that have none of those and to drafts
    with no dates yet, so an act without a music type, or with any fundraiser the music panels
    cannot describe, gets the plain list instead. Same rule the page carried before this workspace,
    and the same reason: a panel that cannot be filled honestly is not drawn.
  */
  const sb = await supabaseServer();
  const { data: allRuns } = await sb
    .from("runs")
    .select("id,title,status,category_key,starts_on,ends_on,kind")
    .eq("act_id", act.id)
    .neq("status", "cancelled")
    .order("starts_on", { ascending: false });
  const beyondMusic = !act.type || (allRuns ?? []).some((r) => r.category_key !== "music" || !r.starts_on || !r.ends_on || !r.kind);

  if (beyondMusic) {
    return (
      <DashboardShell {...shell}>
        <Card>
          <CardHead eyebrow="Drafts and activity">Your fundraisers</CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
            Start with what the funding enables and the audience a sponsor can reach.
          </p>
          {(allRuns ?? []).length > 0 && (
            <ul className="mb-7 divide-y divide-line border-y border-line">
              {(allRuns ?? []).map((run) => (
                <li key={run.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                  <Link href={`/dashboard/runs/${run.id}`} className="text-[15px] text-accent-ink underline decoration-1 underline-offset-4">
                    {run.title || "Untitled fundraiser"}
                  </Link>
                  <span className="caps text-[14px] text-muted">{run.status}</span>
                </li>
              ))}
            </ul>
          )}
          <ButtonLink href="/dashboard/runs/new">Create a fundraiser</ButtonLink>
        </Card>
      </DashboardShell>
    );
  }

  const sp = await searchParams;
  const wanted = typeof sp.fundraiser === "string" ? sp.fundraiser : undefined;
  const view = withToday(await loadDashboard(act, wanted), new Date());

  if (view.failed && !view.selected) {
    return (
      <DashboardShell {...shell}>
        <Card>
          <p className="flex items-start gap-2.5 text-[15px] leading-[1.6] text-ink">
            <Warning size={18} aria-hidden="true" className="mt-0.5 flex-none text-accent-ink" />
            Your fundraisers could not be loaded just now. Nothing is lost. Reload the page, and if it keeps happening
            tell Door Money.
          </p>
        </Card>
      </DashboardShell>
    );
  }

  if (!view.selected) {
    return (
      <DashboardShell {...shell} intro={<p>Open a fundraiser and sponsors can start putting money behind the work.</p>}>
        <DashboardEmptyState
          heading="No fundraiser yet"
          body="A fundraiser is one named funding effort, such as a tour, a season or a production, with the sponsorship options you choose to offer on it. Nothing goes public until you publish it."
          action={{ href: "/dashboard/runs/new", label: "Create a fundraiser" }}
        />
      </DashboardShell>
    );
  }

  const run = view.selected;
  const target = previewTarget(run, act.slug);
  const shareUrl = `${SITE.url}${target.path}`;

  return (
    <DashboardShell {...shell}>
      {view.failed && (
        <Card className="mb-6">
          <p className="flex items-start gap-2.5 text-[15px] leading-[1.6] text-ink">
            <Warning size={18} aria-hidden="true" className="mt-0.5 flex-none text-accent-ink" />
            Some of this could not be loaded, so a figure below may be missing rather than zero. Reload to try again.
          </p>
        </Card>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <FundraiserSelector runs={view.runs} selectedId={run.id} />
        <Link href="/dashboard/runs/new" className="caps text-[14px] text-accent-ink underline underline-offset-4">
          Create a fundraiser
        </Link>
      </div>

      <FundraiserSummary run={run}>
        <PreviewLink href={target.path} label={target.label} />
        {isShareable(run.status) && <ShareFundraiser url={shareUrl} />}
      </FundraiserSummary>

      {view.metrics && <MetricRow metrics={view.metrics} />}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card id="sponsorship-work">
          <CardHead eyebrow="Sponsorship work">What needs you</CardHead>
          <SponsorshipWorkTable rows={view.work} />
        </Card>

        <div className="grid gap-6">
          <NextShowPanel show={view.nextShow} runId={run.id} preparation={view.preparation} />
          <PayoutSummary
            totals={view.payouts}
            rows={view.payoutRows}
            payoutsEnabled={act.stripe_payouts_enabled}
            hasStripeAccount={Boolean(act.stripe_account_id)}
          />
        </div>
      </div>

      <p className="mt-7">
        <Link href={`/dashboard/runs/${run.id}`} className="caps text-[14px] text-accent-ink underline underline-offset-4">
          Edit this fundraiser
        </Link>
      </p>
    </DashboardShell>
  );
}
