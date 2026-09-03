import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { ButtonLink } from "@/components/Button";
import { Countdown } from "@/components/Countdown";
import { boardWorth, listOpenBoards, openSpots } from "@/lib/boards";
import { clockOf, formatDateRange, weekdayOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Board } from "@/lib/sample";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Live auctions" };

const KIND: Record<Board["act"]["type"], (city: string) => string> = {
  touring_band: () => "Band, touring",
  house_act: (city) => `House act, ${city}`,
  soloist: (city) => `Solo, gigging ${city}`,
};

export default async function AuctionsPage() {
  const boards = await listOpenBoards();
  const count = boards.length === 1 ? "One board is" : `${boards.length} boards are`;

  return (
    <Page
      theme="magenta"
      current="/auctions"
      eyebrow="Open boards"
      title="Live"
      accent="auctions"
      intro={
        <p>
          Every open board on Door Money: who&apos;s playing, what the board is worth right now, and when bidding
          closes. {count} up this week.
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1120px] gap-[30px] px-7 pb-[90px] md:grid-cols-2">
        {boards.map((b) => {
          const gigs = b.run.kind === "season";
          return (
            <div key={b.act.slug} className="edge flex flex-col gap-3.5 bg-panel px-[26px] py-7 ">
              <div className="caps text-[14.5px] text-accent-ink">{KIND[b.act.type](b.act.city)}</div>
              <div className="display text-[clamp(28px,4vw,40px)] leading-[0.95]">{b.act.name}</div>
              <div className="caps text-[14.5px] leading-[1.7] text-muted">
                {b.run.title}. {b.run.showCount} {gigs ? "gigs" : "shows"}, {formatDateRange(b.run.startsOn, b.run.endsOn)}.
              </div>
              <div className="flex flex-wrap gap-[26px] border-t border-line pt-3.5">
                <Stat value={formatMoney(boardWorth(b))} label="board worth" />
                <Stat value={String(openSpots(b))} label="spots open" />
                {b.run.expectedAttendance ? (
                  <Stat value={`~${b.run.expectedAttendance.toLocaleString("en-US")}`} label="expected attendance" />
                ) : (
                  <Stat value={String(b.run.showCount)} label={gigs ? "gigs a season" : "shows on the run"} />
                )}
              </div>
              {b.run.biddingClosesAt && (
                <div className="caps text-[14.5px]">
                  Closes in <Countdown closesAt={b.run.biddingClosesAt} className="font-bold text-accent-ink" />, {weekdayOf(b.run.biddingClosesAt)}{" "}
                  {clockOf(b.run.biddingClosesAt)}
                </div>
              )}
              <ButtonLink href={`/board/${b.act.slug}`} className="self-start">See the board</ButtonLink>
            </div>
          );
        })}

        <div className="edge flex flex-col items-start justify-center gap-3.5 bg-panel px-[26px] py-7 text-ink ">
          <div className="caps text-[14.5px] text-accent-ink">Any act</div>
          <div className="display text-[clamp(28px,4vw,40px)] leading-[0.95]">The next board is open</div>
          <div className="text-[14.5px] leading-[1.7] text-muted">
            Bands, house acts, soloists. Musicians list the surfaces, set the prices, and keep the final say. {SITE.name}{" "}
            is opening in {SITE.city} first.
          </div>
          <ButtonLink href="/list" className="self-start">List an act</ButtonLink>
        </div>
      </div>
    </Page>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="display block text-[26px] leading-none">{value}</b>
      <span className="caps text-[14px] text-muted">{label}</span>
    </div>
  );
}
