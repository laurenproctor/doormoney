import { NextResponse } from "next/server";
import { z } from "zod";
import { backingFee } from "@/lib/backings";
import { WIDGET_TIERS, widgetTier } from "@/lib/catalog";
import { lotFee, lotName } from "@/lib/purchases";
import { SITE } from "@/lib/site";
import { CHECKOUT_MINUTES, createBackingIntent, createLotCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Starts a payment. Two kinds:
 * - `lot`: a fixed-price spot on a board. Creates the purchase, holds the lot for the patron for
 *   CHECKOUT_MINUTES, and returns the client secret for an embedded Checkout Session.
 * - `backing`: a fan tier through the widget. Creates the backing row and a PaymentIntent for the
 *   Payment Element inside the widget's frame; fulfilment happens in the webhook.
 * The widget lives on Door Money's origin inside a frame, so this is same-origin; it is a route handler
 * rather than a server action because the widget is a client island with no page of its own to post to.
 */
// Seeded ids are not RFC 4122 UUIDs, so a plain shape check rather than zod's strict .uuid().
const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Input = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("backing"),
    slug: z.string().trim().min(1).max(80),
    tier: z.enum(WIDGET_TIERS.map((t) => t.key) as [string, ...string[]]),
    displayName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200),
    source: z.enum(["widget", "board"]).default("widget"),
    /** The page the widget was embedded in, for the record. The frame reads it from document.referrer. */
    origin: z.string().trim().max(200).optional(),
  }),
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
  const sb = supabaseAdmin();
  if (input.kind === "backing") return startBacking(sb, input);

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
  const patronId = await patronFor(sb, input.patronName, email);
  if (!patronId) return fail("That did not save. Try once more.", 500);

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

type Admin = ReturnType<typeof supabaseAdmin>;

/** One patron row per (name, email). A fan and a business are both patrons. */
async function patronFor(sb: Admin, name: string, email: string) {
  const { data: known } = await sb.from("patrons").select("id").ilike("contact_email", email).eq("name", name).maybeSingle();
  if (known?.id) return known.id as string;
  const { data: created, error } = await sb.from("patrons").insert({ name, contact_email: email }).select("id").single();
  if (error || !created) return null;
  return created.id as string;
}

/** A fan tier. The row goes in first so the webhook has something to fulfil; a never-paid row is harmless and dropped if Stripe cancels the intent. */
async function startBacking(sb: Admin, input: Extract<z.infer<typeof Input>, { kind: "backing" }>) {
  const tier = widgetTier(input.tier);
  if (!tier) return fail("Invalid input", 400);

  const { data: act } = await sb.from("acts").select("id,slug,name").eq("slug", input.slug).maybeSingle();
  if (!act) return fail("That musician is not on Door Money.", 404);
  const { data: run } = await sb.from("runs").select("id,title").eq("act_id", act.id).in("status", ["open", "live"]).order("starts_on", { ascending: false }).limit(1).maybeSingle();
  if (!run) return fail("That board is closed.", 400);

  const email = input.email.toLowerCase();
  const patronId = await patronFor(sb, input.displayName, email);
  if (!patronId) return fail("That did not save. Try once more.", 500);

  const { data: backing, error } = await sb
    .from("backings")
    .insert({ run_id: run.id, patron_id: patronId, tier: tier.key, amount_cents: tier.amountCents, fee_cents: backingFee(tier.amountCents), display_name: input.displayName, source: input.source, origin: input.origin ?? null })
    .select("id")
    .single();
  if (error || !backing) return fail("That did not save. Try once more.", 500);

  try {
    const pi = await createBackingIntent({
      backingId: backing.id,
      runId: run.id,
      actId: act.id,
      actSlug: act.slug,
      tier: tier.key,
      amountCents: tier.amountCents,
      description: `${tier.title}, ${act.name}, ${run.title}`,
      fanEmail: email,
    });
    await sb.from("backings").update({ stripe_payment_intent_id: pi.id }).eq("id", backing.id);
    return NextResponse.json({ clientSecret: pi.client_secret, backingId: backing.id });
  } catch (e) {
    console.error("backing intent failed", e instanceof Error ? e.message : e);
    await sb.from("backings").delete().eq("id", backing.id).eq("payment_status", "requires_payment");
    return fail("Payment could not start. Try once more.", 502);
  }
}
