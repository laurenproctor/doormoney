import { NextResponse } from "next/server";
import { runAuctionJob } from "@/lib/auctions";
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
    return NextResponse.json({ auctions, mail });
  } catch (e) {
    console.error("daily job failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "daily job failed" }, { status: 500 });
  }
}
