import { NextResponse } from "next/server";
import { z } from "zod";
import { closeTimeOf } from "@/lib/auctions";
import { patronFor, payingProfileId } from "@/lib/patrons";
import { createBidSetupIntent, customerForPatron, stripeConfigured } from "@/lib/stripe";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/*
  Where a bidder's card is stored, before the bid is placed.

  Nothing is charged here. A SetupIntent saves the card against the patron's Stripe customer so the
  close can charge it with nobody present. The bid itself goes in afterwards, through the server
  action in src/app/actions/bids.ts, which reads this SetupIntent back from Stripe rather than
  trusting anything the browser says about it.

  A route handler rather than a server action because the bid form is a client island confirming
  the SetupIntent with Stripe.js, and it needs the client secret before it has anything to post.
*/

// Seeded ids are not RFC 4122 UUIDs, so a plain shape check rather than zod's strict .uuid().
const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Input = z.object({
  lotId: Id,
  patronName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  /** Left empty by people, filled in by robots. */
  website: z.string().max(0).optional(),
});

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (!stripeConfigured()) return fail("Bidding is unavailable right now. Try again shortly.", 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("That did not look right.");
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return fail("Check the name and the email.");
  if (parsed.data.website) return fail("That did not go through.");

  const sb = supabaseAdmin();

  // The lot has to be biddable before a card is taken. Storing a card for a closed auction would
  // leave a patron with a saved card and nothing to show for it.
  const { data } = await sb
    .from("lots")
    .select("id,mode,status,closes_at,runs!inner(status,bidding_closes_at)")
    .eq("id", parsed.data.lotId)
    .maybeSingle();
  const lot = data as unknown as { id: string; mode: string; status: string; closes_at: string | null; runs: { status: string; bidding_closes_at: string | null } } | null;
  if (!lot) return fail("That spot is not on any fundraiser.", 404);
  if (lot.mode !== "auction") return fail("That spot is a fixed price, not an auction.");
  if (!["open", "live"].includes(lot.runs.status) || lot.status !== "open") return fail("Bidding on that spot is over.", 409);
  const closesAt = closeTimeOf(lot, lot.runs);
  if (closesAt && closesAt <= new Date().toISOString()) return fail("Bidding on that spot has closed.", 409);

  const email = parsed.data.email.toLowerCase();
  const { data: session } = await (await supabaseServer()).auth.getUser();
  const patronId = await patronFor(sb, parsed.data.patronName, email, payingProfileId(session.user, email));
  if (!patronId) return fail("That did not save. Try once more.", 500);

  // One Stripe customer per patron, so somebody bidding on a second board reuses the card they
  // already gave rather than typing it again.
  const { data: patron } = await sb.from("patrons").select("stripe_customer_id").eq("id", patronId).maybeSingle();
  let customerId: string;
  try {
    customerId = await customerForPatron({
      existingId: (patron as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null,
      name: parsed.data.patronName,
      email,
      patronId,
    });
  } catch (e) {
    console.error("bid customer failed", e instanceof Error ? e.message : e);
    return fail("That did not go through. Try once more.", 502);
  }
  await sb.from("patrons").update({ stripe_customer_id: customerId }).eq("id", patronId).is("stripe_customer_id", null);

  try {
    const intent = await createBidSetupIntent({ customerId, lotId: lot.id, patronId });
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (e) {
    console.error("bid setup intent failed", e instanceof Error ? e.message : e);
    return fail("That did not go through. Try once more.", 502);
  }
}
