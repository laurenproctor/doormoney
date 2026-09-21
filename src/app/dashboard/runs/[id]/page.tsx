import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { ReadinessChecklist } from "@/components/ReadinessChecklist";
import { RunForm, type RunInput } from "@/components/RunForm";
import { LotsEditor, type ExistingLot } from "@/components/LotsEditor";
import { ShowsPanel, type ShowRow } from "@/components/ShowsPanel";
import { VerificationEditor } from "@/components/VerificationEditor";
import { DeliveryPanel } from "@/components/DeliveryPanel";
import { loadRunDelivery } from "@/lib/delivery-dashboard";
import { requireUser, ownedAct } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { FundraiserDraftForm } from "@/components/FundraiserDraftForm";
import { categoryStatus, draftCategories, loadFundraiserDraft } from "@/app/actions/drafts";
import { runComplete } from "@/lib/readiness";
import { templatesForFundraiser } from "@/lib/opportunities";
import { loadTemplates } from "@/lib/opportunity-templates";
import { formatDateRange } from "@/lib/dates";
import { periodOf } from "@/lib/periods";
import { runUrl } from "@/lib/urls";

export const metadata: Metadata = { title: "The fundraiser" };

type Props = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<string, string> = { draft: "Draft, not public", open: "Open, taking bids and orders", live: "Live, the shows are on", closed: "Closed", cancelled: "Cancelled" };
/** Only "live" needs the category: outside music there are no shows to be on. */
const statusLabel = (status: string, music: boolean) =>
  (!music && status === "live" ? "Live, the work is under way" : STATUS_LABEL[status]) ?? status;

export default async function RunPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/runs/${id}`);
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

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
    return <DashboardShell current="/dashboard" actName={act.name} eyebrow="Private draft" title={draft.title || "New fundraiser"} accent="">
      <Card className="max-w-[760px]"><FundraiserDraftForm draft={draft} categories={await draftCategories()} musicOrganizer={act.type !== null} /></Card>
    </DashboardShell>;
  }

  const { label: categoryLabel, publishEnabled: categoryPublishable } = await categoryStatus(run.category_key ?? "music");
  const { data: lots } = await sb.from("lots").select("id,surface_key,label,price_cents,mode,status,buy_now_cents").eq("run_id", id).order("created_at");
  const { data: shows } = await sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", id).order("played_on");
  // The options this fundraiser can price, from the registry in the database, so a category added
  // there has an editor. Music narrows by act type; no other category does.
  const surfaces = templatesForFundraiser(await loadTemplates(sb, run.category_key ?? "music"), run.category_key ?? "music", act.type);
  const boardHref = runUrl(act.slug, run.slug);
  const allLots = lots ?? [];
  // What this fundraiser still owes its sponsors. Read under the organizer's own session, so row
  // level security decides. Empty for music, which releases on its calendar and owes no rows.
  const delivery = await loadRunDelivery(sb, allLots.map((l) => l.id));
  const methods: string[] = run.verification_methods ?? [];
  const settled = run.status === "closed" || run.status === "cancelled";

  return (
    <DashboardShell
      current="/dashboard"
      actName={act.name}
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
        <LotsEditor runId={run.id} runStatus={run.status} surfaces={surfaces} lots={allLots as ExistingLot[]} boardHref={boardHref} />
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
          <CardHead eyebrow="Delivery">Document what you delivered</CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] text-muted">
            Door Money holds each sponsor&apos;s money until you document what they bought, and releases your share on the Friday after. Add a
            link or a note for each one. Door Money checks that it is there, never whether it is good, and passes it on to the sponsor.
          </p>
          <DeliveryPanel rows={delivery} youth={(run.category_details as Record<string, string> | null)?.level === "youth"} />
        </Card>
      )}

      {music && <Card className="mb-10">
        <CardHead eyebrow="The shows">Every date on the {periodOf(run.kind).noun}</CardHead>
        <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
          Enter the dates once. As they happen, one tap marks a show played. A photo and a headcount are optional and go on the record patrons get at the end.
        </p>
        <ShowsPanel runId={run.id} shows={(shows ?? []) as ShowRow[]} defaultCity={act.city ?? ""} />
      </Card>}

      <Card id="run-details" className="max-w-[760px]">
        <CardHead eyebrow="The fundraiser">Dates and details</CardHead>
        {run.status === "draft"
          ? <FundraiserDraftForm draft={await loadFundraiserDraft(id)} categories={await draftCategories()} musicOrganizer={act.type !== null} />
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

