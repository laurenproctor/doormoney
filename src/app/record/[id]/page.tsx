import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { Page } from "@/components/Page";
import { NewsletterCTA } from "@/components/Newsletter";
import { themeFor } from "@/components/Theme";
import { tierPlace } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import type { MarkStatus } from "@/lib/marks";
import { formatMoney } from "@/lib/money";
import { periodOf } from "@/lib/periods";
import { lotName } from "@/lib/purchases";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { releaseRuleOf } from "@/lib/delivery-policy";
import { STATE_LABEL, deliveryStanding } from "@/lib/delivery-state";
import { materialsPrompt, recordStrap, recordWords, releaseSentence } from "@/lib/record-words";

/*
  The record: what a patron receives at the end of a fundraiser. Every show the logo was in the room
  for, the rooms, the attendance where the musician counted it, and where the money went. The URL is
  the purchase id (or the
  backing id, for a fan who came in through the widget), which nobody can guess; it is emailed to the
  patron with the receipt and again when the fundraiser closes.
  Nothing on this page is private beyond the patron's own name and amount, which they already know.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

type RunRow = {
  id: string;
  title: string;
  /** The fundraiser's category. Every record made before categories is music. */
  category_key: string | null;
  kind: string;
  status: string;
  starts_on: string;
  ends_on: string;
  show_count: number;
  closed_at: string | null;
  cancelled_at: string | null;
  acts: { slug: string; name: string; city: string; photo_url: string | null };
};
const RUN = "runs!inner(id,title,kind,category_key,status,starts_on,ends_on,show_count,closed_at,cancelled_at,acts!inner(slug,name,city,photo_url))";

type Money = { id: string; amount_cents: number; fee_cents: number; payment_status: string; refunded_cents: number; created_at: string };
type PurchaseRow = Money & { mark_status: MarkStatus; patrons: { name: string } | null; lots: { label: string | null; surface_key: string; runs: RunRow } };
type BackingRow = Money & { display_name: string; tier: string; runs: RunRow };

/** A purchase and a backing, seen the same way. */
type RecordRow = Money & {
  kind: "purchase" | "backing";
  patronName: string;
  /** "the kick drum head", "a name on the merch table card" */
  what: string;
  /** Where the logo stands. Backings carry a name, not a logo, so they are always "none". */
  markStatus: MarkStatus;
  runs: RunRow;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAID = ["held", "released", "refunded", "partially_refunded"];

async function loadRecord(sb: ReturnType<typeof supabaseAdmin>, id: string): Promise<RecordRow | null> {
  const { data: purchase } = await sb
    .from("purchases")
    .select(`id,amount_cents,fee_cents,payment_status,refunded_cents,created_at,mark_status,patrons(name),lots!inner(label,surface_key,${RUN})`)
    .eq("id", id)
    .in("payment_status", PAID)
    .maybeSingle();
  if (purchase) {
    const p = purchase as unknown as PurchaseRow;
    return { ...p, kind: "purchase", patronName: p.patrons?.name ?? "A patron", what: `the ${lotName(p.lots).toLowerCase()}`, markStatus: p.mark_status, runs: p.lots.runs };
  }
  const { data: backing } = await sb.from("backings").select(`id,amount_cents,fee_cents,payment_status,refunded_cents,created_at,display_name,tier,${RUN}`).eq("id", id).in("payment_status", PAID).maybeSingle();
  if (!backing) return null;
  const b = backing as unknown as BackingRow;
  return { ...b, kind: "backing", patronName: b.display_name, what: `a name on ${tierPlace(b.tier)}`, markStatus: "none", runs: b.runs };
}

async function load(id: string) {
  if (!ID.test(id)) return null;
  const sb = supabaseAdmin();
  const p = await loadRecord(sb, id);
  if (!p) return null;
  const [{ data: shows }, { data: slices }] = await Promise.all([
    sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", p.runs.id).order("played_on"),
    sb.from("payout_schedule").select("due_on,amount_cents,status").eq(p.kind === "purchase" ? "purchase_id" : "backing_id", p.id).order("due_on"),
  ]);
  return { p, shows: shows ?? [], slices: slices ?? [], delivery: p.kind === "purchase" ? await loadDelivery(sb, p.id, p.runs.id) : null };
}

type Delivery = {
  rule: "calendar" | "evidence";
  bought: { opportunity: string | null; purpose: string | null; promise: string | null; release: string | null } | null;
  deliverables: { id: string; title: string; status: string; due_at: string | null; evidenceCount: number }[];
  /** Only what this visitor may see: their own as a party to the purchase, plus anything published. */
  evidence: { deliverable: string; kind: string; url: string | null; note: string | null; isPublic: boolean }[];
};

/**
 * The purchased offer, its deliverables, and the evidence this visitor is allowed to see.
 *
 * A record is unlisted, and anyone holding its link can open it, so private evidence is never read
 * with the service role here. It is read under the visitor's own session: row level security
 * returns it to the organizer and to the sponsor's signed-in account, and to nobody else
 * (migration 0045). Everyone else sees only what the organizer published, item by item, and a
 * count of the rest. Null when the delivery tables are not there yet.
 */
async function loadDelivery(sb: ReturnType<typeof supabaseAdmin>, purchaseId: string, runId: string): Promise<Delivery | null> {
  try {
    const { data: snap, error } = await sb.from("purchase_snapshots").select("snapshot").eq("purchase_id", purchaseId).maybeSingle();
    if (error) return null;
    const snapshot = (snap as { snapshot: Record<string, unknown> } | null)?.snapshot ?? null;
    const { data: rows } = await sb.from("deliverables").select("id,title,status,due_at,evidence(id,removed_at)").eq("purchase_id", purchaseId).order("position");
    const deliverables = ((rows ?? []) as { id: string; title: string; status: string; due_at: string | null; evidence: { id: string; removed_at: string | null }[] }[]).map((d) => ({
      id: d.id, title: d.title, status: d.status, due_at: d.due_at, evidenceCount: d.evidence.filter((e) => !e.removed_at).length,
    }));

    const session = await supabaseServer();
    const [{ data: own }, { data: published }] = await Promise.all([
      session.from("evidence").select("kind,url,note,visibility,deliverables!inner(title,purchase_id)").eq("deliverables.purchase_id", purchaseId),
      session.from("public_evidence").select("deliverable,kind,url,note,lot_id").eq("run_id", runId),
    ]);
    const mine = ((own ?? []) as unknown as { kind: string; url: string | null; note: string | null; visibility: string; deliverables: { title: string } }[]).map((e) => ({
      deliverable: e.deliverables.title, kind: e.kind, url: e.url, note: e.note, isPublic: e.visibility === "public",
    }));
    const titles = new Set(deliverables.map((d) => d.title));
    const open = ((published ?? []) as { deliverable: string; kind: string; url: string | null; note: string | null }[])
      .filter((e) => titles.has(e.deliverable))
      .map((e) => ({ ...e, isPublic: true }));

    const o = snapshot as { opportunity?: { label?: string | null; template?: { name?: string } }; fundraiser?: { purpose?: string | null; sponsor_promise?: string | null }; policy?: { terms?: { release?: string } } } | null;
    return {
      rule: releaseRuleOf(snapshot),
      bought: o ? { opportunity: o.opportunity?.label ?? o.opportunity?.template?.name ?? null, purpose: o.fundraiser?.purpose ?? null, promise: o.fundraiser?.sponsor_promise ?? null, release: o.policy?.terms?.release ?? null } : null,
      deliverables,
      evidence: mine.length ? mine : open,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await load(id);
  if (!r) return { title: "Record", robots: { index: false } };
  return { title: `${r.p.runs.acts.name}, record of the ${r.p.runs.title.toLowerCase()}`, robots: { index: false, follow: false } };
}

const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function RecordPage({ params }: Props) {
  const { id } = await params;
  const r = await load(id);
  if (!r) notFound();
  const { p, shows, slices, delivery } = r;
  const run = p.runs;
  const act = run.acts;
  const backing = p.kind === "backing";
  // The period by name, never "the run": docs/DECISIONS.md, decision 14.
  const period = periodOf(run.kind);
  // Music keeps its own words. Every other category gets the neutral ones: src/lib/record-words.ts.
  const words = recordWords(run.category_key, run.kind);
  const music = words.music;

  const played = shows.filter((s) => s.played);
  const counted = played.filter((s) => s.attendance != null);
  const attendance = counted.reduce((n, s) => n + (s.attendance ?? 0), 0);
  const rooms = new Set(played.map((s) => s.venue).filter(Boolean)).size;
  const paidCents = slices.filter((s) => s.status === "paid").reduce((n, s) => n + s.amount_cents, 0);
  const netCents = p.amount_cents - p.fee_cents;

  const state = recordStrap(words, run.status);
  const standing = delivery
    ? deliveryStanding({
        releaseRule: delivery.rule,
        paymentStatus: p.payment_status,
        materialsStatus: p.markStatus,
        fundraiserStatus: run.status,
        amountCents: p.amount_cents,
        refundedCents: p.refunded_cents,
        deliverables: delivery.deliverables.map((d) => ({ status: d.status, hasEvidence: d.evidenceCount > 0, dueAt: d.due_at })),
        payouts: slices.map((sl) => ({ status: sl.status, amountCents: sl.amount_cents })),
      })
    : null;

  const facts: [string, string][] = [
    // Shows are a music idea. No other category is told it played none of a null number of them.
    ...(music ? [[String(played.length), `of ${run.show_count} ${period.units} played`] as [string, string]] : []),
    ...(!music && delivery ? [[String(delivery.deliverables.filter((d) => d.status === "delivered").length), `of ${delivery.deliverables.length} delivered`] as [string, string]] : []),
    ...(rooms ? [[String(rooms), rooms === 1 ? "room" : "rooms"] as [string, string]] : []),
    ...(counted.length ? [[attendance.toLocaleString("en-US"), `people across ${counted.length} counted ${counted.length === 1 ? "show" : "shows"}`] as [string, string]] : []),
    [formatMoney(paidCents), `of ${formatMoney(netCents)} reached ${act.name}`],
  ];

  return (
    <Page
      theme={themeFor(act.slug)}
      current="/auctions"
      eyebrow={`Record of the ${words.periodNoun}`}
      title={act.name}
      accent=""
      strap={state}
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {music ? `${run.title}. ${run.show_count} ${period.units}, ${formatDateRange(run.starts_on, run.ends_on)}. ${act.city}.` : [run.title, act.city].filter(Boolean).join(". ") + "."}
          </p>
          <p className="mt-5">
            <b>{p.patronName}</b> {backing ? `backs this ${words.periodNoun}, ${p.what}` : `holds ${p.what} on this ${words.periodNoun}`}: {formatMoney(p.amount_cents)}, paid on{" "}
            {new Date(p.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
            {p.refunded_cents > 0 && ` ${formatMoney(p.refunded_cents)} of it went back${run.status === "cancelled" ? ` when the ${words.periodNoun} was cancelled` : ""}.`}
          </p>
        </>
      }
    >
      {/* The one thing the sponsor may still owe: their materials, which for music is a logo. Stays up until the organizer decides. */}
      {!backing && run.status !== "cancelled" && (p.markStatus === "none" || p.markStatus === "submitted") && (
        <Section className="pool">
          <SectionHead eyebrow={materialsPrompt(words, { status: p.markStatus, organizerName: act.name, what: p.what }).eyebrow}>
            {materialsPrompt(words, { status: p.markStatus, organizerName: act.name, what: p.what }).heading}
          </SectionHead>
          <p className="max-w-[62ch] text-muted">{materialsPrompt(words, { status: p.markStatus, organizerName: act.name, what: p.what }).body}</p>
          <div className="mt-8">
            <ButtonLink href={`/mark/${p.id}`} arrow={p.markStatus === "none"} variant={p.markStatus === "none" ? "solid" : "ghost"}>
              {p.markStatus === "none" ? words.sendLabel : words.replaceLabel}
            </ButtonLink>
          </div>
        </Section>
      )}

      <Section>
        <SectionHead eyebrow="Where it went">{backing ? "What the backing did" : "What the sponsorship did"}</SectionHead>
        <div className="mt-8 flex flex-wrap gap-x-14 gap-y-6">
          {facts.map(([value, label]) => (
            <div key={label}>
              <b className="display block text-[clamp(30px,4.4vw,44px)] leading-none">{value}</b>
              <span className="caps mt-2 block max-w-[22ch] text-[14px] text-muted">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {delivery && delivery.rule === "evidence" && standing && (
        <Section>
          <SectionHead eyebrow="Delivery">{STATE_LABEL[standing.state]}</SectionHead>
          {delivery.bought && (
            <>
              {/* All three from the purchase snapshot, so a later edit to the fundraiser cannot change what this says. */}
              <dl className="grid max-w-[62ch] gap-5">
                {([
                  ["What was purchased", delivery.bought.opportunity],
                  ["What the funding supports", delivery.bought.purpose],
                  [`What ${act.name} promised`, delivery.bought.promise],
                ] as [string, string | null][]).filter(([, value]) => value?.trim()).map(([label, value]) => (
                  <div key={label}>
                    <dt className="caps text-[14px] text-accent-ink">{label}</dt>
                    <dd className="mt-1.5 text-[15px] leading-[1.6]">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
                This is the offer as it stood on the day of purchase. Changes to the fundraiser since then do not change it. {releaseSentence(words, act.name)}
              </p>
            </>
          )}
          <ol className="mt-8 grid gap-px bg-line">
            {delivery.deliverables.map((d) => (
              <li key={d.id} className="grid items-center gap-x-6 gap-y-2 bg-ground px-6 py-4 md:grid-cols-[1fr_auto]">
                <span className="text-[15px]">{d.title}</span>
                <span className="caps text-[14px] text-muted md:text-right">
                  {d.status === "delivered" ? "Documented" : d.due_at ? `Due ${day.format(new Date(d.due_at))}` : "Not yet"}
                  {d.evidenceCount > 0 && `, ${d.evidenceCount} ${d.evidenceCount === 1 ? "item" : "items"}`}
                </span>
              </li>
            ))}
          </ol>
          {standing.lateDeliverables > 0 && (
            <p className="mt-6 max-w-[62ch] text-[14.5px] text-muted">
              {standing.lateDeliverables === 1 ? "One deliverable is" : `${standing.lateDeliverables} deliverables are`} past the date with nothing attached. Door Money is still holding that share.
            </p>
          )}
          {delivery.evidence.length > 0 ? (
            <ul className="mt-8 divide-y divide-line border-y border-line">
              {delivery.evidence.map((e, i) => (
                <li key={i} className="py-4 text-[15px]">
                  <span className="caps mr-3 text-[14px] text-accent-ink">{e.isPublic ? "Published" : "Private"}</span>
                  {e.url ? (
                    <a href={e.url} rel="noopener noreferrer nofollow ugc" target="_blank" className="break-all text-accent-ink underline decoration-1 underline-offset-4">{e.deliverable}</a>
                  ) : (
                    e.deliverable
                  )}
                  {e.note && <span className="mt-1 block text-[14.5px] text-muted">{e.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            delivery.deliverables.some((d) => d.evidenceCount > 0) && (
              <p className="mt-6 max-w-[62ch] text-[14.5px] text-muted">
                The documentation is private to the sponsor and to {act.name}. Sign in as either to see it here.
              </p>
            )
          )}
        </Section>
      )}

      {music && <Section>
        <SectionHead eyebrow={`The ${period.units}`}>{backing ? `Every date on the ${period.noun}` : "Every date the logo was in the room"}</SectionHead>
        {shows.length === 0 ? (
          <p className="text-muted">{act.name} has not entered the dates yet. They appear here as the {period.noun} goes on.</p>
        ) : (
          <ol className="mt-8 grid gap-px bg-line">
            {shows.map((s) => (
              <li key={s.id} className={`grid items-center gap-x-6 gap-y-2 bg-ground px-6 py-4 md:grid-cols-[150px_1fr_auto] ${s.played ? "" : "text-muted"}`}>
                <span className="caps text-[14px]">{day.format(new Date(s.played_on))}</span>
                <span className="text-[15px]">
                  {s.venue ?? "Venue to come"}
                  {s.city ? `, ${s.city}` : ""}
                </span>
                <span className="caps text-[14px] text-muted md:text-right">
                  {s.played ? (s.attendance != null ? `${s.attendance.toLocaleString("en-US")} in the room` : "Played") : "Not yet"}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-6 max-w-[62ch] text-[14.5px] text-muted">Attendance is the musician&apos;s own count where they kept one. Door Money tracks fundraisers lightly and says so.</p>
      </Section>}

      <Section>
        <SectionHead eyebrow="The money">{music ? "Week by week" : "What has moved"}</SectionHead>
        <p className="text-muted">
          {music
            ? `Door Money held ${formatMoney(p.amount_cents)}, kept ${formatMoney(p.fee_cents)}, and moves the rest to ${act.name} in Friday slices through the ${period.noun}.`
            : `Door Money held ${formatMoney(p.amount_cents)} and kept ${formatMoney(p.fee_cents)}. ${releaseSentence(words, act.name)}`}
        </p>
        {!music && slices.length === 0 && <p className="mt-6 text-[14.5px] text-muted">Nothing has been released yet.</p>}
        <ol className="mt-8 grid max-w-[560px] gap-px bg-line">
          {slices.map((s) => (
            <li key={s.due_on} className="flex items-center justify-between gap-4 bg-ground px-5 py-3">
              <span className="caps text-[14px] text-muted">{day.format(new Date(s.due_on))}</span>
              <span className="display text-[20px]">{formatMoney(s.amount_cents)}</span>
              <span className={`caps text-[14px] ${s.status === "paid" ? "text-accent-ink" : "text-muted"}`}>{s.status === "paid" ? "Sent" : s.status === "skipped" ? "Refunded" : "Scheduled"}</span>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Eyebrow>Questions go to the {words.organizer} or to Door Money</Eyebrow>
        </div>
      </Section>

      {/* Optional, and after the record itself: nothing here interrupts a payment or a receipt. */}
      <Section>
        <SectionHead eyebrow="A patron page">Say what this patron supports</SectionHead>
        <p className="mb-8 max-w-[56ch] text-[15px] text-muted">
          Patrons can keep a page at Door Money: a name, a few words, the categories they support, and whichever
          fundraisers they choose to name. It starts private, nothing appears on it without being put there, and no
          amount is ever on it.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/patron/signup" variant="ghost" arrow>
            Open a patron account
          </ButtonLink>
        </div>
      </Section>

      <NewsletterCTA source="record" eyebrow="The next fundraiser" title="The next fundraiser, before the sponsorships go." />
    </Page>
  );
}
