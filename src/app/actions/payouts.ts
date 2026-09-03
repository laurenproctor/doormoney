"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { SITE } from "@/lib/site";

/**
 * Sends the act into Stripe's hosted Express onboarding. Creates the connected
 * account on first use. Without a Stripe key the button explains itself and stops.
 */
export async function startStripeOnboarding(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard/payouts");
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, error: "Payout setup is not open yet. Door Money will email listed acts when it is." };

  let accountId = act.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email ?? undefined,
      business_profile: { name: act.name, url: `${SITE.url}/board/${act.slug}`, product_description: "Sponsorship placements for a working musician" },
      capabilities: { transfers: { requested: true } },
      metadata: { act_id: act.id, slug: act.slug },
    });
    accountId = account.id;
    const sb = await supabaseServer();
    const { error } = await sb.from("acts").update({ stripe_account_id: accountId }).eq("id", act.id);
    if (error) return { ok: false, error: "That did not save. Try once more." };
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${SITE.url}/dashboard/payouts?refresh=1`,
    return_url: `${SITE.url}/dashboard/payouts?return=1`,
    type: "account_onboarding",
  });
  redirect(link.url);
}

/** After Stripe sends the act back, read the account once so the dashboard is right before the webhook lands. */
export async function syncStripeStatus(): Promise<void> {
  const user = await requireUser("/dashboard/payouts");
  const act = await ownedAct(user.id);
  if (!act?.stripe_account_id || !process.env.STRIPE_SECRET_KEY) return;
  const account = await stripe.accounts.retrieve(act.stripe_account_id);
  const enabled = Boolean(account.payouts_enabled && account.charges_enabled !== false);
  if (enabled !== act.stripe_payouts_enabled) {
    const sb = await supabaseServer();
    await sb.from("acts").update({ stripe_payouts_enabled: enabled }).eq("id", act.id);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/payouts");
  }
}
