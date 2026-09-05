import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { ButtonLink } from "@/components/Button";
import { requireUser, currentProfile, ownedAct } from "@/lib/auth";
import { backedBy, type PlacedBid } from "@/lib/backed";
import { dashboardLinks } from "@/lib/roles";
import { formatMoney } from "@/lib/money";
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
  submitted: "Waiting on the musician",
  approved: "Approved",
  declined: "Declined and refunded",
};

const TIER: Record<string, string> = { thank_you: "Tour thank-you", merch_card: "Merch table card" };

/**
 * The patron's side of the house: what this account has put behind musicians.
 *
 * Every row here belongs to the signed-in account. The reads use the service role because
 * purchases, backings and bids have never been open to the browser, and the rows are filtered to
 * this account's patron ids before anything is shaped. See src/lib/backed.ts.
 */
export default async function PatronPage() {
  const user = await requireUser("/patron");
  const [profile, act] = await Promise.all([currentProfile(user.id), ownedAct(user.id)]);
  const backed = await backedBy(user.id, profile?.email ?? user.email);
  const name = profile?.display_name ?? "Patron";
  const nothing = backed.placements.length === 0 && backed.runs.length === 0 && backed.bids.length === 0;

  return (
    <DashboardShell
      current="/patron"
      links={dashboardLinks({ hasAct: Boolean(act), roles: profile?.roles ?? ["patron"] })}
      actName={act?.name ?? name}
      eyebrow="Backed by this account"
      title={name}
      accent=""
      intro={
        <p className="caps">
          {nothing ? "Nothing backed yet." : `${formatMoney(backed.totalCents)} behind ${countActs(backed)} so far.`}
        </p>
      }
    >
      {nothing ? (
        <Card className="max-w-[720px]">
          <CardHead eyebrow="Nothing here yet">Pick a board</CardHead>
          <p className="mb-6 max-w-none text-[15px] text-muted">
            Every placement and backing shows up here: what was paid, what the musician did with it, and the record at
            the end of the run. Bids sit here too, from the moment one is placed.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/auctions">See the live boards</ButtonLink>
            <ButtonLink href="/placements" variant="ghost">What a placement is</ButtonLink>
          </div>
        </Card>
      ) : (
        <div className="grid gap-[30px]">
          {backed.placements.length > 0 && (
            <Card>
              <CardHead eyebrow="Placements">
                {backed.placements.length} {backed.placements.length === 1 ? "spot taken" : "spots taken"}
              </CardHead>
              <ul className="divide-y divide-line border-y border-line">
                {backed.placements.map((p) => (
                  <li key={p.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline">
                    <div className="min-w-0">
                      <b className="block text-[15px]">
                        {p.lotName} on{" "}
                        <Link href={actPath(p.actSlug)} className="text-accent-ink underline decoration-1 underline-offset-4">
                          {p.actName}
                        </Link>
                      </b>
                      <span className="caps block text-[14px] text-muted">
                        {p.runTitle}. {p.wonAtAuction ? "Won at auction. " : ""}
                        {PAYMENT[p.paymentStatus] ?? p.paymentStatus}. {MARK[p.markStatus] ?? p.markStatus}.
                      </span>
                    </div>
                    <div className="flex items-baseline gap-5 sm:justify-end">
                      <span className="heading text-[20px]">{formatMoney(p.amountCents)}</span>
                      <Link href={`/record/${p.id}`} className="caps text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
                        The record
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {backed.runs.length > 0 && (
            <Card>
              <CardHead eyebrow="Backings">
                {backed.runs.length} {backed.runs.length === 1 ? "run backed" : "runs backed"}
              </CardHead>
              <ul className="divide-y divide-line border-y border-line">
                {backed.runs.map((r) => (
                  <li key={r.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline">
                    <div className="min-w-0">
                      <b className="block text-[15px]">
                        <Link href={actPath(r.actSlug)} className="text-accent-ink underline decoration-1 underline-offset-4">
                          {r.actName}
                        </Link>
                        , {r.runTitle}
                      </b>
                      <span className="caps block text-[14px] text-muted">
                        {TIER[r.tier] ?? r.tier}, as {r.displayName}. {PAYMENT[r.paymentStatus] ?? r.paymentStatus}.
                      </span>
                    </div>
                    <span className="heading text-[20px] sm:justify-self-end">{formatMoney(r.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {backed.bids.length > 0 && (
            <Card>
              <CardHead eyebrow="Bids">
                {backed.bids.length} {backed.bids.length === 1 ? "bid placed" : "bids placed"}
              </CardHead>
              <ul className="divide-y divide-line border-y border-line">
                {backed.bids.map((b) => (
                  <li key={b.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline">
                    <div className="min-w-0">
                      <b className="block text-[15px]">
                        {b.lotName} on{" "}
                        <Link href={actPath(b.actSlug)} className="text-accent-ink underline decoration-1 underline-offset-4">
                          {b.actName}
                        </Link>
                      </b>
                      <span className="caps block text-[14px] text-muted">
                        {OUTCOME[b.outcome]}
                        {b.outcome === "outbid" ? `, the top bid is ${formatMoney(b.topCents)}` : ""}
                        {b.anonymous ? ". Shown as an anonymous patron" : ""}.
                      </span>
                    </div>
                    <span className="heading text-[20px] sm:justify-self-end">{formatMoney(b.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Card className="mt-[30px] max-w-[720px]">
        <CardHead eyebrow="The public profile">A page of their own</CardHead>
        <p className="mb-6 max-w-none text-[15px] text-muted">
          A patron can keep a public page: a name, a few words, the music they turn up for, and whichever runs they
          choose to name. It starts private and stays private until it is published. No amount ever appears on it.
        </p>
        <ButtonLink href="/dashboard/profile" variant="ghost" arrow>
          The patron profile
        </ButtonLink>
      </Card>
    </DashboardShell>
  );
}

function countActs(backed: Awaited<ReturnType<typeof backedBy>>) {
  const acts = new Set([...backed.placements.map((p) => p.actSlug), ...backed.runs.map((r) => r.actSlug)]);
  return acts.size === 1 ? "one musician" : `${acts.size} musicians`;
}
