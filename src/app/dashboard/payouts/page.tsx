import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { Lines } from "@/components/Brand";
import { PayoutButton } from "@/components/PayoutButton";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardNav } from "@/lib/dashboardModel";
import { syncStripeStatus } from "@/app/actions/payouts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Payouts" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PayoutsPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard/payouts");
  const sp = await searchParams;
  if (sp.return === "1") await syncStripeStatus();
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  if (!act) redirect("/dashboard/act/new");

  const configured = Boolean(process.env.STRIPE_SECRET_KEY);
  const state = act.stripe_payouts_enabled ? "on" : act.stripe_account_id ? "partial" : "none";

  return (
    <DashboardShell
      current="/dashboard/payouts"
      nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })}
      actName={act.name}
      actSlug={act.slug}
      identity={fullName(profile)}
      eyebrow={state === "on" ? "Payouts on" : "Not yet paid out"}
      title="Getting"
      accent="paid"
      intro={<p>Door Money holds every payment and releases your share under each fundraiser&apos;s terms. Stripe handles the bank details and the tax forms.</p>}
    >
      <div className="grid gap-[30px] md:grid-cols-[1fr_1fr]">
        <Card>
          <CardHead eyebrow="Stripe">{state === "on" ? "Connected" : state === "partial" ? "Almost there" : "Not connected"}</CardHead>
          <p className="mb-6 max-w-none text-[15px] text-muted">
            {state === "on"
              ? "Bank details are in and payouts are on. Each release is sent automatically."
              : state === "partial"
                ? "The Stripe account exists but is missing something, usually a bank account or an ID check. Pick up where it left off."
                : configured
                  ? "A few minutes with Stripe: a bank account, a name, and an ID check. You keep 85% of every sponsorship."
                  : "Payout setup is unavailable right now. You can still set up fundraisers and prices. Tell Door Money if it stays that way."}
          </p>
          {state !== "on" && <PayoutButton configured={configured} label={state === "partial" ? "Finish Stripe setup" : "Set up payouts with Stripe"} />}
          {state === "on" && <PayoutButton configured={configured} label="Update bank details" ghost />}
        </Card>
        <div>
          <h2 className="caps mb-3 text-[15px] text-accent-ink">How the money moves</h2>
          <Lines
            lines={[
              "A sponsor pays when they buy an option. Door Money holds it.",
              "Music fundraisers release a slice every Friday across their dates. Every other category releases one deliverable at a time, as you document it.",
              `Door Money keeps ${SITE.feePercent}%. You keep the rest.`,
              "If the fundraiser is cancelled, sponsors get the remainder back.",
            ]}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
