import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { ButtonLink } from "@/components/Button";
import { ArrowRight, Warning } from "@/components/dashboard/icons";
import { PayoutSummary } from "@/components/dashboard/panels";
import { ShareFundraiser } from "@/components/dashboard/ShareFundraiser";
import { CategoryBadge } from "@/components/domain";
import { requireUser, ownedAct, currentProfile, type OwnedAct } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { backedBy, type Backed } from "@/lib/backed";
import { getCategoryLabels } from "@/lib/category-registry";
import { loadHomeSponsorships, profileGaps, type HomeSponsorship } from "@/lib/dashboard-home";
import { dashboardNav, groupPayouts, isShareable, lifecycleLabel, previewTarget, type PayoutTotals } from "@/lib/dashboardModel";
import { parseIntent } from "@/lib/intent";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/server";
import { actPath, runPath } from "@/lib/urls";

export const metadata: Metadata = { title: "Home" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/*
  The dashboard home.

  One page for every account, because one account creates sponsorships and backs them. It used to
  fork: an account with no organizer profile met a role chooser, and an account with one met a
  single fundraiser's cockpit. The chooser asked people to decide something the product does not
  make them decide, and the cockpit was a detail view standing in for a home.

  So this answers two questions and stops: what can I do from here, and what is already happening.
  The detail lives where it always did, at /dashboard/runs/<id>, and every row here links into it.

  Nothing is drawn that the database did not answer. A fundraiser with no goal gets no progress
  bar, one with no priced option says nothing about price, and a read that fails says a figure may
  be missing rather than quietly showing zero.
*/
export default async function DashboardPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  const sp = await searchParams;
  // Context, not permission: it decides which action card leads and nothing else.
  const intent = parseIntent(sp.intent);

  const [sponsorships, backed, labels, payouts] = await Promise.all([
    loadHomeSponsorships(act?.id ?? null),
    loadBacked(user.id, profile?.email ?? user.email),
    getCategoryLabels(),
    loadPayouts(act),
  ]);

  const firstName = profile?.first_name?.trim() || null;
  const gaps = profileGaps(act);
  const somethingFailed = sponsorships.failed || backed.failed || payouts.failed;
  // Nothing has happened on this account yet: no organizer profile, nothing offered, nothing
  // backed. The two cards are the whole page then, and the greeting stops saying "back".
  const fresh = !act && sponsorships.rows.length === 0 && !backed.any;
  const greeting = fresh ? "Welcome" : "Welcome back";

  return (
    <DashboardShell
      current="/dashboard"
      nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })}
      actName={act?.name}
      identity={fullName(profile)}
      eyebrow={firstName ? `${greeting}, ${firstName}` : greeting}
      title="Make something"
      accent="worth backing."
      intro={<p>Create a clear sponsorship opportunity or find a project you want to support.</p>}
    >
      {somethingFailed && (
        <Card className="mb-8">
          <p className="flex items-start gap-2.5 text-[15px] leading-[1.6] text-ink">
            <Warning size={18} aria-hidden="true" className="mt-0.5 flex-none text-accent-ink" />
            Some of this could not be loaded, so a figure below may be missing rather than zero. Reload to try again.
          </p>
        </Card>
      )}

      {/*
        The two things this account can do, side by side and the same size, because neither is the
        senior one. The intent the account arrived with decides the order and nothing else.
      */}
      <section aria-labelledby="actions-head" className="mb-12">
        <h2 id="actions-head" className="sr-only">
          What you can do
        </h2>
        <div className="grid items-stretch gap-5 md:grid-cols-2">
          {(intent === "patron" ? [DISCOVER, CREATE] : [CREATE, DISCOVER]).map((action) => (
            <Card key={action.href} className="flex flex-col">
              <CardHead eyebrow={action.eyebrow}>{action.title}</CardHead>
              <p className="mb-7 max-w-[42ch] text-[15px] leading-[1.6] text-muted">{action.body}</p>
              <div className="mt-auto">
                <ButtonLink href={action.href} className="w-full sm:w-auto" arrow>
                  {action.button}
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/*
        What is already happening, and only that. An empty list used to be drawn as an empty state
        with the same button as the card above it, so a new account met each call to action twice.
        The cards are the way in; these sections appear once there is something to show.
      */}
      {sponsorships.rows.length > 0 && (
        <section aria-labelledby="sponsorships-head" className="mb-12">
          <SectionHead id="sponsorships-head" title="Your sponsorships" href={act ? "/dashboard/runs" : null} />
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {sponsorships.rows.map((row) => (
                <li key={row.id}>
                  <SponsorshipRow row={row} act={act} label={labels[row.categoryKey] ?? null} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {backed.any && (
        <section aria-labelledby="backed-head" className="mb-12">
          <SectionHead id="backed-head" title="Backed by you" href="/patron" />
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {backed.items.map((item) => (
                <li key={item.key} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
                  <div className="min-w-0">
                    <span className="block text-[15.5px] font-medium text-ink">{item.title}</span>
                    <span className="mt-1 block text-[14px] leading-[1.6] text-muted">
                      {item.organizer} &middot; {item.status}
                    </span>
                  </div>
                  <span className="flex items-baseline gap-5 sm:justify-self-end">
                    <span className="heading text-[18px] tabular-nums text-ink">{formatMoney(item.amountCents)}</span>
                    <Link
                      href={item.href}
                      className="caps text-[14px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                    >
                      View<span className="sr-only">: {item.title}</span>
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* Money the account is owed, which only means anything once there is an organizer profile. */}
      {act && (
        <section aria-labelledby="payouts-head" className="mb-12 max-w-[520px]">
          <h2 id="payouts-head" className="sr-only">
            Payouts
          </h2>
          <PayoutSummary
            totals={payouts.totals}
            rows={payouts.rows}
            payoutsEnabled={act.stripe_payouts_enabled}
            hasStripeAccount={Boolean(act.stripe_account_id)}
          />
        </section>
      )}

      {/* Last, and small: useful to finish, never the reason to be here. */}
      {act && gaps.length > 0 && (
        <section aria-labelledby="profile-head" className="max-w-[520px]">
          <Card>
            <h2 id="profile-head" className="heading mb-2 text-[18px] leading-tight text-ink">
              Complete your profile
            </h2>
            <p className="mb-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
              A complete profile helps people understand who is behind the work.
            </p>
            <ul className="grid gap-1">
              {gaps.map((gap) => (
                <li key={gap.label}>
                  <Link
                    href={gap.href}
                    className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line text-[14.5px] text-ink no-underline outline-none last:border-b-0 hover:text-accent-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
                  >
                    <span>{gap.label}</span>
                    <ArrowRight size={16} aria-hidden="true" className="flex-none" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </DashboardShell>
  );
}

/* ------------------------------------------------------------------ the two actions */

const CREATE = {
  eyebrow: "Create",
  title: "Create a sponsorship",
  body: "Turn your project into a clear offer for sponsors.",
  button: "Create a sponsorship",
  // The existing creation route. With no organizer profile yet it redirects to the step that
  // makes one and comes back, so this is the right address for every account.
  href: "/dashboard/runs/new",
} as const;

const DISCOVER = {
  eyebrow: "Discover",
  title: "Find something to back",
  body: "Browse projects with clear goals, audiences, and sponsor benefits.",
  button: "Browse sponsorships",
  href: "/fundraisers",
} as const;

/* ------------------------------------------------------------------ pieces */

/** A section's heading, with the way to the full list beside it when there is one. */
function SectionHead({ id, title, href }: { id: string; title: string; href: string | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <h2 id={id} className="heading text-[clamp(19px,2.4vw,23px)] leading-tight text-ink">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="caps text-[14px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          See all
        </Link>
      )}
    </div>
  );
}

/**
 * One of this account's sponsorships.
 *
 * Every figure is optional and absent rather than guessed: no goal means no progress bar, no
 * priced option means no price, no closing date means no date. The status is a word in a bordered
 * chip rather than a colour, so it survives being read without one.
 */
function SponsorshipRow({ row, act, label }: { row: HomeSponsorship; act: OwnedAct | null; label: string | null }) {
  const target = act && row.slug ? previewTarget({ id: row.id, slug: row.slug, status: row.status }, act.slug) : null;
  // The only place the public address can be copied, so it follows the row rather than a header.
  const shareUrl = act && row.slug && isShareable(row.status) ? `${SITE.url}${runPath(act.slug, row.slug)}` : null;
  const pct = row.goalCents && row.goalCents > 0 ? Math.min(100, Math.round((row.raisedCents / row.goalCents) * 100)) : null;

  const facts: string[] = [];
  if (row.optionCount > 0) {
    facts.push(`${row.optionCount} ${row.optionCount === 1 ? "option" : "options"}`);
    if (row.lowestPriceCents !== null) facts.push(`from ${formatMoney(row.lowestPriceCents)}`);
  }
  if (row.raisedCents > 0) facts.push(`${formatMoney(row.raisedCents)} raised`);
  if (row.closesOn) facts.push(`closes ${dayLabel(row.closesOn)}`);

  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={`/dashboard/runs/${row.id}`}
            className="text-[15.5px] font-medium text-ink no-underline outline-none hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {row.title}
          </Link>
          {label && <CategoryBadge category={{ key: row.categoryKey, label }} />}
          <span className="caps border border-line px-2 py-1 text-[14px] text-muted">{lifecycleLabel(row.status)}</span>
          {row.waitingCount > 0 && (
            <Link
              href={`/dashboard/runs/${row.id}#delivery`}
              className="caps border border-accent px-2 py-1 text-[14px] text-accent-ink no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {row.waitingCount} waiting on you
            </Link>
          )}
        </div>

        {facts.length > 0 && <p className="mt-2 text-[14px] leading-[1.6] text-muted">{facts.join(" · ")}</p>}

        {pct !== null && (
          <div className="mt-3 max-w-[320px]">
            {/*
              A bar only where the organizer set a goal, because a percentage of a number nobody
              chose is a made-up number. The figures are in the text beside it, so the bar is
              decoration and the meaning does not rest on it.
            */}
            <div aria-hidden="true" className="h-1.5 w-full bg-line">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-[14px] text-muted">
              {formatMoney(row.raisedCents)} of {formatMoney(row.goalCents ?? 0)} ({pct}%)
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:justify-end">
        <Link
          href={`/dashboard/runs/${row.id}`}
          className="caps text-[14px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          Open<span className="sr-only">: {row.title}</span>
        </Link>
        {target && (
          <Link
            href={target.path}
            className="caps text-[14px] text-muted underline decoration-1 underline-offset-4 outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {target.kind === "preview" ? "Preview" : "View public page"}
            <span className="sr-only">: {row.title}</span>
          </Link>
        )}
        {shareUrl && <ShareFundraiser url={shareUrl} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ reads */

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A stored date, read as the calendar day it is rather than shifted into the reader's zone. */
function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : dayFormat.format(parsed);
}

type BackedItem = { key: string; title: string; organizer: string; status: string; amountCents: number; href: string };

const PAYMENT: Record<string, string> = {
  requires_payment: "Not paid yet",
  held: "Held by Door Money",
  released: "Paid out in full",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

/**
 * What this account has put behind other people's work, flattened to one short list.
 *
 * /patron is still the full picture, including bids; this is the newest few so the home can say
 * whether there is anything at all. Wrapped, because a home page that cannot read one section
 * should still render the rest.
 */
async function loadBacked(userId: string, email: string | null | undefined): Promise<{ items: BackedItem[]; any: boolean; failed: boolean }> {
  let backed: Backed;
  try {
    backed = await backedBy(userId, email);
  } catch (error) {
    console.error("dashboard home: backed query failed:", error instanceof Error ? error.message : error);
    return { items: [], any: false, failed: true };
  }

  const items: BackedItem[] = [
    ...backed.placements.map((p) => ({
      key: `placement-${p.id}`,
      title: `${p.lotName}, ${p.runTitle}`,
      organizer: p.actName,
      status: PAYMENT[p.paymentStatus] ?? p.paymentStatus,
      amountCents: p.amountCents,
      href: `/record/${p.id}`,
      at: p.createdAt,
    })),
    ...backed.runs.map((r) => ({
      key: `backing-${r.id}`,
      title: r.runTitle,
      organizer: r.actName,
      status: PAYMENT[r.paymentStatus] ?? r.paymentStatus,
      amountCents: r.amountCents,
      href: actPath(r.actSlug),
      at: r.createdAt,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 5)
    .map(({ at, ...item }) => {
      void at;
      return item;
    });

  return { items, any: items.length > 0, failed: false };
}

/**
 * The payout schedule for this act.
 *
 * Through the service role, because migration 0029 took payout_schedule off the Data API: an
 * authenticated read returns a permission error. The filter is the act this account owns, and
 * three totals and a row count are all that leave.
 */
async function loadPayouts(act: OwnedAct | null): Promise<{ totals: PayoutTotals; rows: number; failed: boolean }> {
  const none = { totals: { paidCents: 0, scheduledCents: 0, pausedCents: 0 }, rows: 0 };
  if (!act) return { ...none, failed: false };
  try {
    const { data, error } = await supabaseAdmin().from("payout_schedule").select("amount_cents,status").eq("act_id", act.id);
    if (error) {
      console.error("dashboard home: payout query failed:", error.message);
      return { ...none, failed: true };
    }
    const rows = data ?? [];
    return { totals: groupPayouts(rows), rows: rows.length, failed: false };
  } catch (error) {
    console.error("dashboard home: payout query threw:", error instanceof Error ? error.message : error);
    return { ...none, failed: true };
  }
}
