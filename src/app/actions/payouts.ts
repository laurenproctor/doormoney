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
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, error: "Payout setup is unavailable right now. Try again shortly, or contact Door Money." };

  // Stripe will not take a board address it cannot reach, so the URL is left off in development.
  const boardUrl = SITE.url.startsWith("https://") ? `${SITE.url}/board/${act.slug}` : undefined;

  let accountId = act.stripe_account_id;
  if (!accountId) {
    let created;
    try {
      created = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: user.email ?? undefined,
        business_profile: { name: act.name, ...(boardUrl ? { url: boardUrl } : {}), product_description: "Sponsorship placements for a working musician" },
        capabilities: { transfers: { requested: true } },
        metadata: { act_id: act.id, slug: act.slug },
      });
    } catch (e) {
      console.error("connect account create failed", e instanceof Error ? e.message : e);
      return { ok: false, error: "Stripe could not open the account. Try once more." };
    }
    accountId = created.id;
    const sb = await supabaseServer();
    const { error } = await sb.from("acts").update({ stripe_account_id: accountId }).eq("id", act.id);
    if (error) return { ok: false, error: "That did not save. Try once more." };
  }

  // The link is short-lived and single use, so it is made fresh every time the act presses the button.
  let onboardingUrl: string;
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${SITE.url}/dashboard/payouts?refresh=1`,
      return_url: `${SITE.url}/dashboard/payouts?return=1`,
      type: "account_onboarding",
    });
    onboardingUrl = link.url;
  } catch (e) {
    console.error("connect account link failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Stripe could not open the setup page. Try once more." };
  }
  // Outside the try: redirect() signals by throwing, and must not be caught here.
  redirect(onboardingUrl);
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
