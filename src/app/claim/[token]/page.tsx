import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/Page";
import { Section, SectionHead } from "@/components/Brand";
import { Countdown } from "@/components/Countdown";
import { LotCheckout } from "@/components/LotCheckout";
import { themeFor } from "@/components/Theme";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { lotName } from "@/lib/purchases";
import { supabaseAdmin } from "@/lib/supabase/server";

/*
  Where a winning bidder puts the money up. The token is the private one from their email, so the
  page is not guessable and needs no sign-in. It expires with the 48 hours; after that the auction
  job hands the lot to the next bid and this page says so.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Put the money up", robots: { index: false, follow: false } };

type Row = {
  id: string;
  label: string | null;
  surface_key: string;
  status: string;
  funding_deadline: string | null;
  winner_bid_id: string | null;
  runs: { title: string; kind: string; starts_on: string; ends_on: string; show_count: number; acts: { slug: string; name: string; city: string } };
};

export default async function ClaimPage({ params }: Props) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("lots")
    .select("id,label,surface_key,status,funding_deadline,winner_bid_id,runs!inner(title,kind,starts_on,ends_on,show_count,acts!inner(slug,name,city))")
    .eq("funding_token", token)
    .maybeSingle();
  const lot = data as unknown as Row | null;
  if (!lot) notFound();

  const run = lot.runs;
  const act = run.acts;
  const name = lotName(lot);
  const { data: bid } = lot.winner_bid_id ? await sb.from("bids").select("amount_cents").eq("id", lot.winner_bid_id).maybeSingle() : { data: null };
  const amountCents = (bid?.amount_cents as number | undefined) ?? 0;
  const expired = Boolean(lot.funding_deadline && new Date(lot.funding_deadline) < new Date());
  const paid = lot.status === "sold";
  const season = run.kind === "season";

  return (
    <Page
      theme={themeFor(act.slug)}
      current="/auctions"
      eyebrow={paid ? "Paid" : expired ? "The window closed" : "Won at auction"}
      title={name}
      accent=""
      strap={`${act.name}. ${run.title}.`}
      headline="md"
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {act.name}. {run.title}, {run.show_count} {season ? "gigs" : "shows"}, {formatDateRange(run.starts_on, run.ends_on)}.
          </p>
          {paid ? (
            <p className="mt-5">This spot is paid for and held for the {season ? "season" : "run"}. A record of it went out by email.</p>
          ) : expired ? (
            <p className="mt-5">The 48 hours ran out, so the {name.toLowerCase()} went to the next bid. Nothing was charged.</p>
          ) : (
            <>
              <p className="mt-5">
                The top bid at the close was <b>{formatMoney(amountCents)}</b>. Putting the money up now takes the spot for the whole {season ? "season" : "run"}.
              </p>
              {lot.funding_deadline && (
                <p className="caps mt-6 text-[14.5px] text-accent-ink">
                  <Countdown closesAt={lot.funding_deadline} /> left
                </p>
              )}
            </>
          )}
        </>
      }
    >
      {!paid && !expired && (
        <Section>
          <SectionHead eyebrow="The money">Door Money holds it and pays weekly</SectionHead>
          <p className="text-muted">
            The whole amount is charged now. It sits with Door Money and reaches {act.name} in equal slices every Friday through the {season ? "season" : "run"}. {act.name} approves the
            mark before it goes on anything, and a cancelled run is refunded.
          </p>
          <div className="mt-8">
            <LotCheckout lotId={lot.id} lotName={name.toLowerCase()} priceLabel={formatMoney(amountCents)} token={token} onClose={null} />
          </div>
        </Section>
      )}
    </Page>
  );
}
