import Link from "next/link";
import { Add, ArrowRight, Checkmark, Launch, Location, Time, Warning } from "@/components/dashboard/icons";
import { Card, CardHead } from "@/components/DashboardShell";
import { ButtonLink } from "@/components/Button";
import { formatMoney } from "@/lib/money";
import { LIFECYCLE_STEPS, LIFECYCLE_LABELS, lifecycleIndex, type PayoutTotals, type PrepItem, type ShowRow } from "@/lib/dashboardModel";
import type { DashboardMetrics } from "@/lib/dashboard";

/* ------------------------------------------------------------------ lifecycle */

/**
 * Where the fundraiser is, as an ordered list rather than a picture: draft, open, live, complete.
 * A cancelled fundraiser is on none of them and says so instead of being drawn at the end.
 */
export function LifecycleStrip({ status }: { status: string }) {
  const at = lifecycleIndex(status);
  if (at === null) {
    return (
      <p className="caps flex items-center gap-2 text-[14px] text-muted">
        <Warning size={16} aria-hidden="true" />
        This fundraiser was cancelled
      </p>
    );
  }
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {LIFECYCLE_STEPS.map((step, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              aria-current={now ? "step" : undefined}
              className={`caps flex items-center gap-1.5 text-[14px] ${now ? "text-ink" : done ? "text-muted" : "text-muted/60"}`}
            >
              {done && <Checkmark size={14} aria-hidden="true" />}
              {LIFECYCLE_LABELS[step]}
              {now && <span className="sr-only">(current stage)</span>}
            </span>
            {i < LIFECYCLE_STEPS.length - 1 && <span aria-hidden="true" className="h-px w-5 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ metrics */

/**
 * Five numbers, each of them something the database recorded.
 *
 * There is no goal and no percentage: no goal column exists, so a progress bar would be measuring
 * against a number somebody made up.
 */
export function MetricRow({ metrics }: { metrics: DashboardMetrics }) {
  const items = [
    { label: "Raised", value: formatMoney(metrics.raisedCents), hint: "after refunds" },
    { label: "Sponsorships sold", value: String(metrics.sponsorshipsSold) },
    { label: "Patrons", value: String(metrics.patrons) },
    { label: "Shows played", value: `${metrics.showsPlayed} of ${metrics.showsTotal}` },
    { label: "Days left", value: String(metrics.daysLeft) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
      {items.map((m) => (
        <div key={m.label} className="bg-ground px-4 py-4">
          <dt className="caps text-[14px] text-muted">{m.label}</dt>
          <dd className="heading mt-1.5 text-[clamp(20px,2.4vw,26px)] tabular-nums leading-none text-ink">{m.value}</dd>
          {m.hint && <p className="mt-1 text-[14px] text-muted">{m.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ next show */

export function NextShowPanel({ show, runId, preparation }: { show: ShowRow | null; runId: string; preparation: PrepItem[] }) {
  return (
    <Card>
      <CardHead eyebrow="Next show">{show ? "What is coming up" : "No show ahead"}</CardHead>
      {show ? (
        <div className="border-b border-line pb-5">
          <p className="heading text-[18px] text-ink">{show.venue?.trim() || "Venue to come"}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Time size={14} aria-hidden="true" />
              {new Date(`${show.played_on}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Location size={14} aria-hidden="true" />
              {show.city?.trim() || "City to come"}
            </span>
            <span>{show.played ? "Played" : "Not played yet"}</span>
          </p>
        </div>
      ) : (
        <p className="border-b border-line pb-5 text-[14.5px] leading-[1.6] text-muted">
          Every date on this fundraiser is behind you, or none has been added yet.
        </p>
      )}

      <h3 className="caps mb-3 mt-5 text-[14px] text-muted">Needs doing</h3>
      {preparation.length === 0 ? (
        <p className="flex items-start gap-2 text-[14px] text-muted">
          <Checkmark size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          Nothing is waiting on you.
        </p>
      ) : (
        <ul className="grid gap-1">
          {preparation.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line text-[14px] text-ink no-underline outline-none last:border-b-0 hover:text-accent-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
              >
                <span>
                  <span className="tabular-nums">{item.count}</span> {item.label}
                </span>
                <ArrowRight size={16} aria-hidden="true" className="flex-none" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5">
        <Link href={`/dashboard/runs/${runId}#shows`} className="caps text-[14px] text-accent-ink underline underline-offset-4">
          Manage the shows
        </Link>
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ payouts */

/**
 * What the payout schedule says, and only that.
 *
 * Not a balance. There is no ledger in this repository, so calling any of these an available
 * balance would be borrowing a word from Stripe that nothing here can stand behind.
 *
 * Setup comes first while it is unfinished. Door Money holds the money either way and the schedule
 * is built either way, so this never blocks anything, but a musician whose Stripe onboarding is
 * half done has money that cannot move and should be told so on the page they land on.
 */
export function PayoutSummary({
  totals,
  rows,
  payoutsEnabled,
  hasStripeAccount,
}: {
  totals: PayoutTotals;
  rows: number;
  payoutsEnabled: boolean;
  hasStripeAccount: boolean;
}) {
  return (
    <Card>
      <CardHead eyebrow="Payouts">{payoutsEnabled ? "Scheduled and paid" : "Set up payouts"}</CardHead>
      {!payoutsEnabled && (
        <div className="mb-5">
          <p className="mb-4 text-[14.5px] leading-[1.6] text-muted">
            {hasStripeAccount
              ? "Stripe still needs a few details before money can move. Anything you have earned waits until then."
              : "Door Money holds every payment and pays out through Stripe. Setup takes a few minutes."}
          </p>
          <ButtonLink href="/dashboard/payouts">{hasStripeAccount ? "Finish Stripe setup" : "Set up payouts"}</ButtonLink>
        </div>
      )}
      {rows === 0 ? (
        <p className="text-[14.5px] leading-[1.6] text-muted">
          Nothing is scheduled yet. Releases appear here once a sponsorship is paid for.
        </p>
      ) : (
        <dl className="grid gap-px border border-line bg-line">
          {[
            { label: "Paid so far", value: totals.paidCents },
            { label: "Scheduled", value: totals.scheduledCents },
            { label: "Paused", value: totals.pausedCents },
          ].map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4 bg-ground px-4 py-3">
              <dt className="caps text-[14px] text-muted">{r.label}</dt>
              <dd className="heading text-[17px] tabular-nums text-ink">{formatMoney(r.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-5">
        <Link href="/dashboard/payouts" className="caps text-[14px] text-accent-ink underline underline-offset-4">
          Payout setup and detail
        </Link>
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ empty states */

export function DashboardEmptyState({ heading, body, action }: { heading: string; body: string; action?: { href: string; label: string } }) {
  return (
    <Card className="text-center">
      <h2 className="heading text-[clamp(20px,2.6vw,26px)] leading-tight text-ink">{heading}</h2>
      <p className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-[1.6] text-muted">{body}</p>
      {action && (
        <p className="mt-7">
          <ButtonLink href={action.href}>
            <Add size={16} aria-hidden="true" className="mr-2" />
            {action.label}
          </ButtonLink>
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ header */

/*
  FundraiserSummary used to sit here: the run title, its status chip, the dates and the lifecycle
  strip, as one header for the old per-fundraiser dashboard. /dashboard/runs/<id> already puts the
  title, the status and the dates in the shell's own header, so all that was left to move was the
  strip, which that page now draws directly. Nothing rendered this.
*/

export function PreviewLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="caps inline-flex min-h-[44px] items-center gap-2 border border-field-line px-4 text-[14px] text-ink no-underline outline-none transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <Launch size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}
