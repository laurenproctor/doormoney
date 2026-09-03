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
      current="/auctions"
      tape="Open boards"
      title="Live"
      accent="auctions"
      intro={
        <p>
          Every open board on Door Money: who&apos;s playing, what the board is worth right now, and when bidding
          closes. {count} up this week.
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1020px] gap-[30px] px-7 pb-[90px] md:grid-cols-2">
        {boards.map((b) => {
          const gigs = b.run.kind === "season";
          return (
            <div key={b.act.slug} className="hard-border flex flex-col gap-3.5 bg-white px-[26px] py-7 shadow-[8px_8px_0_var(--black)]">
              <div className="typewriter text-[14.5px] text-red-deep">{KIND[b.act.type](b.act.city)}</div>
              <div className="poster text-[clamp(28px,4vw,40px)] leading-[0.95]">{b.act.name}</div>
              <div className="typewriter text-[14.5px] leading-[1.7] text-gray">
                {b.run.title}. {b.run.showCount} {gigs ? "gigs" : "shows"}, {formatDateRange(b.run.startsOn, b.run.endsOn)}.
              </div>
              <div className="flex flex-wrap gap-[26px] border-t-2 border-dashed border-[#A79D8A] pt-3.5">
                <Stat value={formatMoney(boardWorth(b))} label="board worth" />
                <Stat value={String(openSpots(b))} label="spots open" />
                {b.run.expectedAttendance ? (
                  <Stat value={`~${b.run.expectedAttendance.toLocaleString("en-US")}`} label="expected attendance" />
                ) : (
                  <Stat value={String(b.run.showCount)} label={gigs ? "gigs a season" : "shows on the run"} />
                )}
              </div>
              {b.run.biddingClosesAt && (
                <div className="typewriter text-[14.5px]">
                  Closes in <Countdown closesAt={b.run.biddingClosesAt} className="font-bold text-red-deep" />, {weekdayOf(b.run.biddingClosesAt)}{" "}
                  {clockOf(b.run.biddingClosesAt)}
                </div>
              )}
              <ButtonLink href={`/board/${b.act.slug}`} className="self-start px-6! py-3! text-[17px]!">See the board</ButtonLink>
            </div>
          );
        })}

        <div className="hard-border flex flex-col items-start justify-center gap-3.5 bg-ink px-[26px] py-7 text-paper shadow-[8px_8px_0_var(--black)]">
          <div className="typewriter text-[14.5px] text-tape">Any act</div>
          <div className="poster text-[clamp(28px,4vw,40px)] leading-[0.95]">The next board is open</div>
          <div className="typewriter text-[14.5px] leading-[1.7] text-[#9B968A]">
            Bands, house acts, soloists. Musicians list the surfaces, set the prices, and keep the final say. {SITE.name}{" "}
            is opening in {SITE.city} first.
          </div>
          <ButtonLink href="/list" className="bg-tape! px-6! py-3! text-[17px]! text-ink!">List an act</ButtonLink>
        </div>
      </div>
    </Page>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="poster block text-[26px] leading-none">{value}</b>
      <span className="typewriter text-[14px] text-gray">{label}</span>
    </div>
  );
}
