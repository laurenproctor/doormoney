import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { ButtonLink } from "@/components/Button";
import { Countdown } from "@/components/Countdown";
import { NewsletterCTA } from "@/components/Newsletter";
import { boardWorth, listOpenBoards, openSpots } from "@/lib/boards";
import { clockOf, weekdayOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { fundraiserLine, periodOf } from "@/lib/periods";
import { organizerLabel } from "@/lib/categories";
import { getCategoryLabels } from "@/lib/category-registry";
import { CategoryBadge } from "@/components/domain";
import { AVAILABILITY_NOTE } from "@/lib/starting-categories";
import { runPath } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Fundraisers",
  description: "Every open fundraiser on Door Money: the organizers raising now, what each one funds, and the sponsorship options still open.",
};

// The route stays /auctions, because that address is already in sent email and in pasted widget
// snippets; decision 13 settled that an address outlives the words on the page. In copy this is
// Fundraisers, and not everything on it is an auction: each sponsorship is fixed price or open to
// bids, and the organizer decides which. See docs/DECISIONS.md, decisions 14 and 17. A card names its
// fundraiser's own category, from the registry, so this page never assumes whose work it is showing.



export default async function AuctionsPage() {
  const [boards, labels] = await Promise.all([listOpenBoards(), getCategoryLabels()]);
  const count = boards.length === 1 ? "One fundraiser is" : `${boards.length} fundraisers are`;

  return (
    <Page
      theme="magenta"
      current="/auctions"
      eyebrow="Organizers raising now"
      title="Open"
      accent="fundraisers"
      intro={
        <p>
          Every open fundraiser on Door Money: who is raising, what the funding is for, and which sponsorship
          options are still open. Each sponsorship is either fixed-price or open to bids; the organizer decides
          which. {count} open now.
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1120px] gap-[30px] px-7 pb-[90px] md:grid-cols-2">
        {boards.map((b) => {
          return (
            <div key={b.act.slug} className="edge flex flex-col gap-3.5 bg-panel px-[26px] py-7 ">
              <CategoryBadge category={{ key: b.run.categoryKey, label: labels[b.run.categoryKey] }} className="self-start" />
              <div className="caps text-[14.5px] text-accent-ink">{organizerLabel(b.run.categoryKey, b.act.type, b.act.city)}</div>
              <div className="heading text-[clamp(28px,4vw,40px)] leading-[0.95]">{b.act.name}</div>
              <div className="caps text-[14.5px] leading-[1.7] text-muted">
                {fundraiserLine(b.run)}
              </div>
              <div className="flex flex-wrap gap-[26px] border-t border-line pt-3.5">
                <Stat value={formatMoney(boardWorth(b))} label="sold and current bids" />
                <Stat value={String(openSpots(b))} label="sponsorship options open" />
                {b.run.expectedAttendance ? (
                  <Stat value={`~${b.run.expectedAttendance.toLocaleString("en-US")}`} label="expected attendance" />
                ) : b.run.categoryKey === "music" && b.run.showCount !== null ? (
                  <Stat value={String(b.run.showCount)} label={periodOf(b.run.kind).counted} />
                ) : null}
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
          <div className="caps text-[14.5px] text-accent-ink">For organizers</div>
          <div className="heading text-[clamp(28px,4vw,40px)] leading-[0.95]">The next fundraiser is open</div>
          <div className="text-[14.5px] leading-[1.7] text-muted">
            Organizers choose what they offer, set the prices and keep the final say. {AVAILABILITY_NOTE}
          </div>
          <ButtonLink href="/list" className="self-start">Create a fundraiser</ButtonLink>
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
