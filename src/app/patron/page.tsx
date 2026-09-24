import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/desk";
import { requireUser, currentProfile, ownedAct } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { backedBy, type PlacedBid } from "@/lib/backed";
import { loadFundraiserJumps } from "@/lib/dashboard-home";
import { dashboardNav } from "@/lib/dashboardModel";
import { formatMoney } from "@/lib/money";
import { ownProfile } from "@/lib/patronprofile";
import { profileTheme } from "@/lib/profile";
import { actPath } from "@/lib/urls";

export const metadata: Metadata = { title: "What you have backed", robots: { index: false, follow: false } };

const OUTCOME: Record<PlacedBid["outcome"], string> = {
  leading: "The one to beat",
  outbid: "Outbid",
  won: "Won",
  passed: "Let go",
  closed: "Bidding closed",
};

const PAYMENT: Record<string, string> = {
  requires_payment: "Not paid yet",
  held: "Held by Door Money",
  released: "Paid out in full",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

const MARK: Record<string, string> = {
  none: "No mark sent yet",
  submitted: "Waiting on the organizer",
  approved: "Approved",
  declined: "Declined and refunded",
};

const TIER: Record<string, string> = { thank_you: "Tour thank-you", merch_card: "Merch table card" };

/**
 * The patron's side of the house: what this account has put behind fundraisers, in any category.
 *
 * Every row here belongs to the signed-in account. The reads use the service role because
 * purchases, backings and bids have never been open to the browser, and the rows are filtered to
 * this account's patron ids before anything is shaped. See src/lib/backed.ts.
 */
export default async function PatronPage() {
  const user = await requireUser("/patron");
  const [profile, act, own] = await Promise.all([currentProfile(user.id), ownedAct(user.id), ownProfile(user.id)]);
  const [backed, jumps] = await Promise.all([backedBy(user.id, profile?.email ?? user.email), loadFundraiserJumps(act?.id ?? null)]);
  const name = fullName(profile) ?? "Patron";
  const nothing = backed.placements.length === 0 && backed.runs.length === 0 && backed.bids.length === 0;

  return (
    <DashboardShell
      current="/patron"
      nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? ["patron"] })}
      actName={act?.name}
      identity={fullName(profile)}
      theme={profileTheme(own?.theme)}
      eyebrow="Backed by this account"
      title={name}
      accent=""
      intro={
        <p className="max-w-[52ch] text-[19px] leading-[1.35] text-ink">
          {nothing ? "Nothing backed yet." : `${formatMoney(backed.totalCents)} behind ${countActs(backed)} so far.`}
        </p>
      }
      search={jumps}
    >
      {nothing ? (
        <Card title="Pick a fundraiser" subtitle="Nothing here yet" className="max-w-[720px]">
          <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
            Every sponsorship and backing shows up here: what you paid, what the organizer did with it, and the
            record at the end of the fundraiser. Bids sit here too, from the moment you place one.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/fundraisers" register="desk" variant="solid">Browse projects to sponsor</ButtonLink>
            <ButtonLink href="/how-sponsorship-works" register="desk" variant="outline">How sponsorship works</ButtonLink>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3.5">
          {backed.placements.length > 0 && (
            <Card searchable title={`${backed.placements.length} ${backed.placements.length === 1 ? "spot taken" : "spots taken"}`} subtitle="Sponsorships">
              <ul className="m-0 flex list-none flex-col p-0">
                {backed.placements.map((p) => (
                  <li key={p.id} data-search={`${p.lotName} ${p.actName} ${p.runTitle}`} className="grid gap-2 border-t border-line py-3 sm:grid-cols-[1fr_auto] sm:items-baseline">
                    <div className="min-w-0">
                      <b className="block text-[15px]">
                        {p.lotName} on{" "}
                        <Link href={actPath(p.actSlug)} className="text-accent-ink underline decoration-1 underline-offset-4">
                          {p.actName}
                        </Link>
                      </b>
                      <span className="block text-[14px] leading-[1.6] text-muted">
                        {p.runTitle}. {p.wonAtAuction ? "Won at auction. " : ""}
                        {PAYMENT[p.paymentStatus] ?? p.paymentStatus}. {MARK[p.markStatus] ?? p.markStatus}.
                      </span>
                    </div>
                    <div className="flex items-baseline gap-5 sm:justify-end">
                      <span className="heading text-[18px] tabular-nums">{formatMoney(p.amountCents)}</span>
                      <Link href={`/record/${p.id}`} className="text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
                        The record
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {backed.runs.length > 0 && (
            <Card searchable title={`${backed.runs.length} ${backed.runs.length === 1 ? "fundraiser backed" : "fundraisers backed"}`} subtitle="Backings">
              <ul className="m-0 flex list-none flex-col p-0">
                {backed.runs.map((r) => (
                  <li key={r.id} data-search={`${r.actName} ${r.runTitle}`} className="grid gap-2 border-t border-line py-3 sm:grid-cols-[1fr_auto] sm:items-baseline">
                    <div className="min-w-0">
                      <b className="block text-[15px]">
                        <Link href={actPath(r.actSlug)} className="text-accent-ink underline decoration-1 underline-offset-4">
                          {r.actName}
                        </Link>
                        , {r.runTitle}
                      </b>
                      <span className="block text-[14px] leading-[1.6] text-muted">
                        {TIER[r.tier] ?? r.tier}, as {r.displayName}. {PAYMENT[r.paymentStatus] ?? r.paymentStatus}.
                      </span>
                    </div>
                    <span className="heading text-[18px] tabular-nums sm:justify-self-end">{formatMoney(r.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {backed.bids.length > 0 && (
            <Card searchable title={`${backed.bids.length} ${backed.bids.length === 1 ? "bid placed" : "bids placed"}`} subtitle="Bids">
              <ul className="m-0 flex list-none flex-col p-0">
                {backed.bids.map((b) => (
                  <li key={b.id} data-search={`${b.lotName} ${b.actName}`} className="grid gap-2 border-t border-line py-3 sm:grid-cols-[1fr_auto] sm:items-baseline">
                    <div className="min-w-0">
                      <b className="block text-[15px]">
                        {b.lotName} on{" "}
                        <Link href={actPath(b.actSlug)} className="text-accent-ink underline decoration-1 underline-offset-4">
                          {b.actName}
                        </Link>
                      </b>
                      <span className="block text-[14px] leading-[1.6] text-muted">
                        {OUTCOME[b.outcome]}
                        {b.outcome === "outbid" ? `, the top bid is ${formatMoney(b.topCents)}` : ""}
                        {b.anonymous ? ". Shown as an anonymous patron" : ""}.
                      </span>
                    </div>
                    <span className="heading text-[18px] tabular-nums sm:justify-self-end">{formatMoney(b.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Card title="A page of your own" subtitle="The public profile" className="mt-3.5 max-w-[720px]">
        <p className="max-w-[60ch] text-[15px] leading-[1.6] text-muted">
          You can keep a public page: a name, a few words, the categories you support, and whichever fundraisers
          you choose to name. It starts private and stays private until you publish it. No amount ever appears on it.
        </p>
        <div>
          <ButtonLink href="/dashboard/profile" register="desk" variant="outline">
            The patron profile
          </ButtonLink>
        </div>
      </Card>
    </DashboardShell>
  );
}

function countActs(backed: Awaited<ReturnType<typeof backedBy>>) {
  const acts = new Set([...backed.placements.map((p) => p.actSlug), ...backed.runs.map((r) => r.actSlug)]);
  return acts.size === 1 ? "one organizer" : `${acts.size} organizers`;
}
