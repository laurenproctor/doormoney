import type { SupabaseClient } from "@supabase/supabase-js";
import { adminEmails } from "@/lib/admin";
import { formatDateRange } from "@/lib/dates";
import { newBoardsEmail, sendEmail, weeklyDigest, type DigestNumbers, type NewBoard } from "@/lib/email";
import { SITE } from "@/lib/site";
import { runUrl } from "@/lib/urls";

/*
  The mail that goes out on a schedule (docs/ROADMAP.md, Phase 7).

  Two jobs, both weekly, both driven by the daily cron rather than a cron of their own: this
  project's plan allows two cron jobs and they are spoken for. Each job checks when it last ran and
  does nothing until a week has passed, so running the daily job every day sends nothing extra.

  - The new-boards email, to everyone on the list, when boards have opened since the last one.
  - The digest, to Door Money, with the week in numbers.
*/

type Admin = SupabaseClient;

const WEEK_MS = 7 * 24 * 3600 * 1000;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** When a kind of mail last went out, or null if it never has. */
async function lastSent(sb: Admin, kind: string) {
  const { data } = await sb.from("mail_runs").select("sent_at").eq("kind", kind).order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return data?.sent_at ? new Date(data.sent_at as string) : null;
}

const dueForAnother = (last: Date | null, now: Date) => !last || now.getTime() - last.getTime() >= WEEK_MS;

type RunRow = {
  id: string;
  title: string;
  kind: string;
  starts_on: string;
  ends_on: string;
  show_count: number;
  slug: string;
  acts: { name: string; slug: string; city: string };
};

/** Boards that have opened and never been in an email. */
async function unannouncedBoards(sb: Admin): Promise<{ runs: RunRow[]; boards: NewBoard[] }> {
  const { data } = await sb
    .from("runs")
    .select("id,slug,title,kind,starts_on,ends_on,show_count,acts!inner(name,slug,city)")
    .is("announced_at", null)
    .in("status", ["open", "live"])
    .order("created_at");
  const runs = (data ?? []) as unknown as RunRow[];
  const boards: NewBoard[] = [];
  for (const r of runs) {
    const { data: lots } = await sb.from("lots").select("price_cents,status").eq("run_id", r.id);
    const open = (lots ?? []).filter((l) => l.status === "open");
    boards.push({
      actName: r.acts.name,
      city: r.acts.city,
      runTitle: r.title,
      showCount: r.show_count,
      dates: formatDateRange(r.starts_on, r.ends_on),
      openSpots: open.length,
      fromCents: open.length ? Math.min(...open.map((l) => l.price_cents as number)) : null,
      boardUrl: runUrl(r.acts.slug, r.slug),
    });
  }
  return { runs, boards };
}

export type NewBoardsResult = { sent: number; failed: number; boards: number } | null;

/**
 * The new-boards email. Sends only when boards are waiting and a week has passed, so the promise
 * on the signup form ("never more than weekly") holds even though the job runs daily.
 * A board is marked announced whether or not every send succeeded, so nobody is mailed twice.
 */
export async function sendNewBoards(sb: Admin, now = new Date()): Promise<NewBoardsResult> {
  if (!dueForAnother(await lastSent(sb, "new_boards"), now)) return null;
  const { runs, boards } = await unannouncedBoards(sb);
  if (!boards.length) return null;

  const { data: subs } = await sb.from("newsletter").select("email,first_name,unsubscribe_token").is("unsubscribed_at", null);
  const list = (subs ?? []) as { email: string; first_name: string | null; unsubscribe_token: string }[];
  if (!list.length) return null;

  let sent = 0;
  let failed = 0;
  for (const s of list) {
    const r = await sendEmail(newBoardsEmail({ to: s.email, firstName: s.first_name, boards, unsubscribeUrl: `${SITE.url}/newsletter/unsubscribe?t=${s.unsubscribe_token}` }));
    if (r.sent) sent += 1;
    else {
      failed += 1;
      console.error("new boards email not sent", s.email, r.reason);
    }
  }

  await sb.from("runs").update({ announced_at: now.toISOString() }).in("id", runs.map((r) => r.id));
  await sb.from("mail_runs").insert({ kind: "new_boards", sent_at: now.toISOString(), recipients: sent, failures: failed, detail: { boards: boards.map((b) => b.boardUrl) } });
  return { sent, failed, boards: boards.length };
}

/** The week's numbers, for the digest. */
async function digestNumbers(sb: Admin, now: Date): Promise<DigestNumbers> {
  const since = new Date(now.getTime() - WEEK_MS).toISOString();
  const head = { count: "exact" as const, head: true };

  const [{ data: sold }, { data: backed }, { data: paid }, { data: held }] = await Promise.all([
    sb.from("purchases").select("amount_cents").gte("created_at", since).in("payment_status", ["held", "released", "partially_refunded"]),
    sb.from("backings").select("amount_cents").gte("created_at", since).in("payment_status", ["held", "released", "partially_refunded"]),
    sb.from("payout_schedule").select("amount_cents").eq("status", "paid").gte("paid_at", since),
    sb.from("payout_schedule").select("amount_cents").in("status", ["scheduled", "paused"]),
  ]);
  const sum = (rows: { amount_cents: number }[] | null) => (rows ?? []).reduce((n, r) => n + r.amount_cents, 0);

  const [boardsOpened, flaggedPurchases, flaggedBackings, newSubscribers, newNotes, actsTotal, boardsLive] = await Promise.all([
    sb.from("runs").select("id", head).gte("created_at", since).in("status", ["open", "live"]),
    sb.from("purchases").select("id", head).not("flagged_at", "is", null).is("flag_cleared_at", null),
    sb.from("backings").select("id", head).not("flagged_at", "is", null).is("flag_cleared_at", null),
    sb.from("newsletter").select("id", head).gte("created_at", since).is("unsubscribed_at", null),
    sb.from("contact_messages").select("id", head).gte("created_at", since),
    sb.from("acts").select("id", head),
    sb.from("runs").select("id", head).in("status", ["open", "live"]),
  ]);
  const n = (r: { count: number | null }) => r.count ?? 0;

  return {
    from: day(new Date(now.getTime() - WEEK_MS)),
    to: day(now),
    boardsOpened: n(boardsOpened),
    spotsSold: (sold ?? []).length,
    soldCents: sum(sold as { amount_cents: number }[] | null),
    backings: (backed ?? []).length,
    backedCents: sum(backed as { amount_cents: number }[] | null),
    paidOutCents: sum(paid as { amount_cents: number }[] | null),
    heldCents: sum(held as { amount_cents: number }[] | null),
    openFlags: n(flaggedPurchases) + n(flaggedBackings),
    newSubscribers: n(newSubscribers),
    newNotes: n(newNotes),
    actsTotal: n(actsTotal),
    boardsLive: n(boardsLive),
  };
}

export type DigestResult = { sent: number; numbers: DigestNumbers } | null;

/** The weekly digest to Door Money. Nothing goes out until a week has passed since the last one. */
export async function sendDigest(sb: Admin, now = new Date()): Promise<DigestResult> {
  const to = [...adminEmails()];
  if (!to.length) return null;
  if (!dueForAnother(await lastSent(sb, "digest"), now)) return null;

  const numbers = await digestNumbers(sb, now);
  let sent = 0;
  let failed = 0;
  for (const address of to) {
    const r = await sendEmail(weeklyDigest({ to: address, n: numbers, adminUrl: `${SITE.url}/admin` }));
    if (r.sent) sent += 1;
    else {
      failed += 1;
      console.error("digest not sent", address, r.reason);
    }
  }
  await sb.from("mail_runs").insert({ kind: "digest", sent_at: now.toISOString(), recipients: sent, failures: failed, detail: numbers });
  return { sent, numbers };
}

/** Both weekly jobs. Called by the daily cron; each one decides for itself whether it is due. */
export async function runWeeklyMail(sb: Admin, now = new Date()) {
  return { newBoards: await sendNewBoards(sb, now), digest: await sendDigest(sb, now) };
}
