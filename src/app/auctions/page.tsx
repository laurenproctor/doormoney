import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { ButtonLink } from "@/components/Button";
import { Countdown } from "@/components/Countdown";
import { NewsletterCTA } from "@/components/Newsletter";
import { boardWorth, listOpenBoards, openSpots } from "@/lib/boards";
import { clockOf, formatDateRange, weekdayOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Board } from "@/lib/sample";
import { runPath } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Fundraisers",
  description: "Every open fundraiser on Door Money: the musicians raising now, what has sold and been bid so far, and when bidding closes.",
};

// The route stays /auctions, because that address is already in sent email and in pasted widget
// snippets; decision 13 settled that an address outlives the words on the page. In copy this is
// Fundraisers, and not everything on it is an auction: each sponsorship is fixed price or open to
// bids, and the musician decides which. See docs/DECISIONS.md, decision 14.

/** What the shows are called, by the period being funded. Never "the run": decision 14. */
const PERIOD: Record<Board["run"]["kind"], string> = {
  tour: "shows on the tour",
  season: "gigs a season",
  residency: "nights of the residency",
};

const KIND: Record<Board["act"]["type"], (city: string) => string> = {
  touring_band: () => "Band, touring",
  house_act: (city) => `House act, ${city}`,
  soloist: (city) => `Soloist, gigging ${city}`,
};

export default async function AuctionsPage() {
  const boards = await listOpenBoards();
  const count = boards.length === 1 ? "One fundraiser is" : `${boards.length} fundraisers are`;

  return (
    <Page
      theme="magenta"
      current="/auctions"
      eyebrow="Musicians raising now"
      title="Open"
      accent="fundraisers"
      intro={
        <p>
          Every open fundraiser on Door Money: who&apos;s playing, what has sold and been bid so far, and when
          bidding closes. Each sponsorship is fixed price or open to bids; the musician decides which. {count} up
          this week.
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1120px] gap-[30px] px-7 pb-[90px] md:grid-cols-2">
        {boards.map((b) => {
          const gigs = b.run.kind === "season";
          return (
            <div key={b.act.slug} className="edge flex flex-col gap-3.5 bg-panel px-[26px] py-7 ">
              <div className="caps text-[14.5px] text-accent-ink">{KIND[b.act.type](b.act.city)}</div>
              <div className="heading text-[clamp(28px,4vw,40px)] leading-[0.95]">{b.act.name}</div>
              <div className="caps text-[14.5px] leading-[1.7] text-muted">
                {b.run.title}. {b.run.showCount} {gigs ? "gigs" : "shows"}, {formatDateRange(b.run.startsOn, b.run.endsOn)}.
              </div>
              <div className="flex flex-wrap gap-[26px] border-t border-line pt-3.5">
                <Stat value={formatMoney(boardWorth(b))} label="sold and current bids" />
                <Stat value={String(openSpots(b))} label="sponsorship options open" />
                {b.run.expectedAttendance ? (
                  <Stat value={`~${b.run.expectedAttendance.toLocaleString("en-US")}`} label="expected attendance" />
                ) : (
                  <Stat value={String(b.run.showCount)} label={PERIOD[b.run.kind]} />
                )}
              </div>
              {b.run.biddingClosesAt && (
                <div className="caps text-[14.5px]">
                  Closes in <Countdown closesAt={b.run.biddingClosesAt} className="font-bold text-accent-ink" />, {weekdayOf(b.run.biddingClosesAt)}{" "}
                  {clockOf(b.run.biddingClosesAt)}
                </div>
              )}
              <ButtonLink href={runPath(b.act.slug, b.run.slug)} className="self-start">See the fundraiser</ButtonLink>
            </div>
          );
        })}

        <div className="edge flex flex-col items-start justify-center gap-3.5 bg-panel px-[26px] py-7 text-ink ">
          <div className="caps text-[14.5px] text-accent-ink">Any musician</div>
          <div className="heading text-[clamp(28px,4vw,40px)] leading-[0.95]">The next fundraiser is open</div>
          <div className="text-[14.5px] leading-[1.7] text-muted">
            Bands, house acts, soloists. Musicians choose what they offer, set the prices and keep the final
            say.
          </div>
          <ButtonLink href="/list" className="self-start">List an act</ButtonLink>
        </div>
      </div>

      <NewsletterCTA source="auctions" eyebrow="The next fundraiser" />
    </Page>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="heading block text-[26px] leading-none">{value}</b>
      <span className="caps text-[14px] text-muted">{label}</span>
    </div>
  );
}
