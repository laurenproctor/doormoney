import { NextResponse } from "next/server";
import { runAuctionJob } from "@/lib/auctions";
import { sendMarkReminders } from "@/lib/marks";
import { runRefundJob } from "@/lib/outbox";
import { runEventJob } from "@/lib/stripeEvents";
import { runWeeklyMail } from "@/lib/weekly";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The daily job. Two things live here because this project's plan allows two cron jobs and the
 * other one is the Friday payout run.
 *
 * - The auction pass: warn the bidders a day out, close what is due, and roll a lot to the next
 *   bid when the winner lets the 48 hours run out. Boards also settle themselves on sight, so this
 *   is the backstop for a board nobody visits.
 * - The weekly mail: the new-boards email and Door Money's digest. Each decides for itself whether
 *   a week has passed, so calling this daily sends nothing extra.
 * - One reminder to any patron whose spot is paid for but whose mark has not arrived.
 * - The refund queue: every refund Door Money owes and has not yet managed to send, plus a sweep
 *   of cancelled fundraisers for obligations that were never written down at all.
 * - The webhook queue: every Stripe event whose handler failed, and any a worker left in flight.
 *   Stripe retries a 500 for a while and then stops; this keeps trying after it has.
 *
 * Vercel Cron calls it on the schedule in vercel.json with `Authorization: Bearer $CRON_SECRET`.
 * Everything here is idempotent, so running it early or twice is safe.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  try {
    const auctions = await runAuctionJob(sb);
    // Mail must not be able to hold up the auctions, which move money. Its failure is reported, not thrown.
    let mail;
    try {
      mail = await runWeeklyMail(sb);
    } catch (e) {
      console.error("weekly mail failed", e instanceof Error ? e.message : e);
      mail = { error: "weekly mail failed" };
    }
    let marks;
    try {
      marks = await sendMarkReminders(sb);
    } catch (e) {
      console.error("mark reminders failed", e instanceof Error ? e.message : e);
      marks = { error: "mark reminders failed" };
    }
    // Money a patron is owed. Reported rather than thrown for the same reason as the mail: one
    // refund Stripe will not take today must not stop the rest of the job, and the queue holds
    // every one of them until it does.
    let refunds;
    try {
      refunds = await runRefundJob(sb);
    } catch (e) {
      console.error("refund queue failed", e instanceof Error ? e.message : e);
      refunds = { error: "refund queue failed" };
    }
    // Stripe events whose handler failed. Reported rather than thrown, like the mail and the
    // refunds: one event that will not process today must not stop the rest of the job.
    let events;
    try {
      events = await runEventJob(sb);
    } catch (e) {
      console.error("webhook queue failed", e instanceof Error ? e.message : e);
      events = { error: "webhook queue failed" };
    }
    return NextResponse.json({ auctions, mail, marks, refunds, events });
  } catch (e) {
    console.error("daily job failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "daily job failed" }, { status: 500 });
  }
}
