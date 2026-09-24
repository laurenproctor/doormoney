import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge, Card, Kpi, MoneyBar, Table, type BadgeKind, type DeskRow } from "@/components/desk";
import { PayoutButton } from "@/components/PayoutButton";
import { themeFor } from "@/components/Theme";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import { jumpTo, loadHomeSponsorships, type HomeSponsorship } from "@/lib/dashboard-home";
import { dashboardNav, lifecycleLabel, organizerShareCents } from "@/lib/dashboardModel";
import { fullName } from "@/lib/names";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";
import { syncStripeStatus } from "@/app/actions/payouts";

export const metadata: Metadata = { title: "Money" };

/*
  Money: what sponsors have paid, what is coming, and what has already gone.

  The address is /dashboard/payouts and stays there (sent links, Stripe's return URL), but the page
  is no longer only about setting Stripe up. Setting it up is one card on a page about the money,
  which is what the rail has called it since the Desk register landed.

  The Raised rule, the same one Today and the fundraiser page follow: money taken is the number,
  and bids are named beside it, never added to it. A bid is a hold on a card until an option
  closes. Every figure here was worked out by src/lib/dashboard.ts or src/lib/dashboard-home.ts,
  and the fee is feeCents at SITE.feePercent rather than a 15 written into this file.
*/

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MoneyPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard/payouts");
  const sp = await searchParams;
  if (sp.return === "1") await syncStripeStatus();
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  if (!act) redirect("/dashboard/act/new");

  // The payout schedule belongs to the account and is read either way; the bids belong to whichever
  // fundraiser is current, which is the only one this loader counts them for.
  const [view, sponsorships] = await Promise.all([loadDashboard(act), loadHomeSponsorships(act)]);

  const configured = Boolean(process.env.STRIPE_SECRET_KEY);
  const state = act.stripe_payouts_enabled ? "on" : act.stripe_account_id ? "partial" : "none";

  const takenCents = sponsorships.rows.reduce((total, run) => total + run.raisedCents, 0);
  const comingCents = organizerShareCents(takenCents, SITE.feePercent);
  const bidsCents = view.metrics?.bidsCents ?? 0;
  const { paidCents, scheduledCents, pausedCents } = view.payouts;
  const nothingYet = takenCents === 0 && paidCents === 0 && scheduledCents === 0;

  return (
    <DashboardShell
      current="/dashboard/payouts"
      nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })}
      actName={act.name}
      actSlug={act.slug}
      identity={fullName(profile)}
      theme={themeFor(act.slug)}
      eyebrow={null}
      title="Your"
      accent="money"
      titleAside={
        <Badge kind={state === "on" ? "ok" : "attention"}>{state === "on" ? "Payouts on" : "Payouts not set up"}</Badge>
      }
      intro={
        <p className="max-w-[52ch] text-[19px] leading-[1.35] text-ink">
          {nothingYet
            ? "No money has moved yet. Door Money holds every payment and releases your share under each fundraiser's terms."
            : `Sponsors have paid ${formatMoney(takenCents)}. ${formatMoney(paidCents)} of your share has been released so far.`}
        </p>
      }
      search={sponsorships.rows.map((run) => jumpTo(run))}
    >
      {sponsorships.failed && (
        <Card className="mb-5">
          <p className="text-[15px] leading-[1.6] text-ink">
            Some of this could not be loaded, so a figure below may be missing rather than zero. Reload to try again.
          </p>
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Raised"
          value={formatMoney(takenCents)}
          extra={<MoneyBar paidCents={takenCents} bidsCents={bidsCents} />}
          sub={
            bidsCents > 0 && view.selected
              ? `${formatMoney(bidsCents)} more is bid on ${view.selected.title} and held until close`
              : undefined
          }
        />
        <Kpi label="Coming to you" value={formatMoney(comingCents)} sub={`After the ${SITE.feePercent}% fee`} />
        <Kpi
          label="Released so far"
          value={formatMoney(paidCents)}
          sub={state === "on" ? "Sent to your bank by Stripe" : "Waiting on Stripe setup"}
        />
        <Kpi
          label="Still to release"
          value={formatMoney(scheduledCents)}
          sub={pausedCents > 0 ? `${formatMoney(pausedCents)} is paused` : undefined}
        />
      </div>

      <div className="mb-5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          title={state === "on" ? "Stripe is connected" : state === "partial" ? "Stripe is almost there" : "Stripe is not connected"}
          subtitle="Bank details and tax forms"
        >
          <p className="text-[15px] leading-[1.6] text-muted">
            {state === "on"
              ? "Bank details are in and payouts are on. Each release is sent automatically."
              : state === "partial"
                ? "The Stripe account exists but is missing something, usually a bank account or an ID check. Pick up where it left off."
                : configured
                  ? `A few minutes with Stripe: a bank account, a name, and an ID check. You keep ${100 - SITE.feePercent}% of every sponsorship.`
                  : "Payout setup is unavailable right now. You can still set up fundraisers and prices. Tell Door Money if it stays that way."}
          </p>
          <div>
            {state !== "on" ? (
              <PayoutButton configured={configured} label={state === "partial" ? "Finish Stripe setup" : "Set up payouts with Stripe"} />
            ) : (
              <PayoutButton configured={configured} label="Update bank details" ghost />
            )}
          </div>
        </Card>

        <Card title="How the money moves" subtitle="From a sponsor's card to your bank">
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px] leading-[1.6] text-muted">
            <MoveStep n={1}>A sponsor pays when they buy an option. Door Money holds it.</MoveStep>
            <MoveStep n={2}>
              Music fundraisers release a slice every Friday across their dates. Every other category releases one
              deliverable at a time, as you document it.
            </MoveStep>
            <MoveStep n={3}>Door Money keeps {SITE.feePercent}%. You keep the rest.</MoveStep>
            <MoveStep n={4}>If the fundraiser is cancelled, sponsors get the remainder back.</MoveStep>
          </ol>
        </Card>
      </div>

      <Card
        searchable
        title="By fundraiser"
        right={
          <Link href="/dashboard/runs" className="text-accent-ink underline decoration-1 underline-offset-4">
            See all
          </Link>
        }
      >
        {sponsorships.rows.length === 0 ? (
          <p className="text-[15px] leading-[1.6] text-muted">
            Nothing has been raised yet. A fundraiser is how a sponsor pays you in the first place.
          </p>
        ) : (
          /* More columns than a phone has room for, so the table scrolls inside its own frame. */
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="min-w-[620px]">
              <Table
                columns={[
                  { key: "name", label: "Fundraiser", width: "minmax(0,2fr)" },
                  { key: "status", label: "Status", width: "minmax(0,1fr)" },
                  { key: "taken", label: "Raised", width: "minmax(0,1.3fr)" },
                  { key: "coming", label: "Coming to you", width: "minmax(0,1.3fr)" },
                ]}
                rows={sponsorships.rows.map(moneyRow)}
              />
            </div>
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}

const STATUS_KIND: Record<string, BadgeKind> = { open: "ok", live: "ok" };

/** One numbered step. The number is decoration; the list order is what a reader is told. */
function MoveStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-neutral-wash text-[14px] font-medium text-ink"
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** One fundraiser's money. A draft has taken none and says so rather than showing a zero. */
function moneyRow(run: HomeSponsorship): DeskRow {
  const draft = run.status === "draft";
  return {
    key: run.id,
    href: `/dashboard/runs/${run.id}`,
    label: run.title,
    search: [run.title, run.period, lifecycleLabel(run.status)].filter(Boolean).join(" "),
    cells: [
      <>
        <span className="font-medium">{run.title}</span>
        {run.period && <span className="text-muted"> &middot; {run.period}</span>}
      </>,
      <Badge key="status" kind={STATUS_KIND[run.status] ?? "neutral"}>
        {lifecycleLabel(run.status)}
      </Badge>,
      draft ? <span className="text-muted">Not published</span> : <span className="tabular-nums">{formatMoney(run.raisedCents)}</span>,
      draft ? null : (
        <span className="tabular-nums">{formatMoney(organizerShareCents(run.raisedCents, SITE.feePercent))}</span>
      ),
    ],
  };
}
