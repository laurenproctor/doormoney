import { NextResponse } from "next/server";
import { z } from "zod";
import { WIDGET_TIERS } from "@/lib/catalog";
import { feeCents } from "@/lib/money";
import { lotFee, lotName } from "@/lib/purchases";
import { SITE } from "@/lib/site";
import { CHECKOUT_MINUTES, createLotCheckoutSession, stripe, stripeConfigured } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Starts a payment. Two kinds:
 * - `lot`: a fixed-price spot on a board. Creates the purchase, holds the lot for the patron for
 *   CHECKOUT_MINUTES, and returns the client secret for an embedded Checkout Session.
 * - `backing`: a fan tier through the widget. Phase 4 finishes this branch.
 * Called from the widget cross-origin, so it's a route handler, not a server action.
 */
// Seeded ids are not RFC 4122 UUIDs, so a plain shape check rather than zod's strict .uuid().
const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("backing"), slug: z.string(), tier: z.enum(["thank_you", "merch_card"]), displayName: z.string().min(1).max(80), email: z.string().email() }),
  z.object({ kind: z.literal("lot"), lotId: Id, patronName: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200) }),
]);

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

type LotRow = {
  id: string;
  label: string | null;
  surface_key: string;
  price_cents: number;
  mode: "fixed" | "auction";
  status: string;
  runs: { id: string; title: string; status: string; act_id: string; acts: { id: string; slug: string; name: string } };
};

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid input", 400);
  if (!stripeConfigured()) return fail("Payments are not open yet.", 503);

  const input = parsed.data;
  if (input.kind === "backing") {
    // Phase 4 replaces this with a Checkout Session and a backings row. Kept so the widget keeps compiling.
    const tier = WIDGET_TIERS.find((t) => t.key === input.tier)!;
    const pi = await stripe.paymentIntents.create({
      amount: tier.amountCents,
      currency: "usd",
      receipt_email: input.email,
      metadata: { kind: "backing", slug: input.slug, tier: input.tier, displayName: input.displayName, feeCents: String(feeCents(tier.amountCents)) },
    });
    return NextResponse.json({ clientSecret: pi.client_secret });
  }

  const sb = supabaseAdmin();
  const { data: lotData, error: lotError } = await sb
    .from("lots")
    .select("id,label,surface_key,price_cents,mode,status,runs!inner(id,title,status,act_id,acts!inner(id,slug,name))")
    .eq("id", input.lotId)
    .maybeSingle();
  if (lotError) return fail("That did not load. Try once more.", 500);
  const lot = lotData as unknown as LotRow | null;
  if (!lot) return fail("That spot is not on any board.", 404);
  if (lot.mode !== "fixed") return fail("That spot is an auction. Bids open in a later phase.", 400);
  if (!["open", "live"].includes(lot.runs.status)) return fail("That board is closed.", 400);
  if (lot.status === "sold") return fail("That spot is already taken.", 409);
  if (lot.status !== "open" && lot.status !== "pending_funding") return fail("That spot is not for sale.", 400);

  // Somebody else may be mid-checkout on this lot. Their hold lasts CHECKOUT_MINUTES; after that it is stale.
  const { data: existing } = await sb.from("purchases").select("id,payment_status,created_at").eq("lot_id", lot.id).in("payment_status", ["requires_payment", "held", "released"]).maybeSingle();
  if (existing) {
    if (existing.payment_status !== "requires_payment") return fail("That spot is already taken.", 409);
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < (CHECKOUT_MINUTES + 5) * 60_000) return fail("Someone is taking that spot right now. Try again in a few minutes.", 409);
    await sb.from("purchases").delete().eq("id", existing.id).eq("payment_status", "requires_payment");
  }

  // The patron: the same business paying twice should be one patron row.
  const email = input.email.toLowerCase();
  const { data: knownPatron } = await sb.from("patrons").select("id").ilike("contact_email", email).eq("name", input.patronName).maybeSingle();
  let patronId = knownPatron?.id as string | undefined;
  if (!patronId) {
    const { data: created, error } = await sb.from("patrons").insert({ name: input.patronName, contact_email: email }).select("id").single();
    if (error || !created) return fail("That did not save. Try once more.", 500);
    patronId = created.id;
  }

  // The purchase. A partial unique index keeps one live purchase per lot, so two patrons racing cannot both get through.
  const amount = lot.price_cents;
  const { data: purchase, error: purchaseError } = await sb
    .from("purchases")
    .insert({ lot_id: lot.id, patron_id: patronId, amount_cents: amount, fee_cents: lotFee(amount) })
    .select("id")
    .single();
  if (purchaseError || !purchase) return fail("Someone is taking that spot right now. Try again in a few minutes.", 409);

  const deadline = new Date(Date.now() + CHECKOUT_MINUTES * 60_000).toISOString();
  await sb.from("lots").update({ status: "pending_funding", funding_deadline: deadline }).eq("id", lot.id).in("status", ["open", "pending_funding"]);

  const act = lot.runs.acts;
  const origin = process.env.NODE_ENV === "production" ? SITE.url : new URL(req.url).origin;
  try {
    const session = await createLotCheckoutSession({
      purchaseId: purchase.id,
      lotId: lot.id,
      actId: act.id,
      actSlug: act.slug,
      amountCents: amount,
      description: `${lotName(lot)}, ${act.name}, ${lot.runs.title}`,
      patronEmail: email,
      returnUrl: `${origin}/board/${act.slug}?paid={CHECKOUT_SESSION_ID}`,
    });
    await sb.from("purchases").update({ stripe_checkout_session_id: session.id }).eq("id", purchase.id);
    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (e) {
    // Stripe said no. Give the lot back so the patron can try again.
    console.error("checkout session failed", e instanceof Error ? e.message : e);
    await sb.from("purchases").delete().eq("id", purchase.id);
    await sb.from("lots").update({ status: "open", funding_deadline: null }).eq("id", lot.id).eq("status", "pending_funding");
    return fail("Payment could not start. Try once more.", 502);
  }
}
