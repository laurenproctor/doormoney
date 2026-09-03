import { NextResponse } from "next/server";
import { runWeeklyPayouts } from "@/lib/payouts";
import { stripeConfigured } from "@/lib/stripe";

/**
 * The Friday payout job. Vercel Cron calls this on the schedule in vercel.json with
 * `Authorization: Bearer $CRON_SECRET`. Anyone with the secret can run it early; the job is
 * idempotent, so that is safe.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  try {
    const summary = await runWeeklyPayouts();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("payout job failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "payout job failed" }, { status: 500 });
  }
}
