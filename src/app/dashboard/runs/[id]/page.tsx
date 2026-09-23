import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { ReadinessChecklist } from "@/components/ReadinessChecklist";
import { RunForm, type RunInput } from "@/components/RunForm";
import { LotsEditor, type ExistingLot } from "@/components/LotsEditor";
import { ShowsPanel, type ShowRow } from "@/components/ShowsPanel";
import { VerificationEditor } from "@/components/VerificationEditor";
import { DeliveryPanel } from "@/components/DeliveryPanel";
import { LifecycleStrip, MetricRow, NextShowPanel, PreviewLink } from "@/components/dashboard/panels";
import { ShareFundraiser } from "@/components/dashboard/ShareFundraiser";
import { SponsorshipWorkTable } from "@/components/dashboard/SponsorshipWorkTable";
import { loadDashboard, withToday } from "@/lib/dashboard";
import { loadRunDelivery } from "@/lib/delivery-dashboard";
import { loadOfferPolicy, policyStatements } from "@/lib/offer-policy";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardNav, isShareable, previewTarget } from "@/lib/dashboardModel";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { FundraiserDraftForm } from "@/components/FundraiserDraftForm";
import { FundraiserStages } from "@/components/FundraiserStages";
import { categoryStatus, draftCategories, draftDiscoveryRegistry, loadFundraiserDraft } from "@/app/actions/drafts";
import { STAGE_HEADING, STAGE_LABEL, isFormStage, isJourneyStage, resumeStage, stageFromParam, stageMissing, stagePath, type FormStage, type JourneyStage } from "@/lib/fundraiser-stages";
import { DraftPublishControls } from "@/components/DraftPublishControls";
import { SponsorshipBuilder, type NoTemplatesReason } from "@/components/SponsorshipBuilder";
import { savedOptionKeys, type BuilderLot } from "@/lib/sponsorship-builder";
import { incompleteOffers } from "@/lib/offer-readiness";
import { publishBlockers } from "@/lib/readiness";
import { formatMoney } from "@/lib/money";
import { entityKindLabel } from "@/lib/participation";
import { SITE } from "@/lib/site";
import { templatesForFundraiser } from "@/lib/opportunities";
import { loadTemplates } from "@/lib/opportunity-templates";
import { formatDateRange } from "@/lib/dates";
import { periodOf } from "@/lib/periods";
import { runUrl } from "@/lib/urls";
import { kitFitsCategory, starterKit, suggestedTemplates } from "@/lib/starter-kits";

export const metadata: Metadata = { title: "The fundraiser" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_LABEL: Record<string, string> = { draft: "Draft, not public", open: "Open, taking bids and orders", live: "Live, the shows are on", closed: "Closed", cancelled: "Cancelled" };
/** Only "live" needs the category: outside music there are no shows to be on. */
const statusLabel = (status: string, music: boolean) =>
  (!music && status === "live" ? "Live, the work is under way" : STATUS_LABEL[status]) ?? status;

export default async function RunPage({ params, searchParams }: Props) {
  const [{ id }, { kit: kitParam, stage: stageParam }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/dashboard/runs/${id}`);
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  if (!act) redirect("/dashboard/act/new");
  const identity = fullName(profile);

  const sb = await supabaseServer();
  const { data: run } = await sb
    .from("runs")
    .select("id,slug,category_key,category_details,kind,title,starts_on,ends_on,show_count,expected_attendance,bidding_closes_at,status,verification_methods,verification_other,purpose,audience_description,sponsor_promise")
    .eq("id", id)
    .eq("act_id", act.id)
    .maybeSingle();
  if (!run) notFound();

  /*
    A draft is written in stages (src/lib/fundraiser-stages.ts). The address names the stage when
    somebody is on one, and a draft opened with no stage named resumes at the first stage that
    still has something to say. Once the project and the funding are both answered, or when the
    address asks for a later stage, the fundraiser's workspace opens: that is where the sponsorship
    options are priced and where the readiness checklist says what is still owed, so continuing past
    an unfinished stage is allowed and is answered there rather than refused here.
  */
  const music = run.category_key === "music";
  const kit = typeof kitParam === "string" ? starterKit(kitParam) : null;
  const kitCarried = kit && run.status === "draft" && kitFitsCategory(kit, run.category_key ?? "music") ? kit.key : null;
  const stageAsked = stageFromParam(stageParam);
  const categoryKey = run.category_key ?? "music";
  // The options this fundraiser can price, from the registry in the database, so a category added
  // there has an editor. Music narrows by act type; no other category does. A retired template the
  // fundraiser already has spots on stays editable, so nothing is stranded.
  const { data: lots } = await sb.from("lots").select("id,surface_key,label,price_cents,mode,status,buy_now_cents,reach_estimate,reach_basis,offer_terms,exclusive,terms_grandfathered").eq("run_id", id).order("created_at");
  const allLots = (lots ?? []) as BuilderLot[];
  const registry = await loadTemplates(sb, categoryKey);
  const surfaces = templatesForFundraiser(registry, categoryKey, act.type);
  const offerable = [...surfaces, ...registry.filter((t) => !surfaces.some((s) => s.key === t.key) && allLots.some((l) => l.surface_key === t.key))];
  const optionCount = savedOptionKeys(allLots).length;
  if (run.status === "draft") {
    const draft = await loadFundraiserDraft(id);
    if (!draft) notFound();
    const stage: JourneyStage | null = isJourneyStage(stageAsked) ? stageAsked : stageAsked ? null : resumeStage(draft, { optionCount, hasTemplates: offerable.length > 0 });
    if (stage) {
      const heading = STAGE_HEADING[stage];
      const shell = { current: "/dashboard", nav: dashboardNav({ hasAct: true, roles: profile?.roles ?? [] }), actName: act.name, identity, eyebrow: `Private draft \u00b7 ${draft.title || "New fundraiser"}`, title: heading.title, accent: heading.accent, intro: <p>{heading.intro}</p> };
      if (isFormStage(stage)) {
        return <DashboardShell {...shell}>
          <FundraiserStages current={stage} className="mb-7 max-w-[760px]" />
          <Card>
            <FundraiserDraftForm
              draft={draft}
              stage={stage}
              categories={await draftCategories()}
              musicOrganizer={act.type !== null}
              discovery={await draftDiscoveryRegistry()}
              organizer={{ name: act.name, photoUrl: act.photo_url, kindLabel: entityKindLabel(act.entity_kind), slug: act.slug, host: SITE.url.replace(/^https?:\/\//, "") }}
              carriedKit={kitCarried}
              backHref="/dashboard/runs"
            />
          </Card>
        </DashboardShell>;
      }
      // The sponsorships stage: one option at a time, through the workspace editor's own action.
      const { label, publishEnabled } = await categoryStatus(categoryKey);
      const offerPolicy = await loadOfferPolicy(sb, categoryKey);
      const noTemplatesReason: NoTemplatesReason | null = offerable.length > 0 ? null : music && !act.type ? "music_type" : "none";
      return <DashboardShell {...shell}>
        <FundraiserStages current="sponsorships" className="mb-7 max-w-[760px]" />
        <Card>
          <SponsorshipBuilder
            runId={run.id}
            categoryLabel={label}
            templates={offerable}
            lots={allLots}
            policy={policyStatements(offerPolicy)}
            materialsWindowDays={offerPolicy?.materialsWindowDays ?? null}
            suggestedKeys={kit && kit.enabled && kitCarried ? suggestedTemplates(kit, surfaces).map((t) => t.key) : []}
            kitLabel={kit && kitCarried ? kit.label : null}
            goalCents={draft.goal_cents ?? null}
            sponsorPromise={draft.sponsor_promise ?? null}
            publishable={publishEnabled}
            noTemplatesReason={noTemplatesReason}
            continueHref={stagePath(run.id, "review", kitCarried)}
            backHref={stagePath(run.id, "funding", kitCarried)}
          />
        </Card>
      </DashboardShell>;
    }
  }

  const { label: categoryLabel, publishEnabled: categoryPublishable } = await categoryStatus(categoryKey);
  const { data: shows } = await sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", id).order("played_on");
  // What this category's delivery policy decides about cancelling, refunds and materials that never
  // arrive. Stated in the offer editor, never chosen there: those terms belong to the policy the
  // purchase is recorded under, not to one organizer's offer.
  const offerPolicy = await loadOfferPolicy(sb, categoryKey);
  // The starter kit this draft began from, where the address still carries it. It is not stored
  // with the fundraiser, and one from another category is ignored. It names options to look at and
  // ticks none of them.
  const kitSuggestions = kit && kit.enabled && kitCarried ? suggestedTemplates(kit, surfaces) : [];
  const boardHref = runUrl(act.slug, run.slug);
  // What this fundraiser still owes its sponsors. Read under the organizer's own session, so row
  // level security decides. Empty for music, which releases on its calendar and owes no rows.
  // What a waiting sponsor sent is read with the service role, and only for the purchases the
  // organizer's own session returned, so it cannot reach anybody else's fundraiser.
  const delivery = await loadRunDelivery(sb, allLots.map((l) => l.id), supabaseAdmin());
  const methods: string[] = run.verification_methods ?? [];
  const settled = run.status === "closed" || run.status === "cancelled";

  /*
    How this fundraiser is going, as opposed to how it is set up.

    These panels used to live on /dashboard, which was a per-fundraiser cockpit before it became a
    home. They belong to one fundraiser, so they belong here. A draft skips the read entirely: it
    can hold no sponsorship until it is published, so there would be nothing to count.

    The metrics are music's shape (shows played, days left against an end date), so they are drawn
    on the same terms the old dashboard drew them: a music fundraiser with a format and both dates.
  */
  const view = run.status === "draft" ? null : withToday(await loadDashboard(act, run.id), new Date());
  const work = view?.work ?? [];
  const showMetrics = Boolean(view?.metrics && music && act.type && run.kind && run.starts_on && run.ends_on);
  const target = previewTarget({ id: run.id, slug: run.slug, status: run.status }, act.slug);
  // The same rules publishRun runs, so the checklist, the publish button and the refusal agree.
  const readinessInput = {
    act,
    run: { ...run, methods, other: run.verification_other ?? null },
    lotCount: allLots.length,
    auctionCount: allLots.filter((l) => l.mode === "auction").length,
    categoryPublishable,
    incompleteOffers: incompleteOffers(allLots, registry),
  };
  const blockers = run.status === "draft" ? publishBlockers(readinessInput) : [];

  return (
    <DashboardShell
      current="/dashboard"
      nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })}
      actName={act.name}
      identity={identity}
      eyebrow={statusLabel(run.status, music)}
      title={run.title}
      accent=""
      intro={
        <p className="caps">
          {/* Music counts its shows only once it has a count and both dates; a draft with neither says what it is. */}
          {music && run.show_count !== null && run.starts_on && run.ends_on
            ? `${run.show_count} ${run.kind === "season" ? "gigs" : "shows"}, ${formatDateRange(run.starts_on, run.ends_on)}.`
            : run.starts_on && run.ends_on
              ? `${categoryLabel}, ${formatDateRange(run.starts_on, run.ends_on)}.`
              : categoryLabel}
        </p>
      }
    >
      {/* The way to look at it, which a closed fundraiser had no link to at all. */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <PreviewLink href={target.path} label={target.label} />
        {isShareable(run.status) && <ShareFundraiser url={boardHref} />}
      </div>

      {run.status !== "cancelled" && (
        <Card className="mb-10">
          <CardHead eyebrow="How it is going">
            {view?.metrics && view.metrics.sponsorshipsSold > 0 ? "Sponsorships sold" : "Nothing sold yet"}
          </CardHead>
          <LifecycleStrip status={run.status} />
          {showMetrics && view?.metrics && (
            <div className="mt-6">
              <MetricRow metrics={view.metrics} />
            </div>
          )}
        </Card>
      )}

      {!settled && (
        <Card className="mb-10 max-w-[860px]">
          <CardHead eyebrow="Where this stands">{run.status === "draft" ? "Before it goes up" : "The fundraiser is up"}</CardHead>
          <ReadinessChecklist input={readinessInput} previewHref={`/dashboard/runs/${run.id}/preview`} />
        </Card>
      )}

      {run.status === "draft" ? (
        <Card id="placements" className="mb-10">
          <CardHead eyebrow={`Stage three of four \u00b7 ${STAGE_LABEL.sponsorships}`}>The sponsorship options</CardHead>
          <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
            Built one at a time on the sponsorships stage, each with its own placement, price and terms. Sold options stay as they are.
          </p>
          <DraftOptionsSummary lots={allLots} templates={offerable} href={stagePath(run.id, "sponsorships", kitCarried)} />
          <div className="mt-8 border-t border-line pt-6">
            <DraftPublishControls runId={run.id} publishable={categoryPublishable} optionCount={optionCount} blockers={blockers} />
          </div>
        </Card>
      ) : (
      <Card id="placements" className="mb-10">
        <CardHead eyebrow="Sponsorship options">Price the sponsorship options</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
          {music
            ? "The suggested prices for this kind of musician. They are a starting point; your own number always wins. Sold options stay as they are."
            : "No prices are suggested here yet, so your own number is the only number. Offer only what you can deliver. Sold options stay as they are."}
        </p>
        {kit && kitSuggestions.length > 0 && (
          <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
            The starter kit you began with, {kit.label}, suggests looking at: {kitSuggestions.map((t) => t.name).join(", ")}.
            Nothing is offered until you tick it and set its price.
          </p>
        )}
        {/* Music's options are narrowed by the kind of musician, and a music organizer set up with the one-question flow has not said which yet. */}
        {music && !act.type && (
          <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
            Music&apos;s sponsorship options depend on what kind of musician this is: a touring band, a house act or a soloist.{" "}
            <Link href="/dashboard/act" className="text-accent-ink underline decoration-1 underline-offset-4">Say which on the organizer page</Link> and the options appear here.
          </p>
        )}
        {/* A category with no templates (Other, today). Nothing is invented to fill the list. */}
        {surfaces.length === 0 && !(music && !act.type) && (
          <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
            This category has no sponsorship options to choose from yet. Your draft keeps what you wrote about the funding, the
            audience and what a sponsor receives, and that statement is the whole offer for now.
          </p>
        )}
        <LotsEditor
          runId={run.id}
          runStatus={run.status}
          surfaces={surfaces}
          lots={allLots as ExistingLot[]}
          boardHref={boardHref}
          publishable={categoryPublishable}
          policy={policyStatements(offerPolicy)}
          materialsWindowDays={offerPolicy?.materialsWindowDays ?? null}
        />
      </Card>
      )}

      <Card id="verification" className="mb-10 max-w-[860px]">
        <CardHead eyebrow={run.status === "draft" ? `Stage four of four · ${STAGE_LABEL.review}` : "Verification"}>How the placements will be recorded</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
          Select what sponsors will receive or be able to review afterward. Only the methods chosen here go on the public page, and it never
          claims more than that.
        </p>
        <VerificationEditor runId={run.id} methods={methods} other={run.verification_other ?? null} runStatus={run.status} categoryKey={run.category_key ?? "music"} />
      </Card>

      {delivery.length > 0 && (
        <Card id="delivery" className="mb-10 max-w-[860px]">
          <CardHead eyebrow="Delivery">Accept what sponsors send, then document what you delivered</CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] text-muted">
            Each sponsor sends what their sponsorship needs: a name as it should read, a credit line, artwork. Accept it or decline it here.{" "}
            Door Money holds each sponsor&apos;s money until you document what they bought, and releases your share on the Friday after. Add a
            link or a note for each one. Door Money checks that it is there, never whether it is good, and passes it on to the sponsor.
          </p>
          <DeliveryPanel rows={delivery} categoryKey={run.category_key ?? "music"} youth={(run.category_details as Record<string, string> | null)?.level === "youth"} />
        </Card>
      )}

      {/*
        Every sponsorship on this fundraiser, and the one thing worth doing to each.

        Shown when the delivery panel above is not, which is exactly when the fundraiser is on the
        calendar rule rather than the evidence rule. Music is that case, and this is the only place
        a music organizer can accept or decline what a sponsor sent: `deliverables` carries no rows
        for a calendar fundraiser, so DeliveryPanel never draws for one.
      */}
      {delivery.length === 0 && work.length > 0 && (
        <Card id="sponsorship-work" className="mb-10">
          <CardHead eyebrow="Sponsorships">What needs your attention</CardHead>
          <SponsorshipWorkTable rows={work} categoryKey={run.category_key ?? "music"} />
        </Card>
      )}

      {music && view && (
        <div className="mb-10 max-w-[520px]">
          <NextShowPanel show={view.nextShow} runId={run.id} preparation={view.preparation} />
        </div>
      )}

      {music && <Card id="shows" className="mb-10">
        <CardHead eyebrow="The shows">Every date on the {periodOf(run.kind).noun}</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
          Enter the dates once. As they happen, one tap marks a show played. A photo and a headcount are optional and go on the record patrons get at the end.
        </p>
        <ShowsPanel runId={run.id} shows={(shows ?? []) as ShowRow[]} defaultCity={act.city ?? ""} />
      </Card>}

      <Card id="run-details" className="max-w-[760px]">
        <CardHead eyebrow="The fundraiser">{run.status === "draft" ? "The project and the funding" : "Dates and details"}</CardHead>
        {run.status === "draft"
          ? <DraftStageSummary run={run} kit={kitCarried} />
          : music
            ? <RunForm run={run as RunInput} actType={act.type} />
            : <p className="max-w-[60ch] text-[15px] text-muted">
                While this fundraiser is public its details stay as they are, so a sponsor reads the same promise they bought.
                Take it back to draft to change them, which works until a sponsorship sells.
              </p>}
      </Card>
    </DashboardShell>
  );
}


/**
 * The first two stages of a draft, read back, each with the way into it. What is missing is named
 * from the resume rule, which is not the publish gate: the checklist above says what publishing
 * still wants, and this says what was written.
 */
function DraftStageSummary({ run, kit }: {
  run: { id: string; title: string | null; purpose: string | null; audience_description: string | null; sponsor_promise: string | null };
  kit: string | null;
}) {
  const rows: { stage: FormStage; lines: { label: string; value: string | null }[] }[] = [
    { stage: "project", lines: [{ label: "Name", value: run.title }, { label: "Who will experience it", value: run.audience_description }] },
    { stage: "funding", lines: [{ label: "What the funding enables", value: run.purpose }, { label: "What sponsors can count on", value: run.sponsor_promise }] },
  ];
  return (
    <ul className="divide-y divide-line">
      {rows.map(({ stage, lines }) => {
        const missing = stageMissing(run, stage);
        return (
          <li key={stage} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="caps mb-2 text-[14px] text-muted">{STAGE_LABEL[stage]}</p>
              {lines.map((line) => (
                <p key={line.label} className="text-[15px] leading-[1.6]">
                  <span className="text-muted">{line.label}: </span>
                  {line.value?.trim() ? line.value : <span className="text-muted">not yet said</span>}
                </p>
              ))}
              {missing.length > 0 && <p className="mt-2 text-[14.5px] text-accent-ink">Still to say: {missing.join(", ")}.</p>}
            </div>
            <Link href={stagePath(run.id, stage, kit)} className="caps inline-flex min-h-[44px] items-center text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
              Edit the {STAGE_LABEL[stage].toLowerCase()}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The options a draft offers, read back, and the way into the stage that edits them. */
function DraftOptionsSummary({ lots, templates, href }: { lots: BuilderLot[]; templates: { key: string; name: string }[]; href: string }) {
  const keys = savedOptionKeys(lots);
  return (
    <div>
      {keys.length === 0 ? (
        <p className="text-[15px] text-muted">No sponsorship option yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {keys.map((key) => {
            const mine = lots.filter((l) => l.surface_key === key);
            const name = templates.find((t) => t.key === key)?.name ?? key;
            const locked = mine.some((l) => l.status !== "open");
            return (
              <li key={key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 first:pt-0">
                <span className="text-[15px]">{name}</span>
                <span className="text-[14.5px] text-muted">
                  {formatMoney(mine[0].price_cents)} {mine[0].mode === "auction" ? "reserve" : "each"} · {mine.length} {mine.length === 1 ? "spot" : "spots"}{locked ? " · terms settled" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4">
        <Link href={href} className="caps inline-flex min-h-[44px] items-center text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
          {keys.length === 0 ? "Build the first option" : "Edit the options"}
        </Link>
      </p>
    </div>
  );
}
