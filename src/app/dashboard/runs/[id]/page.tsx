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
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardNav, isShareable, previewTarget } from "@/lib/dashboardModel";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { FundraiserDraftForm } from "@/components/FundraiserDraftForm";
import { categoryStatus, draftCategories, draftDiscoveryRegistry, loadFundraiserDraft } from "@/app/actions/drafts";
import { runComplete } from "@/lib/readiness";
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
  const [{ id }, { kit: kitParam }] = await Promise.all([params, searchParams]);
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

  // The simple form until the fundraiser can say what it is. Music asks for its own details and a
  // music profile to hang them on; every other category asks the shared questions instead. Once
  // either is answered the full workspace opens, whatever the category.
  const music = run.category_key === "music";
  const unready = music
    ? !act.type || !run.kind || !run.starts_on || !run.ends_on || run.show_count === null
    : !runComplete(run);
  if (run.status === "draft" && unready) {
    const draft = await loadFundraiserDraft(id);
    if (!draft) notFound();
    return <DashboardShell current="/dashboard" nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })} actName={act.name} identity={identity} eyebrow="Private draft" title={draft.title || "New fundraiser"} accent="">
      <Card className="max-w-[760px]"><FundraiserDraftForm draft={draft} categories={await draftCategories()} musicOrganizer={act.type !== null} discovery={await draftDiscoveryRegistry()} /></Card>
    </DashboardShell>;
  }

  const { label: categoryLabel, publishEnabled: categoryPublishable } = await categoryStatus(run.category_key ?? "music");
  const { data: lots } = await sb.from("lots").select("id,surface_key,label,price_cents,mode,status,buy_now_cents,reach_estimate,reach_basis").eq("run_id", id).order("created_at");
  const { data: shows } = await sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", id).order("played_on");
  // The options this fundraiser can price, from the registry in the database, so a category added
  // there has an editor. Music narrows by act type; no other category does.
  const surfaces = templatesForFundraiser(await loadTemplates(sb, run.category_key ?? "music"), run.category_key ?? "music", act.type);
  // The starter kit this draft began from, where the address still carries it. It is not stored
  // with the fundraiser, and one from another category is ignored. It names options to look at and
  // ticks none of them.
  const kit = typeof kitParam === "string" ? starterKit(kitParam) : null;
  const kitSuggestions = kit && kit.enabled && run.status === "draft" && kitFitsCategory(kit, run.category_key ?? "music") ? suggestedTemplates(kit, surfaces) : [];
  const boardHref = runUrl(act.slug, run.slug);
  const allLots = lots ?? [];
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
          {music
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
          <ReadinessChecklist
            input={{
              act,
              run: { ...run, methods, other: run.verification_other ?? null },
              lotCount: allLots.length,
              auctionCount: allLots.filter((l) => l.mode === "auction").length,
              categoryPublishable,
            }}
            previewHref={`/dashboard/runs/${run.id}/preview`}
          />
        </Card>
      )}

      <Card id="placements" className="mb-10">
        <CardHead eyebrow="Step three of four">Price the sponsorship options</CardHead>
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
        {/* A category with no templates (Other, today). Nothing is invented to fill the list. */}
        {surfaces.length === 0 && (
          <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
            This category has no sponsorship options to choose from yet. Your draft keeps what you wrote about the funding, the
            audience and what a sponsor receives, and that statement is the whole offer for now.
          </p>
        )}
        <LotsEditor runId={run.id} runStatus={run.status} surfaces={surfaces} lots={allLots as ExistingLot[]} boardHref={boardHref} publishable={categoryPublishable} />
      </Card>

      <Card id="verification" className="mb-10 max-w-[860px]">
        <CardHead eyebrow="Step four of four">How the placements will be recorded</CardHead>
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
        <CardHead eyebrow="The fundraiser">Dates and details</CardHead>
        {run.status === "draft"
          ? <FundraiserDraftForm draft={await loadFundraiserDraft(id)} categories={await draftCategories()} musicOrganizer={act.type !== null} discovery={await draftDiscoveryRegistry()} />
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

