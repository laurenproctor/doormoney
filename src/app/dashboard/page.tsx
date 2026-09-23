import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { DashboardShell } from "@/components/DashboardShell";
import { Warning } from "@/components/dashboard/icons";
import { TaskDecision } from "@/components/dashboard/TaskDecision";
import { Badge, Card, Kpi, KpiUnit, MoneyBar, Table, TaskDate, TaskRow, type BadgeKind, type DeskRow } from "@/components/desk";
import { themeFor } from "@/components/Theme";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { categoryWords } from "@/lib/category-words";
import { loadDashboard, withToday } from "@/lib/dashboard";
import { loadHomeSponsorships, type HomeSponsorship } from "@/lib/dashboard-home";
import {
  dashboardNav,
  lifecycleLabel,
  organizerShareCents,
  plural,
  waitingCount,
  type WorkRow,
} from "@/lib/dashboardModel";
import { dayAndMonth, formatDay, formatWeekdayDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { fullName, headlineParts } from "@/lib/names";
import { periodOf } from "@/lib/periods";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Today" };

/*
  Today: what needs doing, and what the money is doing, for the fundraiser that is running.

  Five things in order (docs/DESK_REGISTER.md, PR 3): who this is and what is waiting, four
  figures, the work itself, the money, and every fundraiser on the account. Nothing else. The old
  home offered two calls to action, a list of what this account had backed and a profile checklist;
  backing has its own page and its own nav item, and a home that asks somebody to complete a
  profile before telling them a sponsor is waiting has its priorities the wrong way round.

  Every number here was worked out by src/lib/dashboard.ts, src/lib/dashboardModel.ts or
  src/lib/dashboard-home.ts. The page adds no arithmetic of its own, so a figure cannot disagree
  with the one the fundraiser's own page shows, and the fee is feeCents at SITE.feePercent rather
  than a 15 written into a component.

  What is not known is not drawn. No goal, no bar; no dates, no next date; a draft says how far it
  has come instead of what it has raised, because a draft cannot hold a sponsorship at all.
*/

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  const identity = fullName(profile);
  const nav = dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] });
  const today = new Date();

  /*
    No organizer profile yet, so there is nothing to run and nothing to count. Four zeroes would
    read as facts about a fundraiser that does not exist, so the page is one card and one way in.
  */
  if (!act) {
    const head = headlineParts(identity ?? "Today");
    return (
      <DashboardShell
        current="/dashboard"
        nav={nav}
        identity={identity}
        eyebrow={null}
        title={head.title}
        accent={head.accent}
        intro={<p className="max-w-[52ch] text-[19px] leading-[1.35] text-ink">Nothing is waiting on you. A fundraiser is how sponsors find your work.</p>}
        action={
          <ButtonLink href="/dashboard/runs/new" register="desk" variant="solid">
            Create a fundraiser
          </ButtonLink>
        }
      >
        <Card title="Your first fundraiser" subtitle="What the money is for, who it reaches, and what a sponsor receives" className="max-w-[720px]">
          <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
            Door Money asks for those three answers, then you price what a sponsor can have. Nothing is public until you publish it.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <ButtonLink href="/dashboard/runs/new" register="desk" variant="solid">
              Create a fundraiser
            </ButtonLink>
            <Link href="/fundraisers" className="text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
              Browse projects to sponsor
            </Link>
          </div>
        </Card>
      </DashboardShell>
    );
  }

  const [loaded, sponsorships] = await Promise.all([loadDashboard(act), loadHomeSponsorships(act, today)]);
  const view = withToday(loaded, today);
  const selected = view.selected;
  // The same fundraiser, from the loader that reads every one of them: the category and the goal
  // live there, and nothing here asks the database a second time for either.
  const summary = selected ? sponsorships.rows.find((r) => r.id === selected.id) ?? null : null;
  const categoryKey = summary?.categoryKey ?? "music";
  const words = categoryWords(categoryKey, selected?.kind);
  const period = periodOf(selected?.kind);
  const head = headlineParts(act.name);
  const metrics = selected && selected.status !== "draft" ? view.metrics : null;
  const runHref = selected ? `/dashboard/runs/${selected.id}` : "/dashboard/runs";

  /*
    What is waiting on this organizer, and only that. A paid sponsorship whose materials have not
    arrived is waiting on the sponsor, so it is counted nowhere in this number and is said in one
    quiet line under the rows instead.
  */
  const mine = view.preparation.filter((item) => item.key !== "no-logo");
  const waiting = waitingCount(mine);
  const toDecide = view.work.filter((w) => w.logo === "review");
  const dated = mine.filter((item) => item.date !== null);
  const stillOwed = view.preparation.find((item) => item.key === "no-logo") ?? null;

  // A draft holds no sponsorship and no dates, so what is waiting on one is its own checklist.
  const draftStep = selected?.status === "draft" ? summary?.draftStep ?? null : null;
  const sentence = todayLine({
    waiting,
    nextDate: view.nextShow ? { on: view.nextShow.played_on, city: view.nextShow.city } : null,
    unit: period.unit,
    draft: draftStep,
    hasFundraiser: Boolean(selected),
  });

  const goalCents = selected?.goalCents ?? null;

  return (
    <DashboardShell
      current="/dashboard"
      nav={nav}
      actName={act.name}
      actSlug={act.slug}
      identity={identity}
      theme={themeFor(act.slug)}
      eyebrow={null}
      title={head.title}
      accent={head.accent}
      titleAside={
        selected && (
          <Badge kind={selected.status === "draft" ? "neutral" : "ok"}>
            {selected.title} &middot; {lifecycleLabel(selected.status)}
          </Badge>
        )
      }
      intro={<p className="max-w-[52ch] text-[19px] leading-[1.35] text-ink">{sentence}</p>}
      action={
        <ButtonLink href="/dashboard/runs/new" register="desk" variant="solid">
          Create fundraiser
        </ButtonLink>
      }
    >
      {(view.failed || sponsorships.failed) && (
        <Card className="mb-5">
          <p className="flex items-start gap-2.5 text-[15px] leading-[1.6] text-ink">
            <Warning size={18} aria-hidden="true" className="mt-0.5 flex-none text-attention-ink" />
            Some of this could not be loaded, so a figure below may be missing rather than zero. Reload to try again.
          </p>
        </Card>
      )}

      {metrics && selected && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label={goalCents ? `Raised toward ${formatMoney(goalCents)}` : "Raised"}
            value={formatMoney(metrics.raisedCents)}
            extra={<MoneyBar paidCents={metrics.raisedCents} bidsCents={metrics.bidsCents} goalCents={goalCents} />}
            sub={metrics.bidsCents > 0 ? `${formatMoney(metrics.bidsCents)} more is bid and held until close` : undefined}
          />
          <Kpi
            label="Sponsorships"
            value={
              <>
                {metrics.sponsorshipsSold} <KpiUnit>sold</KpiUnit>
                {metrics.optionsWithBids > 0 && (
                  <>
                    {" "}
                    &middot; {metrics.optionsWithBids} <KpiUnit>with bids</KpiUnit>
                  </>
                )}
              </>
            }
            sub={metrics.optionsOpen > 0 ? `${metrics.optionsOpen} ${plural(metrics.optionsOpen, "option", "options")} still open` : undefined}
          />
          <Kpi
            label="Coming to you"
            value={formatMoney(organizerShareCents(metrics.raisedCents, SITE.feePercent))}
            sub={`After the ${SITE.feePercent}% fee · ${formatMoney(view.payouts.paidCents)} released so far`}
          />
          {view.nextShow ? (
            <Kpi
              label={`Next ${period.unit}`}
              value={formatWeekdayDay(view.nextShow.played_on)}
              sub={[view.nextShow.city, `${metrics.showsPlayed} of ${metrics.showsTotal} played`].filter(Boolean).join(" · ")}
            />
          ) : (
            summary?.closesOn && <Kpi label="Fundraising ends" value={formatDay(summary.closesOn)} />
          )}
        </div>
      )}

      {/* Two columns while there is money to talk about. A draft has none, so the work takes the width. */}
      <div className={`mb-5 grid items-start gap-3.5 ${metrics ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]" : ""}`}>
        <Card
          title="Needs you"
          subtitle={waiting > 0 ? "Ordered by what is due first" : draftStep?.label ? "Before this draft can be published" : undefined}
          right={waiting > 0 ? <Badge kind="attention">{waiting}</Badge> : undefined}
        >
          {waiting === 0 && !draftStep?.label && (
            <p className="text-[15px] leading-[1.6] text-muted">
              {selected ? "Nothing is waiting on you." : "Nothing is waiting on you yet."}
            </p>
          )}

          {draftStep?.label && (
            <TaskRow
              title={draftStep.label}
              detail={draftStep.note ?? undefined}
              actions={
                <ButtonLink href={draftStep.href ?? runHref} register="desk" variant="outline" size="sm">
                  Open the draft
                </ButtonLink>
              }
            />
          )}

          {toDecide.map((row) => (
            <TaskRow
              key={row.id}
              lead={<MaterialsThumb row={row} word={words.materials} />}
              title={`${words.materials === "logo" ? "Approve" : "Accept"} the ${words.materials} for ${row.option}`}
              detail={materialsDetail(row)}
              actions={<TaskDecision purchaseId={row.id} categoryKey={categoryKey} what={row.option} />}
            />
          ))}

          {dated.map((item) => (
            <TaskRow
              key={item.key}
              lead={item.date ? <TaskDate {...dayAndMonth(item.date)} /> : undefined}
              title={sentenceCase(item.label)}
              detail={item.date ? `The first is ${formatWeekdayDay(item.date)}` : undefined}
              actions={
                <ButtonLink href={item.href} register="desk" variant="outline" size="sm">
                  {DATED_ACTION[item.key] ?? "Open the dates"}
                </ButtonLink>
              }
            />
          ))}

          {stillOwed && (
            <p className="mt-1 text-[14px] leading-[1.6] text-muted">
              No rush: {stillOwed.count} paid {plural(stillOwed.count, "sponsorship has", "sponsorships have")} no {words.materials} yet. Door Money
              writes to the sponsor.{" "}
              <Link href={runHref} className="text-accent-ink underline decoration-1 underline-offset-4">
                See the sponsorships
              </Link>
            </p>
          )}
        </Card>

        {metrics && selected && (
          <Card
            title="Money"
            subtitle={`How it moves on ${selected.title}`}
            right={
              <Link href="/dashboard/payouts" className="text-accent-ink underline decoration-1 underline-offset-4">
                All payments
              </Link>
            }
          >
            <p className="text-[15px] leading-[1.6] text-ink">
              Sponsors have paid <b className="font-medium">{formatMoney(metrics.raisedCents)}</b>
              {metrics.bidsCents > 0 && (
                <>
                  {" "}
                  and bid another <b className="font-medium">{formatMoney(metrics.bidsCents)}</b>
                </>
              )}
              . {releaseLine(words.materials === "logo", period.noun)}
            </p>
            <MoneyBar paidCents={metrics.raisedCents} bidsCents={metrics.bidsCents} goalCents={goalCents} height={8} />
            <dl className="flex flex-col text-[14px]">
              <MoneyRow label="Paid" value={formatMoney(metrics.raisedCents)} />
              <MoneyRow label="Bid, held on a card until close" value={formatMoney(metrics.bidsCents)} />
              <MoneyRow label={`Coming to you after the ${SITE.feePercent}% fee`} value={formatMoney(organizerShareCents(metrics.raisedCents, SITE.feePercent))} />
              <MoneyRow label="Released so far" value={formatMoney(view.payouts.paidCents)} />
            </dl>
          </Card>
        )}
      </div>

      <Card
        title="Fundraisers"
        right={
          <Link href="/dashboard/runs" className="text-accent-ink underline decoration-1 underline-offset-4">
            See all
          </Link>
        }
      >
        {sponsorships.rows.length === 0 ? (
          <p className="text-[15px] leading-[1.6] text-muted">Nothing here yet. The first one can stay a private draft for as long as you like.</p>
        ) : (
          /* A table has more columns than a phone has room for, so this one scrolls inside its own frame. */
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="min-w-[700px]">
              <Table
                columns={[
                  { key: "name", label: "Name", width: "minmax(0,2fr)" },
                  { key: "status", label: "Status", width: "minmax(0,1fr)" },
                  { key: "raised", label: "Raised", width: "minmax(0,1.5fr)" },
                  { key: "next", label: "Next date", width: "minmax(0,1.4fr)" },
                  { key: "waiting", label: "Waiting on you", width: "minmax(0,1.1fr)" },
                ]}
                rows={sponsorships.rows.map(fundraiserRow)}
              />
            </div>
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}

/* ------------------------------------------------------------------ the sentence */

/** What a draft still owes, in the words its own checklist uses. */
type DraftStep = { done: number; total: number; label: string | null };

/**
 * The one line under the organizer's name.
 *
 * It says how much is waiting and when the next thing is due, and nothing it cannot back: no date
 * where there are no dates, and no count where there is no fundraiser. A draft is on its own
 * sentence, because money and dates say nothing about one.
 */
function todayLine(input: { waiting: number; nextDate: { on: string; city: string | null } | null; unit: string; draft: DraftStep | null; hasFundraiser: boolean }): string {
  const { waiting, nextDate, unit, draft, hasFundraiser } = input;
  const where = nextDate ? `${formatWeekdayDay(nextDate.on)}${nextDate.city ? ` in ${nextDate.city}` : ""}` : null;

  if (draft) {
    if (!draft.label) return "This draft has everything it needs. Look it over, then publish it.";
    return `${draft.done} of ${draft.total} steps are done on this draft. ${draft.label} is next.`;
  }
  if (!hasFundraiser) return "Nothing is waiting on you. A fundraiser is how sponsors find your work.";
  if (waiting === 0) return where ? `Nothing is waiting on you. The next ${unit} is ${where}.` : "Nothing is waiting on you.";
  const things = `${waiting} ${plural(waiting, "thing needs", "things need")} you`;
  return where ? `${things} before the next ${unit}, ${where}.` : `${things}.`;
}

/* ------------------------------------------------------------------ pieces */

/** What the row's own button says. Music's dates are the only ones any category has today. */
const DATED_ACTION: Record<string, string> = {
  place: "Add venues",
  attendance: "Add attendance",
  photo: "Add photos",
};

const STATUS_KIND: Record<string, BadgeKind> = { open: "ok", live: "ok" };

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What one sponsor sent, as it was sent, or the shape of what is missing. */
function MaterialsThumb({ row, word }: { row: WorkRow; word: string }) {
  if (row.markUrl) {
    /* A plain image: the address is whatever the marks bucket holds, and the optimizer only fetches
       what it has been told about. It is decoration, and the row says whose it is in words. */
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={row.markUrl} alt="" className="h-10 w-16 rounded-[4px] border border-line bg-neutral-wash object-contain p-0.5" />;
  }
  return (
    <span className="flex h-10 w-16 items-center justify-center rounded-[4px] border border-dashed border-field-line text-[14px] text-muted">{row.markText ? "Name" : word}</span>
  );
}

/** Who sent it, what they paid, when it arrived, and where the offer says it goes. */
function materialsDetail(row: WorkRow): string {
  return [
    row.sponsor,
    formatMoney(row.amountCents),
    row.submittedAt ? `sent ${formatDay(row.submittedAt.slice(0, 10))}` : null,
    row.placement,
  ]
    .filter(Boolean)
    .join(" · ");
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/**
 * How the share reaches the organizer, which is the one thing about money that is not the same in
 * every category: music is on the calendar rule and everybody else is on the evidence rule
 * (docs/DELIVERY_POLICY_MATRIX.md).
 */
function releaseLine(music: boolean, periodNoun: string): string {
  return music
    ? `Door Money holds it and pays your share in weekly slices, every Friday through the ${periodNoun}.`
    : "Door Money holds it and releases your share one deliverable at a time, as you document each one.";
}

/** One fundraiser, as a row. A draft says how far it has come; everything else says what it holds. */
function fundraiserRow(run: HomeSponsorship): DeskRow {
  const draft = run.draftStep;
  return {
    key: run.id,
    href: `/dashboard/runs/${run.id}`,
    label: run.title,
    cells: [
      <>
        <span className="font-medium">{run.title}</span>
        {run.period && <span className="text-muted"> &middot; {run.period}</span>}
      </>,
      <Badge key="status" kind={STATUS_KIND[run.status] ?? "neutral"}>
        {lifecycleLabel(run.status)}
      </Badge>,
      draft ? (
        <span className="text-muted">Not published</span>
      ) : (
        <span className="tabular-nums">
          {formatMoney(run.raisedCents)}
          {run.goalCents ? <span className="text-muted"> of {formatMoney(run.goalCents)}</span> : null}
        </span>
      ),
      draft ? (
        <span className="text-muted">{draft.label ?? "Ready to publish"}</span>
      ) : run.nextDate ? (
        <span>
          {formatWeekdayDay(run.nextDate.on)}
          {run.nextDate.city && <span className="text-muted"> &middot; {run.nextDate.city}</span>}
        </span>
      ) : null,
      draft ? (
        <span className="text-muted">
          {draft.done} of {draft.total} steps done
        </span>
      ) : run.waitingCount > 0 ? (
        <Badge key="waiting" kind="attention">
          {run.waitingCount} waiting
        </Badge>
      ) : null,
    ],
  };
}
