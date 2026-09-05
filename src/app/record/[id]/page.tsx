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
import { supabaseAdmin } from "@/lib/supabase/server";

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
  kind: string;
  status: string;
  starts_on: string;
  ends_on: string;
  show_count: number;
  closed_at: string | null;
  cancelled_at: string | null;
  acts: { slug: string; name: string; city: string; photo_url: string | null };
};
const RUN = "runs!inner(id,title,kind,status,starts_on,ends_on,show_count,closed_at,cancelled_at,acts!inner(slug,name,city,photo_url))";

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
  return { p, shows: shows ?? [], slices: slices ?? [] };
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
  const { p, shows, slices } = r;
  const run = p.runs;
  const act = run.acts;
  const backing = p.kind === "backing";
  // The period by name, never "the run": docs/DECISIONS.md, decision 14.
  const period = periodOf(run.kind);

  const played = shows.filter((s) => s.played);
  const counted = played.filter((s) => s.attendance != null);
  const attendance = counted.reduce((n, s) => n + (s.attendance ?? 0), 0);
  const rooms = new Set(played.map((s) => s.venue).filter(Boolean)).size;
  const paidCents = slices.filter((s) => s.status === "paid").reduce((n, s) => n + s.amount_cents, 0);
  const netCents = p.amount_cents - p.fee_cents;

  const state =
    run.status === "cancelled"
      ? `The ${period.noun} was cancelled`
      : run.status === "closed"
        ? `The ${period.noun} is over`
        : run.status === "live"
          ? `The ${period.noun} is on`
          : `The ${period.noun} has not started`;

  const facts: [string, string][] = [
    [String(played.length), `of ${run.show_count} ${period.units} played`],
    ...(rooms ? [[String(rooms), rooms === 1 ? "room" : "rooms"] as [string, string]] : []),
    ...(counted.length ? [[attendance.toLocaleString("en-US"), `people across ${counted.length} counted ${counted.length === 1 ? "show" : "shows"}`] as [string, string]] : []),
    [formatMoney(paidCents), `of ${formatMoney(netCents)} reached ${act.name}`],
  ];

  return (
    <Page
      theme={themeFor(act.slug)}
      current="/auctions"
      eyebrow={`Record of the ${period.noun}`}
      title={act.name}
      accent=""
      strap={state}
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {run.title}. {run.show_count} {period.units}, {formatDateRange(run.starts_on, run.ends_on)}. {act.city}.
          </p>
          <p className="mt-5">
            <b>{p.patronName}</b> {backing ? `backs this ${period.noun}, ${p.what}` : `holds ${p.what} on this ${period.noun}`}: {formatMoney(p.amount_cents)}, paid on{" "}
            {new Date(p.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
            {p.refunded_cents > 0 && ` ${formatMoney(p.refunded_cents)} of it went back when the ${period.noun} was cancelled.`}
          </p>
        </>
      }
    >
      {/* The one thing the patron may still owe: the logo. Stays up until the musician decides. */}
      {!backing && run.status !== "cancelled" && (p.markStatus === "none" || p.markStatus === "submitted") && (
        <Section className="pool">
          <SectionHead eyebrow={p.markStatus === "none" ? "Still to send" : "With the musician"}>
            {p.markStatus === "none" ? `${act.name} is waiting for the logo` : `${act.name} has the logo`}
          </SectionHead>
          <p className="max-w-[62ch] text-muted">
            {p.markStatus === "none"
              ? `The logo is the name or image as it will appear on ${p.what}. Nothing goes up without ${act.name}'s yes, and nothing runs until it is in.`
              : `${act.name} approves or declines it, and Door Money sends an email either way. It can still be replaced until they decide.`}
          </p>
          <div className="mt-8">
            <ButtonLink href={`/mark/${p.id}`} arrow={p.markStatus === "none"} variant={p.markStatus === "none" ? "solid" : "ghost"}>
              {p.markStatus === "none" ? "Send the logo" : "Replace the logo"}
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

      <Section>
        <SectionHead eyebrow={`The ${period.units}`}>{backing ? `Every date on the ${period.noun}` : "Every date the logo was in the room"}</SectionHead>
        {shows.length === 0 ? (
          <p className="text-muted">{act.name} has not entered the dates yet. They appear here as the ${period.noun} goes on.</p>
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
      </Section>

      <Section>
        <SectionHead eyebrow="The money">Week by week</SectionHead>
        <p className="text-muted">
          Door Money held {formatMoney(p.amount_cents)}, kept {formatMoney(p.fee_cents)}, and moves the rest to {act.name} in Friday slices through the {period.noun}.
        </p>
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
          <Eyebrow>Questions go to the musician or to Door Money</Eyebrow>
        </div>
      </Section>

      {/* Optional, and after the record itself: nothing here interrupts a payment or a receipt. */}
      <Section>
        <SectionHead eyebrow="A patron page">Say what this patron listens for</SectionHead>
        <p className="mb-8 max-w-[56ch] text-[15px] text-muted">
          Patrons can keep a page at Door Money: a name, a few words, the music they turn up for, and whichever
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
