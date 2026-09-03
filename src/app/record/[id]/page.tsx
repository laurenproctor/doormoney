import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { Page } from "@/components/Page";
import { NewsletterCTA } from "@/components/Newsletter";
import { themeFor } from "@/components/Theme";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { lotName } from "@/lib/purchases";
import { supabaseAdmin } from "@/lib/supabase/server";

/*
  The record: what a patron receives at the end of a run. Every show the placement ran at, the rooms,
  the attendance where the act counted it, and where the money went. The URL is the purchase id, which
  nobody can guess; it is emailed to the patron with the receipt and again when the run closes.
  Nothing on this page is private beyond the patron's own name and amount, which they already know.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

type Row = {
  id: string;
  amount_cents: number;
  fee_cents: number;
  payment_status: string;
  refunded_cents: number;
  created_at: string;
  patrons: { name: string } | null;
  lots: {
    label: string | null;
    surface_key: string;
    runs: {
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
  };
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!ID.test(id)) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("purchases")
    .select("id,amount_cents,fee_cents,payment_status,refunded_cents,created_at,patrons(name),lots!inner(label,surface_key,runs!inner(id,title,kind,status,starts_on,ends_on,show_count,closed_at,cancelled_at,acts!inner(slug,name,city,photo_url)))")
    .eq("id", id)
    .in("payment_status", ["held", "released", "refunded", "partially_refunded"])
    .maybeSingle();
  if (!data) return null;
  const p = data as unknown as Row;
  const [{ data: shows }, { data: slices }] = await Promise.all([
    sb.from("shows").select("id,played_on,venue,city,played,attendance,photo_url").eq("run_id", p.lots.runs.id).order("played_on"),
    sb.from("payout_schedule").select("due_on,amount_cents,status").eq("purchase_id", p.id).order("due_on"),
  ]);
  return { p, shows: shows ?? [], slices: slices ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await load(id);
  if (!r) return { title: "Record", robots: { index: false } };
  return { title: `${r.p.lots.runs.acts.name}, record of the ${r.p.lots.runs.title.toLowerCase()}`, robots: { index: false, follow: false } };
}

const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function RecordPage({ params }: Props) {
  const { id } = await params;
  const r = await load(id);
  if (!r) notFound();
  const { p, shows, slices } = r;
  const run = p.lots.runs;
  const act = run.acts;
  const season = run.kind === "season";
  const unit = season ? "gigs" : "shows";

  const played = shows.filter((s) => s.played);
  const counted = played.filter((s) => s.attendance != null);
  const attendance = counted.reduce((n, s) => n + (s.attendance ?? 0), 0);
  const rooms = new Set(played.map((s) => s.venue).filter(Boolean)).size;
  const paidCents = slices.filter((s) => s.status === "paid").reduce((n, s) => n + s.amount_cents, 0);
  const netCents = p.amount_cents - p.fee_cents;

  const state =
    run.status === "cancelled"
      ? "The run was cancelled"
      : run.status === "closed"
        ? "The run is over"
        : run.status === "live"
          ? "The run is on"
          : "The run has not started";

  const facts: [string, string][] = [
    [String(played.length), `of ${run.show_count} ${unit} played`],
    ...(rooms ? [[String(rooms), rooms === 1 ? "room" : "rooms"] as [string, string]] : []),
    ...(counted.length ? [[attendance.toLocaleString("en-US"), `people across ${counted.length} counted ${counted.length === 1 ? "show" : "shows"}`] as [string, string]] : []),
    [formatMoney(paidCents), `of ${formatMoney(netCents)} reached ${act.name}`],
  ];

  return (
    <Page
      theme={themeFor(act.slug)}
      current="/auctions"
      eyebrow="Record of the run"
      title={act.name}
      accent=""
      strap={state}
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {run.title}. {run.show_count} {unit}, {formatDateRange(run.starts_on, run.ends_on)}. {act.city}.
          </p>
          <p className="mt-5">
            <b>{p.patrons?.name ?? "A patron"}</b> holds the {lotName(p.lots).toLowerCase()} on this run: {formatMoney(p.amount_cents)}, paid on{" "}
            {new Date(p.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
            {p.refunded_cents > 0 && ` ${formatMoney(p.refunded_cents)} of it went back when the run was cancelled.`}
          </p>
        </>
      }
    >
      <Section>
        <SectionHead eyebrow="Where it went">What the placement did</SectionHead>
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
        <SectionHead eyebrow={`The ${unit}`}>Every date the mark was in the room</SectionHead>
        {shows.length === 0 ? (
          <p className="text-muted">{act.name} has not entered the dates yet. They appear here as the run goes on.</p>
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
        <p className="mt-6 max-w-[62ch] text-[14.5px] text-muted">Attendance is the act&apos;s own count where they kept one. Door Money tracks runs lightly and says so.</p>
      </Section>

      <Section>
        <SectionHead eyebrow="The money">Week by week</SectionHead>
        <p className="text-muted">
          Door Money held {formatMoney(p.amount_cents)}, kept {formatMoney(p.fee_cents)}, and moves the rest to {act.name} in Friday slices through the run.
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
          <Eyebrow>Questions go to the board or to Door Money</Eyebrow>
        </div>
      </Section>

      <NewsletterCTA source="record" eyebrow="The next run" title="The next run, before the placements go." />
    </Page>
  );
}
