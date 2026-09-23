import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { Badge, Card } from "@/components/desk";
import { Launch } from "@/components/dashboard/icons";
import { OfferSummary } from "@/components/OfferSummary";
import { VerificationEditor } from "@/components/VerificationEditor";
import { PublishDecision } from "@/components/review/PublishDecision";
import { organizerNoun } from "@/lib/categories";
import { ACTIVITY_MODE_LABEL } from "@/lib/category-words";
import { placeLine } from "@/lib/countries";
import { formatDateRange, formatDay } from "@/lib/dates";
import type { DiscoveryRegistry } from "@/lib/discovery";
import type { FundraiserDraft } from "@/lib/fundraiser-drafts";
import { stagePath } from "@/lib/fundraiser-stages";
import { formatMoney } from "@/lib/money";
import { policyStatements, releaseSentenceFor, type OfferPolicy } from "@/lib/offer-policy";
import { termsRequired } from "@/lib/offer-readiness";
import { offerTermsOf, offerTermsView } from "@/lib/offer-terms";
import type { OpportunityTemplate } from "@/lib/opportunities";
import { initialsFor } from "@/lib/organizer-setup";
import { periodOf } from "@/lib/periods";
import type { ReadinessRow } from "@/lib/readiness";
import { exampleFields, unfinishedItems, whatBecomesPublic } from "@/lib/review";
import { optionFromLots, optionMissing, savedOptionKeys, spotsOf, type BuilderLot } from "@/lib/sponsorship-builder";
import { parseOfferTerms, termsFromDraft } from "@/lib/offer-terms";
import { verificationItems } from "@/lib/verification";
import type { KitTextField } from "@/lib/starter-kits";

/*
  The review: the saved fundraiser, read back the way a potential sponsor would read it.

  Every line is a row the organizer saved. Nothing is drawn for a part they have not written except
  the words "not yet said", and nothing a template or a starter idea suggested is drawn as a
  promise: Door Money's note on a placement is labeled as Door Money's, and wording still identical
  to a starter idea's example is labeled as an example. Readiness comes from src/lib/readiness.ts,
  the same rules publishRun runs, and this page only says where each unfinished thing is fixed.

  Second person: this is the dashboard, one person reading their own draft.
*/

export type ReviewOrganizer = {
  name: string;
  slug: string;
  kindLabel: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  bio: string | null;
  photoUrl: string | null;
};

export function FundraiserReview({
  draft, organizer, categoryKey, categoryLabel, lots, templates, policy, rows, blockers, publishable, discovery, kit,
  preview, publicUrl, keepHref, workspaceHref,
}: {
  draft: FundraiserDraft & { verification_methods?: string[] | null; verification_other?: string | null };
  organizer: ReviewOrganizer;
  categoryKey: string;
  categoryLabel: string;
  lots: BuilderLot[];
  /** What this fundraiser may offer, plus any retired template it already has spots on. */
  templates: OpportunityTemplate[];
  policy: OfferPolicy | null;
  /** readiness(input), computed by the page from the same input publishRun uses. */
  rows: ReadinessRow[];
  /** publishBlockers(input), the sentences the publish button will be refused with. */
  blockers: string[];
  publishable: boolean;
  discovery: DiscoveryRegistry;
  /** The starter kit the address still carries, or null. */
  kit: string | null;
  /** The real private page, or why it cannot be drawn yet. */
  preview: { href: string } | { why: string };
  publicUrl: string;
  keepHref: string;
  workspaceHref: string;
}) {
  const run = { ...draft, category_key: categoryKey };
  const unfinished = unfinishedItems(rows, run, kit);
  const examples = new Set<KitTextField>(exampleFields(draft, kit));
  const statements = policyStatements(policy);
  const release = releaseSentenceFor(policy);
  const optionKeys = savedOptionKeys(lots);
  const music = categoryKey === "music";
  const place = placeLine({ city: organizer.city, region: organizer.region, countryCode: organizer.countryCode });
  const mode = draft.activity_mode ? (ACTIVITY_MODE_LABEL[draft.activity_mode] ?? null) : null;
  const places = (draft.activity_locations ?? []).map((l) => placeLine({ city: l.city, region: l.region, countryCode: l.country_code })).filter(Boolean);
  const tagLabels = (draft.discovery_tags ?? []).map((key) => discovery.tags.find((t) => t.key === key)?.label ?? null).filter((v): v is string => Boolean(v));
  const verification = { methods: draft.verification_methods ?? [], other: draft.verification_other ?? null };
  const chosenMethods = verificationItems(verification, categoryKey);
  const noun = organizerNoun(categoryKey);
  const sponsorshipsHref = stagePath(draft.id, "sponsorships", kit);
  const policyStatus: "active" | "proposed" | null = policy?.status === "active" ? "active" : policy?.status === "proposed" ? "proposed" : null;

  return (
    <div className="grid gap-3.5">
      {/* ------------------------------------------------------------ the way to the real page */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {"href" in preview ? (
          <ButtonLink href={preview.href} register="desk" variant="outline">
            Preview the real page <Launch size={14} aria-hidden="true" />
          </ButtonLink>
        ) : (
          <span className="text-[14.5px] text-muted">{preview.why}</span>
        )}
        <span className="text-[14px] text-muted">The preview is the page itself, private to this account until it is published.</span>
        <Badge kind="neutral" className="ml-auto">Private draft</Badge>
      </div>

      {/* ------------------------------------------------------------ what is unfinished */}
      {publishable && (
        <Card title={unfinished.length === 0 ? "Everything a sponsor needs is here" : `${unfinished.length} ${unfinished.length === 1 ? "thing" : "things"} still to do`} subtitle="Before it goes up">
          {unfinished.length === 0 ? (
            <p className="text-[15px] text-muted">The organizer, the fundraiser, at least one complete option and how delivery is documented are all in place. Read it through below, then decide.</p>
          ) : (
            <ul className="divide-y divide-line">
              {unfinished.map((item) => (
                <li key={item.key} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{item.label}</p>
                    <p className="text-[14.5px] text-muted">{item.note}</p>
                  </div>
                  <Link href={item.href} className="text-[14px] text-accent-ink underline decoration-1 underline-offset-4">Fix on {item.where}</Link>
                </li>
              ))}
            </ul>
          )}
          {rows.find((r) => r.key === "payouts" && !r.done) && (
            <p className="text-[14px] text-muted">Payout setup is optional before publishing: {rows.find((r) => r.key === "payouts")?.note}{" "}
              <Link href="/dashboard/payouts" className="text-accent-ink underline decoration-1 underline-offset-4">Set it up</Link></p>
          )}
        </Card>
      )}

      {/* ------------------------------------------------------------ who */}
      <Card title={organizer.name} subtitle="Who is raising the money">
        <div className="flex items-start gap-4">
          {organizer.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={organizer.photoUrl} alt="" className="h-14 w-14 flex-none rounded-control object-cover" />
          ) : (
            <span aria-hidden="true" className="heading flex h-14 w-14 flex-none items-center justify-center rounded-control border border-line text-[16px] text-accent-ink">{initialsFor(organizer.name)}</span>
          )}
          <div className="min-w-0 text-[15px] leading-[1.6]">
            <p className="text-muted">{[organizer.kindLabel ?? capitalize(noun), place].filter(Boolean).join(" · ")}</p>
            {organizer.bio ? <p className="mt-1">{organizer.bio}</p> : <p className="mt-1 text-muted">No short bio yet. The public page leads with it. <Link href="/dashboard/act" className="text-accent-ink underline decoration-1 underline-offset-4">Add one</Link></p>}
            <p className="mt-1 text-[14px] text-muted">The photograph and the bio come from the organizer page, and they are what a sponsor sees first.</p>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ the project and the funding */}
      <Card
        title={draft.title || "No name yet"}
        subtitle={categoryLabel}
        right={<Link href={stagePath(draft.id, "project", kit)} className="text-accent-ink underline decoration-1 underline-offset-4">Edit the project</Link>}
      >
        <dl className="grid gap-4 text-[15px] leading-[1.6]">
          <Row label="The story">{draft.description || <Missing>Not yet said. Sponsors read this first.</Missing>}</Row>
          <Row label="What the funding enables" example={examples.has("purpose")}>{draft.purpose || <Missing>Not yet said.</Missing>}</Row>
          <Row label="Who will experience it" example={examples.has("audience_description")}>{draft.audience_description || <Missing>Not yet said.</Missing>}</Row>
          {draft.expected_attendance !== null && draft.expected_attendance !== undefined && (
            <Row label="Expected audience size">{draft.expected_attendance.toLocaleString("en-US")}, an estimate as you gave it. It is shown as one and promised to nobody.</Row>
          )}
          <Row label="Funding goal">{draft.goal_cents !== null && draft.goal_cents !== undefined ? <>{formatMoney(draft.goal_cents)}. What the work needs; separate from what the options can bring in, and never money raised.</> : <Missing>No goal set. A fundraiser can leave it out.</Missing>}</Row>
          {(mode || places.length > 0) && <Row label="Where">{[mode, ...places].filter(Boolean).join(" · ")}</Row>}
          {(draft.fundraising_starts_on || draft.fundraising_ends_on) && <Row label="Raising">{window(draft.fundraising_starts_on, draft.fundraising_ends_on)}</Row>}
          {(draft.starts_on || draft.ends_on) && <Row label={music ? "The dates" : "The work"}>{window(draft.starts_on, draft.ends_on)}</Row>}
          {music && (draft.kind || draft.show_count !== null) && (
            <Row label="Performances">{[draft.kind ? periodOf(draft.kind).noun.charAt(0).toUpperCase() + periodOf(draft.kind).noun.slice(1) : null, draft.show_count !== null && draft.show_count !== undefined ? `${draft.show_count} ${draft.show_count === 1 ? "date" : "dates"}` : null].filter(Boolean).join(", ")}</Row>
          )}
          {tagLabels.length > 0 && <Row label="How sponsors find it">{tagLabels.join(", ")}. Facts you picked, never read out of the words above.</Row>}
        </dl>
        <p className="text-[14px] text-muted">
          <Link href={stagePath(draft.id, "funding", kit)} className="text-accent-ink underline decoration-1 underline-offset-4">Edit the funding</Link>
        </p>
      </Card>

      {/* ------------------------------------------------------------ what a sponsor receives */}
      <Card
        title={optionKeys.length === 0 ? "No sponsorship option yet" : optionKeys.length === 1 ? "One sponsorship option" : `${optionKeys.length} sponsorship options`}
        subtitle="In return"
        right={<Link href={sponsorshipsHref} className="text-accent-ink underline decoration-1 underline-offset-4">{optionKeys.length === 0 ? "Build the first option" : "Edit the options"}</Link>}
      >
        <Row label="What sponsors can count on" example={examples.has("sponsor_promise")}>{draft.sponsor_promise || <Missing>Not yet said.</Missing>}</Row>
        {optionKeys.length === 0 && templates.length === 0 && (
          <p className="text-[15px] text-muted">{categoryLabel} has no sponsorship option templates yet, so no priced option can be saved and nothing can be bought. The line above is the whole offer for now.</p>
        )}
        {optionKeys.map((key) => {
          const template = templates.find((t) => t.key === key);
          const option = optionFromLots(key, lots, template?.defaultPriceCents ?? null);
          const first = lots.find((l) => l.surface_key === key)!;
          const parsed = parseOfferTerms(termsFromDraft(option.terms));
          const terms = parsed.ok ? parsed.terms : {};
          const missing = option.locked || option.grandfathered ? [] : optionMissing(option.row, terms);
          const held = lots.filter((l) => l.surface_key === key).some((l) => termsRequired(l, lots));
          const spots = spotsOf(option.row.count);
          return (
            <div key={key} className="border-t border-line pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="heading text-[16px]">{template?.name ?? key}</h3>
                <span className="text-[14.5px] text-muted">
                  {formatMoney(first.price_cents)} {first.mode === "auction" ? "to open the bidding" : "each"} · {spots} {spots === 1 ? "spot" : "spots"}
                  {first.mode === "auction" && first.buy_now_cents ? ` · ${formatMoney(first.buy_now_cents)} to take it now` : ""}
                </span>
              </div>
              {template?.seenBy && <p className="mt-1 text-[14px] text-muted">Door Money&apos;s description of this placement: seen by {template.seenBy}. Not part of your offer; your terms below are.</p>}
              <div className="mt-3">
                <OfferSummary terms={offerTermsView(offerTermsOf(first), { reach_estimate: first.reach_estimate, reach_basis: first.reach_basis })} policy={[]} heading="" />
              </div>
              {option.locked && <p className="mt-2 text-[14px] text-muted">A sponsor has bid on or paid for this option, so its terms are what that sponsor bought and stay as they are.</p>}
              {option.grandfathered && !held && <p className="mt-2 text-[14px] text-muted">On sale before offer terms were required. Anything missing here is optional, and finishing it is up to you.</p>}
              {missing.length > 0 && (
                <p className="mt-2 text-[14.5px] text-attention-ink">Still to say, and it keeps the fundraiser from publishing: {missing.map((m) => m.label.charAt(0).toLowerCase() + m.label.slice(1)).join("; ")}.</p>
              )}
            </div>
          );
        })}
      </Card>

      {/* ------------------------------------------------------------ how delivery is documented */}
      <Card id="verification" title={chosenMethods.length === 0 ? "Nothing chosen yet" : chosenMethods.length === 1 ? "One way of documenting delivery" : `${chosenMethods.length} ways of documenting delivery`} subtitle="What you commit to document">
        <p className="max-w-[62ch] text-[15px] text-muted">
          Only what you choose here goes on the public page, and it never claims more than that. Documentation comes from you; Door Money passes it on and inspects nothing.
        </p>
        <VerificationEditor runId={draft.id} methods={verification.methods} other={verification.other} runStatus="draft" categoryKey={categoryKey} />
      </Card>

      {/* ------------------------------------------------------------ what Door Money's policy decides */}
      <Card title="What happens to the money" subtitle="Saved policy terms">
        <dl className="grid gap-2 text-[15px] leading-[1.6]">
          {release && <Row label="Release">{release}</Row>}
          {statements.map((s) => <Row key={s.key} label={s.label}>{s.sentence}</Row>)}
        </dl>
        <p className="text-[14px] text-muted">These are Door Money&apos;s terms for this category at its current policy version, recorded against every purchase. You cannot change them here, and a note of yours beside them changes nothing.</p>
      </Card>

      {/* ------------------------------------------------------------ the decision */}
      <Card title={publishable ? (blockers.length === 0 ? "Ready to publish" : "Not yet") : "A private draft, for now"} subtitle="The decision">
        <PublishDecision
          runId={draft.id}
          publishable={publishable}
          blockers={blockers}
          becomesPublic={whatBecomesPublic({ publicUrl, policyStatus })}
          keepHref={keepHref}
          workspaceHref={workspaceHref}
        />
        <p className="text-[14px] text-muted">
          <Link href={sponsorshipsHref} className="text-accent-ink underline decoration-1 underline-offset-4">Back to the sponsorship options</Link>
        </p>
      </Card>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function window(from: string | null | undefined, to: string | null | undefined): string {
  if (from && to) return formatDateRange(from, to);
  if (from) return `From ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return "";
}

function Row({ label, example = false, children }: { label: string; example?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[14px] text-muted">{label}{example && <span className="ml-2 text-attention-ink">Still the starter idea&apos;s example wording, unchanged</span>}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-muted">{children}</span>;
}
