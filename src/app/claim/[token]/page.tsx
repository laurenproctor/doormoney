import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/Page";
import { Section, SectionHead } from "@/components/Brand";
import { Countdown } from "@/components/Countdown";
import { LotCheckout } from "@/components/LotCheckout";
import { loadOfferPolicy, policyStatements } from "@/lib/offer-policy";
import { offerTermsFingerprint, offerTermsView, storedOfferTerms } from "@/lib/offer-terms";
import { themeFor } from "@/components/Theme";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { periodOf } from "@/lib/periods";
import { lotName } from "@/lib/purchases";
import { checkoutTerms, recordWords } from "@/lib/record-words";
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
  price_cents: number;
  /** The offer contract, frozen since the first bid. Read here, never from the browser. */
  offer_terms: unknown;
  exclusive: boolean | null;
  reach_estimate: number | null;
  reach_basis: string | null;
  runs: { title: string; category_key: string | null; kind: string | null; starts_on: string | null; ends_on: string | null; show_count: number | null; acts: { slug: string; name: string; city: string | null } };
};

export default async function ClaimPage({ params }: Props) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("lots")
    .select("id,label,surface_key,status,funding_deadline,winner_bid_id,price_cents,offer_terms,exclusive,reach_estimate,reach_basis,runs!inner(title,category_key,kind,starts_on,ends_on,show_count,acts!inner(slug,name,city))")
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
  // Music keeps its period by name and its show count. Nobody else has either, and nobody is given one.
  const words = recordWords(run.category_key, run.kind);
  const period = periodOf(run.kind);
  const count = words.music && run.show_count !== null ? `${run.show_count} ${run.show_count === 1 ? period.unit : period.units}` : null;
  const dates = run.starts_on && run.ends_on ? formatDateRange(run.starts_on, run.ends_on) : null;
  // The offer the winner bid on, read from the lot and shown before they pay. Once a bid exists the
  // terms are frozen (migration 0035, widened in 0056), so this is what they bid against.
  const terms = offerTermsView(storedOfferTerms(lot), { reach_estimate: lot.reach_estimate, reach_basis: lot.reach_basis });
  const deliveryTerms = policyStatements(await loadOfferPolicy(sb, run.category_key));

  return (
    <Page
      theme={themeFor(act.slug)}
      current="/fundraisers"
      eyebrow={paid ? "Paid" : expired ? "The window closed" : "Won at auction"}
      title={name}
      accent=""
      strap={`${act.name}. ${run.title}.`}
      headline="md"
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {act.name}. {[run.title, count, dates].filter(Boolean).join(", ")}.
          </p>
          {paid ? (
            <p className="mt-5">This sponsorship is paid for and held for the whole {words.periodNoun}. A record of it went out by email.</p>
          ) : expired ? (
            <p className="mt-5">The 48 hours ran out, so the {name.toLowerCase()} went to the next bid. Nothing was charged.</p>
          ) : (
            <>
              <p className="mt-5">
                The top bid at the close was <b>{formatMoney(amountCents)}</b>. Putting the money up now takes the sponsorship for the whole {words.periodNoun}.
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
          <SectionHead eyebrow="The money">{words.music ? "Door Money holds it and pays weekly" : "Door Money holds it until delivery is documented"}</SectionHead>
          <p className="text-muted">
            The whole amount is charged now. {checkoutTerms(words, act.name)} If the {words.periodNoun} is cancelled, the share not yet released is refunded.
          </p>
          <div className="mt-8">
            <LotCheckout
              lotId={lot.id}
              lotName={name.toLowerCase()}
              priceLabel={formatMoney(amountCents)}
              token={token}
              terms={checkoutTerms(words, act.name)}
              offerTerms={terms}
              offerPolicy={deliveryTerms}
              termsFingerprint={offerTermsFingerprint(storedOfferTerms(lot), lot.price_cents)}
              onClose={null}
            />
          </div>
        </Section>
      )}
    </Page>
  );
}
