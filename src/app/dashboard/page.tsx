import type { Metadata } from "next";
import Link from "next/link";
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
import { fullName } from "@/lib/names";
import { ROLES } from "@/lib/roles";
import { parseIntent, type Intent } from "@/lib/intent";
import { loadDashboard, withToday } from "@/lib/dashboard";
import { dashboardNav, isShareable, previewTarget } from "@/lib/dashboardModel";
import { supabaseServer } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Overview" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  const sp = await searchParams;

  /*
    No organizer profile yet, which is where every account starts.

    This used to redirect: to /patron for somebody who had ticked only that at sign-up, and into
    creating an organizer profile for everybody else. Nobody ticks anything now, so the first
    screen would have been step one of a fundraiser for a person who came here to sponsor one.
    Both capabilities are offered instead, and the account keeps both whichever is taken first.
  */
  if (!act) {
    return (
      <StartHere
        roles={profile?.roles ?? []}
        intent={parseIntent(sp.intent)}
        firstName={profile?.first_name ?? null}
        identity={fullName(profile)}
      />
    );
  }

  const nav = dashboardNav({ hasAct: true, roles: profile?.roles ?? [] });
  const shell = {
    current: "/dashboard",
    nav,
    actName: act.name,
    identity: fullName(profile),
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

/**
 * The first screen of a new account, and of any account with no organizer profile yet.
 *
 * Two capabilities, side by side, neither of them a commitment: taking one does not close the
 * other, and skipping both is a way through. The intent the account arrived with decides which is
 * offered first and which is marked as the way it was heading, and decides nothing else.
 *
 * The words come from ROLES in src/lib/roles.ts, so the capabilities are described in one place.
 */
function StartHere({ roles, intent, firstName, identity }: { roles: string[]; intent: Intent | null; firstName: string | null; identity: string | null }) {
  // The registry says which capability an intent leads with. "explore" names none on purpose:
  // it asks for both, with neither marked.
  const marked = ROLES.find((r) => r.intent === intent)?.key ?? null;
  const leading = marked ?? "organizer";
  const cards = [...ROLES].sort((a, b) => (a.key === leading ? -1 : b.key === leading ? 1 : 0));

  return (
    <DashboardShell
      current="/dashboard"
      nav={dashboardNav({ hasAct: false, roles })}
      identity={identity}
      eyebrow={firstName ? `Welcome, ${firstName}` : "Welcome"}
      title="One account,"
      accent="both sides."
      intro={
        <p>
          One Door Money account for creating fundraisers, supporting work, or doing both. Start on either side.
          Nothing here is locked once you pick one.
        </p>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHead eyebrow={card.key === marked ? "Where you were heading" : "On the same account"}>{card.label}</CardHead>
            <p className="mb-7 max-w-[46ch] text-[15px] leading-[1.6] text-muted">{card.blurb}</p>
            <ButtonLink href={card.start}>{card.label}</ButtonLink>
          </Card>
        ))}
      </div>

      <p className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px] text-muted">
        <Link href="/how-sponsorship-works" className="text-accent-ink underline underline-offset-4">
          Skip for now and see how sponsorship works
        </Link>
        <Link href="/patron" className="text-accent-ink underline underline-offset-4">
          What this account has backed
        </Link>
      </p>
    </DashboardShell>
  );
}
