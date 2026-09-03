import { NextResponse } from "next/server";
import { z } from "zod";
import { createHoldPaymentIntent } from "@/lib/stripe";
import { feeCents } from "@/lib/money";
import { WIDGET_TIERS } from "@/lib/catalog";

/**
 * Creates a PaymentIntent for a fan backing (widget) or a fixed-price lot (board).
 * Called from the widget cross-origin, so it's a route handler, not a server action.
 * Returns the client secret the Payment Element mounts with.
 */
const Input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("backing"), slug: z.string(), tier: z.enum(["thank_you", "merch_card"]), displayName: z.string().min(1).max(80), email: z.string().email() }),
  z.object({ kind: z.literal("lot"), lotId: z.string().uuid(), patronName: z.string().min(1).max(120), email: z.string().email() }),
]);

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const input = parsed.data;
  if (input.kind === "backing") {
    const tier = WIDGET_TIERS.find((t) => t.key === input.tier)!;
    const pi = await createHoldPaymentIntent({
      amountCents: tier.amountCents,
      patronEmail: input.email,
      metadata: { kind: "backing", slug: input.slug, tier: input.tier, displayName: input.displayName, feeCents: String(feeCents(tier.amountCents)) },
    });
    // TODO Phase 4: insert a `backings` row with payment_status 'requires_payment' and the PI id
    return NextResponse.json({ clientSecret: pi.client_secret });
  }

  // TODO Phase 3: look up the lot, confirm it's open and fixed-price, create PI for lot.price_cents,
  // insert a `purchases` row, mark lot 'pending_funding'.
  return NextResponse.json({ error: "Lot checkout lands in Phase 3" }, { status: 501 });
}
