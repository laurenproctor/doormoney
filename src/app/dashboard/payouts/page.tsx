import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { Lines } from "@/components/Brand";
import { PayoutButton } from "@/components/PayoutButton";
import { requireUser, ownedAct } from "@/lib/auth";
import { syncStripeStatus } from "@/app/actions/payouts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Payouts" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PayoutsPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard/payouts");
  const sp = await searchParams;
  if (sp.return === "1") await syncStripeStatus();
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

  const configured = Boolean(process.env.STRIPE_SECRET_KEY);
  const state = act.stripe_payouts_enabled ? "on" : act.stripe_account_id ? "partial" : "none";

  return (
    <DashboardShell
      current="/dashboard/payouts"
      actName={act.name}
      tape={state === "on" ? "Payouts on" : "Not yet paid out"}
      title="Getting"
      accent="paid"
      intro={<p>Door Money holds every payment and pays the act every Friday through the run. Stripe handles the bank details and the tax forms.</p>}
    >
      <div className="grid gap-[30px] md:grid-cols-[1fr_1fr]">
        <Card>
          <CardHead eyebrow="Stripe">{state === "on" ? "Connected" : state === "partial" ? "Almost there" : "Not connected"}</CardHead>
          <p className="mb-6 max-w-none text-[15px] text-gray">
            {state === "on"
              ? "Bank details are in and payouts are on. Door Money sends each Friday's slice automatically."
              : state === "partial"
                ? "The Stripe account exists but is missing something, usually a bank account or an ID check. Pick up where it left off."
                : configured
                  ? "A few minutes with Stripe: a bank account, a name, and an ID check. The act keeps 85% of every placement."
                  : "Payout setup is not open yet. Door Money will email listed acts the day it is. Boards and prices can be set up now."}
          </p>
          {state !== "on" && <PayoutButton configured={configured} label={state === "partial" ? "Finish Stripe setup" : "Set up payouts with Stripe"} />}
          {state === "on" && <PayoutButton configured={configured} label="Update bank details" ghost />}
        </Card>
        <div>
          <h3 className="typewriter mb-3 text-[15px] text-red">How the money moves</h3>
          <Lines
            lines={[
              "A patron pays when they take a spot. Door Money holds it.",
              "Each Friday through the run, a slice moves to the act.",
              `Door Money keeps ${SITE.feePercent}%. The act keeps the rest.`,
              "If the run is cancelled, patrons get the remainder back.",
            ]}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
