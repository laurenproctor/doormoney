import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/Button";
import { DashboardShell } from "@/components/DashboardShell";
import { DeliveryPanel } from "@/components/DeliveryPanel";
import { FundraiserDraftForm } from "@/components/FundraiserDraftForm";
import { FundraiserStages } from "@/components/FundraiserStages";
import { LotsEditor, type ExistingLot } from "@/components/LotsEditor";
import { RunForm, type RunInput } from "@/components/RunForm";
import { ShowsPanel, type ShowRow } from "@/components/ShowsPanel";
import { SponsorshipBuilder, type NoTemplatesReason } from "@/components/SponsorshipBuilder";
import { VerificationEditor } from "@/components/VerificationEditor";
import { themeFor } from "@/components/Theme";
import { Copy, Launch, Warning } from "@/components/dashboard/icons";
import { MaterialsThumb, materialsDetail } from "@/components/dashboard/MaterialsThumb";
import { ShareFundraiser } from "@/components/dashboard/ShareFundraiser";
import { SponsorshipWorkTable } from "@/components/dashboard/SponsorshipWorkTable";
import { TaskDecision } from "@/components/dashboard/TaskDecision";
import { Badge, Card, Kpi, KpiUnit, MoneyBar, RunStrip, Table, Tabs, TaskDate, TaskRow, type BadgeKind, type DeskRow } from "@/components/desk";
import { FundraiserReview } from "@/components/review/FundraiserReview";
import { PublishedNotice } from "@/components/review/PublishedNotice";
import { categoryStatus, draftCategories, draftDiscoveryRegistry, loadFundraiserDraft } from "@/app/actions/drafts";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { categoryWords } from "@/lib/category-words";
import { loadDashboard, withToday } from "@/lib/dashboard";
import { lifecycleLabel, organizerShareCents, plural, previewTarget, isShareable, dashboardNav, waitingCount, type PrepItem, type WorkRow } from "@/lib/dashboardModel";
import { clockOf, dayAndMonth, formatDateRange, formatWeekdayDay, weekdayOf } from "@/lib/dates";
import { loadRunDelivery } from "@/lib/delivery-dashboard";
import { embedSnippet } from "@/lib/fundraiser-identity";
import { STAGE_HEADING, STAGE_LABEL, isFormStage, isJourneyStage, resumeStage, stageFromParam, stageMissing, stagePath, type FormStage, type JourneyStage } from "@/lib/fundraiser-stages";
import { currentTab, fundraiserTabs, readinessHref, tabFromParam, type FundraiserTab } from "@/lib/fundraiser-tabs";
import { formatMoney } from "@/lib/money";
import { fullName, headlineParts } from "@/lib/names";
import { incompleteOffers } from "@/lib/offer-readiness";
import { loadOfferPolicy, policyStatements, releaseSentenceFor } from "@/lib/offer-policy";
import { templatesForFundraiser } from "@/lib/opportunities";
import { loadTemplates } from "@/lib/opportunity-templates";
import { entityKindLabel } from "@/lib/participation";
import { periodOf } from "@/lib/periods";
import { draftProgress, publishBlockers, readiness, type ReadinessRow } from "@/lib/readiness";
import { collapseOptions, optionRows, type OptionRow, type OptionState } from "@/lib/run-options";
import { SITE } from "@/lib/site";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { savedOptionKeys, type BuilderLot } from "@/lib/sponsorship-builder";
import { kitFitsCategory, starterKit, suggestedTemplates } from "@/lib/starter-kits";
import { actPath, runPath, runUrl } from "@/lib/urls";

export const metadata: Metadata = { title: "The fundraiser" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/*
  One fundraiser, on the Desk register (docs/DESK_REGISTER.md, PR 4).

  The page used to be nine cards stacked down one column, every one of them open whether or not it
  had anything in it. It is five tabs now, and the tab is in the address, so the page stays a
  server component, a section can be sent to somebody, and the back button works.

  Overview is what is happening: four figures, what is waiting on the organizer beside the picture
  of the period, and every sponsorship option with the one thing worth doing to it. The other four
  are the editors, in the frames they were already in: LotsEditor, DeliveryPanel,
  SponsorshipWorkTable, ShowsPanel, RunForm and VerificationEditor are untouched inside them.

  Nothing here is arithmetic of its own. Every figure comes from src/lib/dashboard.ts or
  src/lib/dashboardModel.ts, the options table is shaped by src/lib/run-options.ts, and money taken
  is the number while money bid is named beside it and never added in.
*/
export default async function RunPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { kit: kitParam, stage: stageParam, published: publishedParam } = sp;
  const user = await requireUser(`/dashboard/runs/${id}`);
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  if (!act) redirect("/dashboard/act/new");
  const identity = fullName(profile);
  const nav = dashboardNav({ hasAct: true, roles: profile?.roles ?? [] });

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
    address asks for a later stage or for a tab, the fundraiser's workspace opens: that is where
    the sponsorship options are priced and where the stepper says what is still owed, so
    continuing past an unfinished stage is allowed and is answered there rather than refused here.
  */
  const music = run.category_key === "music";
  const kit = typeof kitParam === "string" ? starterKit(kitParam) : null;
  const kitCarried = kit && run.status === "draft" && kitFitsCategory(kit, run.category_key ?? "music") ? kit.key : null;
  const stageAsked = stageFromParam(stageParam);
  const tabAsked = tabFromParam(sp.tab);
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
    /*
      Where a draft opens. `resumeStage` always answers a stage now that Review is one, so a draft
      with nothing asked for lands inside the journey rather than on a workspace. Asking for a tab
      is the way out of it: the workspace's editors stay reachable for a draft, and the decision to
      publish is not among them. That is the review stage's, and only the review stage's.
    */
    const stage: JourneyStage | null = tabAsked ? null : isJourneyStage(stageAsked) ? stageAsked : resumeStage(draft, { optionCount, hasTemplates: offerable.length > 0 });
    if (stage) {
      const heading = STAGE_HEADING[stage];
      const shell = { current: "/dashboard/runs", nav, actName: act.name, actSlug: act.slug, identity, theme: themeFor(act.slug), eyebrow: `Private draft · ${draft.title || "New fundraiser"}`, title: heading.title, accent: heading.accent, intro: <p>{heading.intro}</p> };
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
      const { label, publishEnabled: categoryPublishable } = await categoryStatus(categoryKey);
      const stagePolicy = await loadOfferPolicy(sb, categoryKey);
      if (stage === "sponsorships") {
        // The sponsorships stage: one option at a time, through the workspace editor's own action.
        const noTemplatesReason: NoTemplatesReason | null = offerable.length > 0 ? null : music && !act.type ? "music_type" : "none";
        return <DashboardShell {...shell}>
          <FundraiserStages current="sponsorships" className="mb-7 max-w-[760px]" />
          <Card>
            <SponsorshipBuilder
              runId={run.id}
              categoryLabel={label}
              templates={offerable}
              lots={allLots}
              policy={policyStatements(stagePolicy)}
              materialsWindowDays={stagePolicy?.materialsWindowDays ?? null}
              suggestedKeys={kit && kit.enabled && kitCarried ? suggestedTemplates(kit, surfaces).map((t) => t.key) : []}
              kitLabel={kit && kitCarried ? kit.label : null}
              goalCents={draft.goal_cents ?? null}
              sponsorPromise={draft.sponsor_promise ?? null}
              publishable={categoryPublishable}
              noTemplatesReason={noTemplatesReason}
              continueHref={stagePath(run.id, "review", kitCarried)}
              backHref={stagePath(run.id, "funding", kitCarried)}
            />
          </Card>
        </DashboardShell>;
      }
      /*
        The review: the saved fundraiser read back, what is unfinished and where it is fixed, and
        the decision. Readiness is the same input publishRun reads, computed once here, so the
        list, the button and the refusal agree. The real page is offered where it can be drawn:
        music's board is drawn from its dates and count, so before those exist the preview would
        answer 404, and the review says so instead of linking.
      */
      const readinessInput = {
        act,
        run: { ...run, methods: run.verification_methods ?? [], other: run.verification_other ?? null },
        lotCount: allLots.length,
        auctionCount: allLots.filter((l) => l.mode === "auction").length,
        categoryPublishable,
        incompleteOffers: incompleteOffers(allLots, registry),
      };
      const previewReady = !music || Boolean(run.kind && run.starts_on && run.ends_on && run.show_count !== null);
      return <DashboardShell {...shell}>
        <FundraiserStages current="review" className="mb-7 max-w-[760px]" />
        <FundraiserReview
          draft={{ ...draft, verification_methods: run.verification_methods ?? [], verification_other: run.verification_other ?? null }}
          organizer={{ name: act.name, slug: act.slug, kindLabel: entityKindLabel(act.entity_kind), city: act.city, region: act.region, countryCode: act.country_code, bio: act.bio, photoUrl: act.photo_url }}
          categoryKey={categoryKey}
          categoryLabel={label}
          lots={allLots}
          templates={offerable}
          policy={stagePolicy}
          rows={readiness(readinessInput)}
          blockers={publishBlockers(readinessInput)}
          publishable={categoryPublishable}
          discovery={await draftDiscoveryRegistry()}
          kit={kitCarried}
          preview={previewReady ? { href: `/dashboard/runs/${run.id}/preview` } : { why: "The preview draws a music fundraiser from its performance format, both dates and a number of performances; add those on the funding stage and it appears here." }}
          publicUrl={runUrl(act.slug, run.slug)}
          keepHref="/dashboard/runs"
          workspaceHref={`/dashboard/runs/${run.id}`}
        />
      </DashboardShell>;
    }
  }

  const today = new Date();
  const draft = run.status === "draft";
  const { label: categoryLabel, publishEnabled: categoryPublishable } = await categoryStatus(categoryKey);
  const { data: showRows } = await sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", id).order("played_on");
  const shows = (showRows ?? []) as ShowRow[];
  // What this category's delivery policy decides about cancelling, refunds and materials that never
  // arrive. Stated in the offer editor, never chosen there: those terms belong to the policy the
  // purchase is recorded under, not to one organizer's offer.
  const offerPolicy = await loadOfferPolicy(sb, categoryKey);
  const boardHref = runUrl(act.slug, run.slug);
  // What this fundraiser still owes its sponsors. Read under the organizer's own session, so row
  // level security decides. Empty for music, which releases on its calendar and owes no rows.
  // What a waiting sponsor sent is read with the service role, and only for the purchases the
  // organizer's own session returned, so it cannot reach anybody else's fundraiser.
  const delivery = await loadRunDelivery(sb, allLots.map((l) => l.id), supabaseAdmin());
  const methods: string[] = run.verification_methods ?? [];
  // How this category releases the organizer's share, in the policy's own words.
  const releaseSentence = releaseSentenceFor(offerPolicy);

  /*
    How this fundraiser is going, as opposed to how it is set up. A draft skips the read entirely:
    it can hold no sponsorship until it is published, so there would be nothing to count.
  */
  const view = draft ? null : withToday(await loadDashboard(act, run.id), today);
  const metrics = view?.metrics ?? null;
  const work: WorkRow[] = view?.work ?? [];
  const target = previewTarget({ id: run.id, slug: run.slug, status: run.status }, act.slug);
  // The same rules publishRun runs, so the draft's stepper here, the review stage's list and the
  // refusal all agree. The publish button is the review stage's and reads them there.
  const readinessInput = {
    act,
    run: { ...run, methods, other: run.verification_other ?? null },
    lotCount: allLots.length,
    auctionCount: allLots.filter((l) => l.mode === "auction").length,
    categoryPublishable,
    incompleteOffers: incompleteOffers(allLots, registry),
  };

  /* ------------------------------------------------------------------ the tabs */

  const words = categoryWords(categoryKey, run.kind);
  const period = periodOf(run.kind);
  const toReview = work.filter((w) => w.logo === "review");
  // Sponsorships waiting on this organizer. Music owes no deliverable rows, so its waiting is the
  // materials a sponsor sent; every other category is on the evidence rule and owes both.
  const deliveryWaiting =
    delivery.length > 0 ? delivery.filter((d) => d.submitted !== null || (d.open && !d.delivered)).length : toReview.length;
  const tabHref = (t: FundraiserTab, share = false) => {
    const params = new URLSearchParams();
    if (t !== "overview") params.set("tab", t);
    if (share) params.set("share", "1");
    if (kitCarried) params.set("kit", kitCarried);
    const query = params.toString();
    return `/dashboard/runs/${run.id}${query ? `?${query}` : ""}`;
  };
  const tabs = fundraiserTabs(
    {
      options: allLots.length,
      deliveryWaiting,
      hasDelivery: delivery.length > 0 || work.length > 0,
      dates: music ? shows.length : null,
      datesLabel: capitalize(period.units),
    },
    (t) => tabHref(t),
  );
  const tab = currentTab(tabAsked, tabs);
  const shareOpen = (Array.isArray(sp.share) ? sp.share[0] : sp.share) === "1" && isShareable(run.status);

  const head = headlineParts(run.title);
  const settled = run.status === "closed" || run.status === "cancelled";

  return (
    <DashboardShell
      current="/dashboard/runs"
      nav={nav}
      actName={act.name}
      actSlug={act.slug}
      identity={identity}
      theme={themeFor(act.slug)}
      eyebrow={[categoryLabel, music ? capitalize(period.noun) : null, periodText(run, music)].filter(Boolean).join(" · ")}
      title={head.title}
      accent={head.accent}
      titleAside={<Badge kind={STATUS_KIND[run.status] ?? "neutral"}>{lifecycleLabel(run.status)}</Badge>}
      intro={<p>{headline({ run, period: period.unit, nextOn: view?.nextShow?.played_on ?? null, nextCity: view?.nextShow?.city ?? null, bidding: allLots.some((l) => l.mode === "auction") })}</p>}
    >
      {/* Straight from the review stage's Publish. Said once, then the workspace is the workspace. */}
      {publishedParam === "1" && isShareable(run.status) && <PublishedNotice url={boardHref} />}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ButtonLink href={target.path} register="desk" variant="outline">
          {target.label}
          <Launch size={14} aria-hidden="true" />
        </ButtonLink>
        {isShareable(run.status) && (
          <ButtonLink href={shareOpen ? tabHref(tab) : tabHref(tab, true)} register="desk" variant="outline">
            <Copy size={14} aria-hidden="true" />
            {shareOpen ? "Hide sharing" : "Share"}
          </ButtonLink>
        )}
        <ButtonLink href={tabHref("details")} register="desk" variant="outline">
          Edit details
        </ButtonLink>
      </div>

      {shareOpen && (
        <SharePanel
          address={boardHref}
          actName={act.name}
          actPath={actPath(act.slug)}
          publicPath={runPath(act.slug, run.slug)}
          snippet={music ? embedSnippet(SITE.url, act.slug, run.id) : null}
        />
      )}

      <Tabs label="Fundraiser sections" tabs={tabs} current={tab} className="mb-6" />

      {view?.failed && (
        <Card className="mb-5">
          <p className="flex items-start gap-2.5 text-[15px] leading-[1.6] text-ink">
            <Warning size={18} aria-hidden="true" className="mt-0.5 flex-none text-attention-ink" />
            Some of this could not be loaded, so a figure below may be missing rather than zero. Reload to try again.
          </p>
        </Card>
      )}

      {tab === "overview" && (
        draft ? (
          <DraftOverview input={readinessInput} runId={run.id} reviewHref={stagePath(run.id, "review", kitCarried)} />
        ) : (
          <>
            {metrics && (() => {
              /* Four at most, and every one of them a different fact. A tile whose figure this
                 fundraiser does not have is not drawn, and the row narrows rather than repeating
                 one that it does. */
              const share = (
                <Kpi
                  key="share"
                  label="Coming to you"
                  value={formatMoney(organizerShareCents(metrics.raisedCents, SITE.feePercent))}
                  sub={`After the ${SITE.feePercent}% fee \u00b7 ${formatMoney(view?.payouts.paidCents ?? 0)} released so far`}
                />
              );
              const tiles = [
                <Kpi
                  key="raised"
                  label={view?.selected?.goalCents ? `Raised toward ${formatMoney(view.selected.goalCents)}` : "Raised"}
                  value={formatMoney(metrics.raisedCents)}
                  extra={<MoneyBar paidCents={metrics.raisedCents} bidsCents={metrics.bidsCents} goalCents={view?.selected?.goalCents ?? null} />}
                  sub={metrics.bidsCents > 0 ? `${formatMoney(metrics.bidsCents)} more is bid and held until close` : undefined}
                />,
                <Kpi
                  key="sponsorships"
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
                />,
              ];
              if (run.bidding_closes_at && allLots.some((l) => l.mode === "auction")) {
                tiles.push(
                  <Kpi key="closes" label="Bidding closes" value={weekdayOf(run.bidding_closes_at)} sub={clockOf(run.bidding_closes_at)} />,
                );
              }
              if (music && shows.length > 0) {
                tiles.push(
                  <Kpi
                    key="played"
                    label={`${capitalize(period.units)} played`}
                    value={
                      <>
                        {metrics.showsPlayed} <KpiUnit>of {metrics.showsTotal}</KpiUnit>
                      </>
                    }
                    sub={view?.nextShow ? `Next: ${formatWeekdayDay(view.nextShow.played_on)}${view.nextShow.city ? ` \u00b7 ${view.nextShow.city}` : ""}` : undefined}
                  />,
                );
              }
              if (tiles.length < 4) tiles.push(share);
              const wide = tiles.length >= 4 ? "xl:grid-cols-4" : tiles.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2";
              return <div className={`mb-5 grid gap-3 sm:grid-cols-2 ${wide}`}>{tiles.slice(0, 4)}</div>;
            })()}

            <div className="mb-5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <NeedsYou
                categoryKey={categoryKey}
                materialsWord={words.materials}
                toReview={toReview}
                items={view?.preparation ?? []}
                tabHref={tabHref}
              />
              {music && shows.length > 0 ? (
                <Card
                  title={`The ${period.noun}`}
                  subtitle={`${metrics?.showsPlayed ?? 0} of ${shows.length} played`}
                  right={
                    <Link href={tabHref("dates")} className="text-accent-ink underline decoration-1 underline-offset-4">
                      All dates
                    </Link>
                  }
                >
                  <RunStrip shows={shows} href={tabHref("dates")} today={today} />
                </Card>
              ) : (
                <DeliveryCommitmentCard
                  delivered={delivery.filter((d) => d.delivered).length}
                  total={delivery.length}
                  release={releaseSentence}
                  methodCount={methods.length}
                  href={tabHref(delivery.length > 0 ? "delivery" : "details")}
                />
              )}
            </div>

            <Card
              id="placements"
              title="Sponsorship options"
              subtitle={optionsSubtitle(allLots)}
              right={
                <Link href={tabHref("options")} className="text-accent-ink underline decoration-1 underline-offset-4">
                  Edit the options
                </Link>
              }
            >
              {allLots.length === 0 ? (
                <p className="text-[15px] leading-[1.6] text-muted">Nothing is priced on this fundraiser yet.</p>
              ) : (
                /* More columns than a phone has room for, so the table scrolls inside its own frame. */
                <div className="-mx-1 overflow-x-auto px-1">
                  <div className="min-w-[720px]">
                    <Table
                      columns={[
                        { key: "option", label: "Option", width: "minmax(0,2fr)" },
                        { key: "sale", label: "Sale", width: "minmax(0,0.7fr)" },
                        { key: "current", label: "Current", width: "minmax(0,1.2fr)" },
                        { key: "status", label: "Status", width: "minmax(0,1.2fr)" },
                        { key: "sponsor", label: "Sponsor", width: "minmax(0,1.3fr)" },
                        { key: "action", label: "", width: "minmax(0,1.1fr)" },
                      ]}
                      rows={collapseOptions(
                        optionRows({ lots: allLots, templates: offerable, topBids: view?.topBids ?? {}, work }),
                      ).map((row) => optionTableRow(row, words.materials, tabHref))}
                    />
                  </div>
                </div>
              )}
            </Card>
          </>
        )
      )}

      {tab === "options" && (
        draft ? (
          <Card id="placements" title="The sponsorship options" subtitle={`Stage three of four · ${STAGE_LABEL.sponsorships}`}>
            <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
              Built one at a time on the sponsorships stage, each with its own placement, price and terms. Sold options stay as they are.
            </p>
            <DraftOptionsSummary lots={allLots} templates={offerable} href={stagePath(run.id, "sponsorships", kitCarried)} />
            {/* Whether it goes up is the review stage's question, and it is asked in one place. */}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-5">
              <ButtonLink href={stagePath(run.id, "review", kitCarried)} register="desk" variant="outline">
                Go to the review
              </ButtonLink>
              <span className="text-[14px] leading-[1.6] text-muted">
                The review reads the whole fundraiser back, names anything unfinished, and is where you publish it.
              </span>
            </div>
          </Card>
        ) : (
          <Card id="placements" title="Price the sponsorship options">
            <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
              {music
                ? "The suggested prices for this kind of musician. They are a starting point; your own number always wins. Sold options stay as they are."
                : "No prices are suggested here yet, so your own number is the only number. Offer only what you can deliver. Sold options stay as they are."}
            </p>
            {/* Music's options are narrowed by the kind of musician, and a music organizer set up with the one-question flow has not said which yet. */}
            {music && !act.type && (
              <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
                Music&apos;s sponsorship options depend on what kind of musician this is: a touring band, a house act or a soloist.{" "}
                <Link href="/dashboard/act" className="text-accent-ink underline decoration-1 underline-offset-4">Say which on the organizer page</Link> and the options appear here.
              </p>
            )}
            {/* A category with no templates (Other, today). Nothing is invented to fill the list. */}
            {surfaces.length === 0 && !(music && !act.type) && (
              <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
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
        )
      )}

      {tab === "delivery" && (
        delivery.length > 0 ? (
          <Card id="delivery" title="Accept what sponsors send, then document what you delivered">
            {/* The release rule is the category's own (docs/DELIVERY_POLICY_MATRIX.md), read from
                the policy rather than written here: music is on a calendar and nobody else is. */}
            <p className="max-w-[62ch] text-[15px] leading-[1.6] text-muted">
              Each sponsor sends what their sponsorship needs: a name as it should read, a credit line, artwork. Accept it or decline it here,
              then add a link or a note for each thing you delivered. Door Money checks that it is there, never whether it is good, and passes
              it on to the sponsor.{releaseSentence ? ` ${releaseSentence}` : ""}
            </p>
            <DeliveryPanel rows={delivery} categoryKey={categoryKey} youth={(run.category_details as Record<string, string> | null)?.level === "youth"} />
          </Card>
        ) : (
          /*
            Every sponsorship on this fundraiser, and the one thing worth doing to each.

            Drawn when the delivery panel is not, which is exactly when the fundraiser is on the
            calendar rule rather than the evidence rule. Music is that case, and this is the only
            place a music organizer can accept or decline what a sponsor sent: `deliverables`
            carries no rows for a calendar fundraiser, so DeliveryPanel never draws for one.
          */
          <Card id="sponsorship-work" title="What needs your attention">
            <SponsorshipWorkTable rows={work} categoryKey={categoryKey} />
          </Card>
        )
      )}

      {tab === "dates" && (
        <Card id="shows" title={`Every date on the ${period.noun}`}>
          <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
            Enter the dates once. As they happen, one tap marks a {period.unit} played. A photo and a headcount are optional and go on the record patrons get at the end.
          </p>
          <ShowsPanel runId={run.id} shows={shows} defaultCity={act.city ?? ""} />
        </Card>
      )}

      {tab === "details" && (
        <div className="grid items-start gap-3.5 lg:grid-cols-2">
          <Card id="run-details" title={draft ? "The project and the funding" : "Dates and details"}>
            {draft ? (
              <DraftStageSummary run={run} kit={kitCarried} />
            ) : music ? (
              <RunForm run={run as RunInput} actType={act.type} />
            ) : (
              <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
                {settled
                  ? "This fundraiser is over, so its details stay as they are. Sponsors read the same promise they bought."
                  : "While this fundraiser is public its details stay as they are, so a sponsor reads the same promise they bought. Take it back to draft to change them, which works until a sponsorship sells."}
              </p>
            )}
          </Card>

          <Card id="verification" title="How the placements will be recorded">
            <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
              Select what sponsors will receive or be able to review afterward. Only the methods chosen here go on the public page, and it never
              claims more than that.
            </p>
            <VerificationEditor runId={run.id} methods={methods} other={run.verification_other ?? null} runStatus={run.status} categoryKey={categoryKey} />
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}

/* ------------------------------------------------------------------ the header's words */

const STATUS_KIND: Record<string, BadgeKind> = { open: "ok", live: "ok" };

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** "18 shows, Oct 3 to Nov 2", or the dates alone, or nothing. Music is the only category that counts. */
function periodText(run: { show_count: number | null; kind: string | null; starts_on: string | null; ends_on: string | null }, music: boolean): string | null {
  const period = periodOf(run.kind);
  const count = music && run.show_count !== null ? `${run.show_count} ${run.show_count === 1 ? period.unit : period.units}` : null;
  const dates = run.starts_on && run.ends_on ? formatDateRange(run.starts_on, run.ends_on) : null;
  return [count, dates].filter(Boolean).join(", ") || null;
}

/**
 * The one line under the fundraiser's name: when bidding closes and when the next date is, and
 * nothing it cannot back. No close where no option takes bids, no date where there are none.
 */
function headline(input: {
  run: { status: string; bidding_closes_at: string | null };
  period: string;
  nextOn: string | null;
  nextCity: string | null;
  bidding: boolean;
}): string {
  const { run, period, nextOn, nextCity, bidding } = input;
  if (run.status === "draft") return "Nothing here is public yet. Publish it when the steps below are done.";
  if (run.status === "cancelled") return "This fundraiser is cancelled. Its sponsorship options are off the page.";
  if (run.status === "closed") return "This fundraiser is over. Sponsors have their records, and the page is down.";

  const close = bidding && run.bidding_closes_at ? `Bidding closes ${weekdayOf(run.bidding_closes_at)} at ${clockOf(run.bidding_closes_at)}` : null;
  const next = nextOn ? `the next ${period} is ${formatWeekdayDay(nextOn)}${nextCity ? ` in ${nextCity}` : ""}` : null;
  if (close && next) return `${close}, and ${next}.`;
  if (close) return `${close}.`;
  if (next) return `${capitalize(next)}.`;
  return "The fundraiser is public and taking sponsorships.";
}

/** "9 options, fixed price and bidding". Never a count of what nobody has offered. */
function optionsSubtitle(lots: readonly { mode: string }[]): string {
  const auctions = lots.filter((l) => l.mode === "auction").length;
  const fixed = lots.length - auctions;
  const how = auctions > 0 && fixed > 0 ? "fixed price and bidding" : auctions > 0 ? "open to bids" : "fixed price";
  return `${lots.length} ${plural(lots.length, "option", "options")}, ${how}`;
}

/* ------------------------------------------------------------------ the overview */

const OPTION_BADGE: Record<OptionState, { kind: BadgeKind; word: (row: OptionRow, materials: string) => string }> = {
  review: { kind: "attention", word: (_row, m) => `Review ${m}` },
  sold: { kind: "ok", word: () => "Sold" },
  bids: { kind: "ok", word: () => "Top bid" },
  // "No bids" is a fact about an option that takes bids. One sold at a fixed price is simply open.
  open: { kind: "neutral", word: (row) => (row.bidding ? "No bids" : "Open") },
};

/** One sponsorship option, as a row, with the one thing worth doing to it and nothing else. */
function optionTableRow(row: OptionRow, materials: string, tabHref: (t: FundraiserTab) => string): DeskRow {
  const badge = OPTION_BADGE[row.state];
  const amounts = row.amountsCents.map((cents) => formatMoney(cents)).join(" · ");
  return {
    key: row.key,
    cells: [
      <span key="name" className="font-medium">{row.name}</span>,
      <span key="sale" className="text-muted">{row.sale}</span>,
      <span key="current" className="tabular-nums">
        {amounts}
        {row.asking && <span className="text-muted"> asking</span>}
      </span>,
      <Badge key="status" kind={badge.kind}>{badge.word(row, materials)}</Badge>,
      row.sponsor ? (
        <span key="sponsor" className="truncate">{row.sponsor}</span>
      ) : row.state === "bids" ? (
        <span key="sponsor" className="text-muted">Held until close</span>
      ) : null,
      <OptionAction key="action" row={row} materials={materials} tabHref={tabHref} />,
    ],
  };
}

/**
 * A row's own action, and only where there is one that works.
 *
 * A sponsorship being bid on has no record to open yet and nothing waiting on the organizer, so it
 * gets nothing: an empty cell is honest, and a link to a page that does not exist is not.
 */
function OptionAction({ row, materials, tabHref }: { row: OptionRow; materials: string; tabHref: (t: FundraiserTab) => string }) {
  if (row.state === "review") {
    return (
      <ButtonLink href={tabHref("delivery")} register="desk" variant="solid" size="sm">
        Review<span className="sr-only"> the {materials} for {row.name}</span>
      </ButtonLink>
    );
  }
  if (row.purchaseId) {
    return (
      <Link href={`/record/${row.purchaseId}`} className="text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
        Record<span className="sr-only"> for {row.name}</span>
      </Link>
    );
  }
  if (row.state === "open") {
    return (
      <Link href={tabHref("options")} className="text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
        Lower the price<span className="sr-only"> of {row.name}</span>
      </Link>
    );
  }
  return null;
}

/** What is waiting on this organizer, on this fundraiser, and the controls that finish it here. */
function NeedsYou({
  categoryKey,
  materialsWord,
  toReview,
  items,
  tabHref,
}: {
  categoryKey: string;
  materialsWord: string;
  toReview: readonly WorkRow[];
  items: readonly PrepItem[];
  tabHref: (t: FundraiserTab) => string;
}) {
  // A paid sponsorship whose materials have not arrived is waiting on the sponsor, so it is
  // counted nowhere in this number and is said in one quiet line under the rows instead.
  const mine = items.filter((item) => item.key !== "no-logo");
  const waiting = waitingCount(mine);
  const dated = mine.filter((item) => item.date !== null);
  const stillOwed = items.find((item) => item.key === "no-logo") ?? null;

  return (
    <Card
      title="Needs you"
      subtitle={waiting > 0 ? "Ordered by what is due first" : undefined}
      right={waiting > 0 ? <Badge kind="attention">{waiting}</Badge> : undefined}
    >
      {waiting === 0 && <p className="text-[15px] leading-[1.6] text-muted">Nothing is waiting on you.</p>}

      {toReview.map((row) => (
        <TaskRow
          key={row.id}
          lead={<MaterialsThumb row={row} word={materialsWord} />}
          title={`${materialsWord === "logo" ? "Approve" : "Accept"} the ${materialsWord} for ${row.option}`}
          detail={materialsDetail(row)}
          actions={<TaskDecision purchaseId={row.id} categoryKey={categoryKey} what={row.option} />}
        />
      ))}

      {dated.map((item) => (
        <TaskRow
          key={item.key}
          lead={item.date ? <TaskDate {...dayAndMonth(item.date)} /> : undefined}
          title={capitalize(item.label)}
          detail={item.date ? `The first is ${formatWeekdayDay(item.date)}` : undefined}
          actions={
            <ButtonLink href={tabHref("dates")} register="desk" variant="outline" size="sm">
              {DATED_ACTION[item.key] ?? "Open the dates"}
            </ButtonLink>
          }
        />
      ))}

      {stillOwed && (
        <p className="mt-1 text-[14px] leading-[1.6] text-muted">
          No rush: {stillOwed.count} paid {plural(stillOwed.count, "sponsorship has", "sponsorships have")} no {materialsWord} yet. Door Money
          writes to the sponsor.{" "}
          <Link href={tabHref("delivery")} className="text-accent-ink underline decoration-1 underline-offset-4">
            See the sponsorships
          </Link>
        </p>
      )}
    </Card>
  );
}

/** What the row's own button says. Music's dates are the only ones any category has today. */
const DATED_ACTION: Record<string, string> = { place: "Add venues", attendance: "Add attendance", photo: "Add photos" };

/**
 * What this fundraiser owes its sponsors, for a category on the evidence rule.
 *
 * The other side of the two-column row, where music has the picture of its dates. Nothing is
 * invented: with no sponsorships sold there is nothing to count, and the card says what the
 * release rule is rather than a progress figure it cannot back.
 */
function DeliveryCommitmentCard({
  delivered,
  total,
  release,
  methodCount,
  href,
}: {
  delivered: number;
  total: number;
  release: string | null;
  methodCount: number;
  href: string;
}) {
  return (
    <Card
      title="What is promised"
      subtitle={total > 0 ? `${delivered} of ${total} documented` : undefined}
      right={
        <Link href={href} className="text-accent-ink underline decoration-1 underline-offset-4">
          {total > 0 ? "Document delivery" : "Edit"}
        </Link>
      }
    >
      <p className="text-[15px] leading-[1.6] text-ink">
        {total > 0 ? release ?? "Your share is released as each deliverable is documented." : "Nothing is sold yet, so there is nothing to document."}
      </p>
      <p className="text-[14px] leading-[1.6] text-muted">
        {methodCount > 0
          ? `${methodCount} ${plural(methodCount, "way", "ways")} of recording the placements ${plural(methodCount, "is", "are")} on the public page.`
          : "No way of recording the placements has been chosen yet."}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ drafts */

/**
 * Where a draft stands, as four steps rather than a checklist.
 *
 * The same rows `ReadinessChecklist` draws and `publishRun` enforces, so the stepper, the publish
 * button and a refusal cannot disagree. Payout setup and "Ready to publish" are left out of the
 * count for the reason `draftProgress` leaves them out: Stripe never blocks a publish, and being
 * ready is the consequence of the four above rather than a fifth thing to do.
 */
function DraftOverview({ input, runId, reviewHref }: { input: Parameters<typeof readiness>[0]; runId: string; reviewHref: string }) {
  const rows = readiness(input);
  const { done, total, next } = draftProgress(rows);
  const steps = rows.filter((r) => !r.optional && r.key !== "publish");
  const optional = rows.filter((r) => r.optional);

  return (
    <Card title="Before it goes up" subtitle={`${done} of ${total} steps done`} className="max-w-[900px]">
      <ol className="m-0 flex list-none flex-col gap-0 p-0">
        {steps.map((row, i) => (
          <DraftStep key={row.key} row={row} index={i + 1} current={row.key === next?.key} runId={runId} />
        ))}
      </ol>
      {optional.map((row) => (
        <p key={row.key} className="border-t border-line pt-3 text-[14px] leading-[1.6] text-muted">
          {row.label}: {row.note}{" "}
          {row.href && (
            <Link href={row.href} className="text-accent-ink underline decoration-1 underline-offset-4">
              Set it up
            </Link>
          )}
        </p>
      ))}
      {/*
        The way on to the journey's fourth stage, which is the only place a draft is published.
        The steps above say what is unfinished and the review says it again with the decision
        attached, both out of the same readiness rules, so they cannot disagree.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-3">
        <ButtonLink href={reviewHref} register="desk" variant={next ? "outline" : "solid"}>
          {next ? "Go to the review" : "Review and publish"}
        </ButtonLink>
        <span className="text-[14px] leading-[1.6] text-muted">
          {next
            ? "The review reads the whole fundraiser back and names anything still to do."
            : "Every step above is done. The review is the last read before it goes up."}
        </span>
      </div>
    </Card>
  );
}

function DraftStep({ row, index, current, runId }: { row: ReadinessRow; index: number; current: boolean; runId: string }) {
  const href = readinessHref(runId, row);
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border text-[14px] leading-none ${
          row.done ? "border-accent-line bg-ok text-on-accent" : current ? "border-accent-line text-accent-ink" : "border-field-line text-muted"
        }`}
      >
        {row.done ? "✓" : index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{row.label}</span>
        <span className="block text-[14px] leading-[1.5] text-muted">{row.note}</span>
      </span>
      {current && <Badge kind="attention">Next</Badge>}
    </>
  );
  return (
    <li className="border-t border-line first:border-t-0">
      {href ? (
        <Link href={href} className="flex items-start gap-3 py-3 no-underline hover:bg-neutral-wash">
          {body}
        </Link>
      ) : (
        <span className="flex items-start gap-3 py-3">{body}</span>
      )}
    </li>
  );
}

/**
 * The first two stages of a draft, read back, each with the way into it. What is missing is named
 * from the resume rule, which is not the publish gate: the stepper says what publishing still
 * wants, and this says what was written.
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
    <ul className="m-0 list-none divide-y divide-line p-0">
      {rows.map(({ stage, lines }) => {
        const missing = stageMissing(run, stage);
        return (
          <li key={stage} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-[14px] text-muted">{STAGE_LABEL[stage]}</p>
              {lines.map((line) => (
                <p key={line.label} className="text-[15px] leading-[1.6]">
                  <span className="text-muted">{line.label}: </span>
                  {line.value?.trim() ? line.value : <span className="text-muted">not yet said</span>}
                </p>
              ))}
              {missing.length > 0 && <p className="mt-2 text-[14px] text-attention-ink">Still to say: {missing.join(", ")}.</p>}
            </div>
            <Link href={stagePath(run.id, stage, kit)} className="inline-flex min-h-[36px] items-center text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
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
        <ul className="m-0 list-none divide-y divide-line p-0">
          {keys.map((key) => {
            const mine = lots.filter((l) => l.surface_key === key);
            const name = templates.find((t) => t.key === key)?.name ?? key;
            const locked = mine.some((l) => l.status !== "open");
            return (
              <li key={key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 first:pt-0">
                <span className="text-[15px]">{name}</span>
                <span className="text-[14px] text-muted">
                  {formatMoney(mine[0].price_cents)} {mine[0].mode === "auction" ? "reserve" : "each"} &middot; {mine.length} {plural(mine.length, "spot", "spots")}{locked ? " · terms settled" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4">
        <Link href={href} className="inline-flex min-h-[36px] items-center text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
          {keys.length === 0 ? "Build the first option" : "Edit the options"}
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ sharing */

/**
 * Everywhere this fundraiser can be put: its own address, the line for the organizer's site, and
 * the images for places that only take a link.
 *
 * The widget used to have a page of its own in the sidebar, which meant it sat one level away from
 * the fundraiser it embeds. /dashboard/widget still answers, for the links already sent, and sends
 * people here.
 */
function SharePanel({
  address,
  actName,
  actPath: organizerPath,
  publicPath,
  snippet,
}: {
  address: string;
  actName: string;
  actPath: string;
  publicPath: string;
  snippet: string | null;
}) {
  const buttonSrc = `${SITE.url}/badge/button.svg?act=${encodeURIComponent(actName)}`;
  const buttonSnippet = `<a href="${SITE.url}${publicPath}"><img src="${buttonSrc}" alt="Back ${actName} on Door Money" height="44"></a>`;
  return (
    <Card title="Share this fundraiser" className="mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="break-all text-[15px] text-ink">{address}</span>
        <ShareFundraiser url={address} />
      </div>

      {snippet && (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[15px] font-medium text-ink">One line for your own site</p>
          <p className="mb-3 max-w-[62ch] text-[14px] leading-[1.6] text-muted">
            Paste this where the widget should sit. It shows this fundraiser, its backing tiers and a button, and takes the
            payment on the page. The line is for this fundraiser only; when it closes, the widget says so and takes no more backings.
          </p>
          <pre className="max-w-full overflow-x-auto rounded-control border border-line bg-ground p-4 font-mono text-[14px] leading-[1.6] text-ink">
            <code>{snippet}</code>
          </pre>
        </div>
      )}

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[15px] font-medium text-ink">For a link in a bio</p>
        <p className="mb-3 max-w-[62ch] text-[14px] leading-[1.6] text-muted">
          For places that only allow a link: a link-in-bio page, Bandcamp, a newsletter footer. It sends a patron to this
          page, where the same payment happens.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={buttonSrc} alt={`Back ${actName} on Door Money`} height={44} className="mb-3 block h-11 w-auto max-w-full" />
        <pre className="max-w-full overflow-x-auto rounded-control border border-line bg-ground p-4 font-mono text-[14px] leading-[1.6] text-ink">
          <code>{buttonSnippet}</code>
        </pre>
        <p className="mt-3 text-[14px] leading-[1.6] text-muted">
          The badge for a footer or a poster:{" "}
          <a href="/badge/dark.svg" download="backed-on-door-money-dark.svg" className="text-accent-ink underline decoration-1 underline-offset-4">dark</a>,{" "}
          <a href="/badge/light.svg" download="backed-on-door-money-light.svg" className="text-accent-ink underline decoration-1 underline-offset-4">light</a>.
          Your own page, which keeps working between fundraisers: <span className="break-all text-ink">{SITE.url}{organizerPath}</span>
        </p>
      </div>
    </Card>
  );
}
