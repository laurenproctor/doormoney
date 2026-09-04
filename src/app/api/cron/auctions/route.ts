import { NextResponse } from "next/server";
import { runAuctionJob } from "@/lib/auctions";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The auction pass: warn the bidders a day out, close what is due, and roll a lot to the next bid
 * when the winner lets the 48 hours run out. Vercel Cron calls it on the schedule in vercel.json
 * with `Authorization: Bearer $CRON_SECRET`. Idempotent, so running it early or twice is safe.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runAuctionJob(supabaseAdmin()));
  } catch (e) {
    console.error("auction job failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "auction job failed" }, { status: 500 });
  }
}
