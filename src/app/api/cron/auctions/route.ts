import { NextResponse } from "next/server";
import { runAuctionJob } from "@/lib/auctions";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The auction worker: warn the bidders a day out, close what is due, roll what lapsed.
 *
 * This is the only thing that settles an auction. A fundraiser's page used to settle its own
 * overdue lots while rendering, which meant an anonymous page load could close an auction, charge
 * a card and send email; remediation Phase 3 took that out. The daily job still calls the same pass as a
 * backstop, and migration 0036 schedules this route every few minutes from the database, so a
 * close lands on time whatever the hosting plan's cron allows.
 *
 * Every step is idempotent and each lot is settled under its own row lock in Postgres
 * (migration 0035), so overlapping calls from the schedule, the daily job and a person all end
 * with one winner and one offer.
 *
 * Called with `Authorization: Bearer $CRON_SECRET`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const auctions = await runAuctionJob(supabaseAdmin());
    return NextResponse.json({ auctions });
  } catch (e) {
    console.error("auction worker failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "auction worker failed" }, { status: 500 });
  }
}
