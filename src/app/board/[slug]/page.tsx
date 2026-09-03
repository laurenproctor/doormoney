import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Lines, Tape } from "@/components/Brand";
import { getBoard, openSpots } from "@/lib/boards";
import { CATALOG } from "@/lib/catalog";
import { clockOf, formatDateRange, weekdayOf } from "@/lib/dates";
import { bidStepCents } from "@/lib/money";
import { BoardLots, type LotView } from "./BoardLots";
import { BACKERS_DISCLAIMER, RosieBackers } from "./backers";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoard(slug);
  if (!board || !board.run) return { title: "Board" };
  const description = `${board.act.name}, ${board.run.title}. ${board.run.showCount} ${board.run.kind === "season" ? "gigs" : "shows"} in ${board.act.city}. Patrons put money behind the run on Door Money.`;
  return {
    title: `${board.act.name}, live board`,
    description,
    openGraph: { title: `${board.act.name} on Door Money`, description, type: "website", ...(board.act.photoUrl ? { images: [{ url: board.act.photoUrl }] } : {}) },
    twitter: { card: board.act.photoUrl ? "summary_large_image" : "summary", title: `${board.act.name} on Door Money`, description },
  };
}

/** First sentence of a blurb, for the one-line note under a lot name. */
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

export default async function BoardPage({ params }: Props) {
  const { slug } = await params;
  const board = await getBoard(slug);
  if (!board || !board.run) notFound();
  const { act, run } = board;

  const season = run.kind === "season";
  const unit = season ? "gigs" : "shows";
  const noun = act.type === "soloist" ? "The act" : "The band";
  const auction = board.lots.some((l) => l.mode === "auction");
  const closesAt = run.biddingClosesAt;
  const closeDay = closesAt ? weekdayOf(closesAt) : null;
  const closesLabel = closesAt ? `${auction ? "auction" : "listing"} closes ${closeDay}, ${clockOf(closesAt)}` : "no close time set";
  const showBackers = slug === "rosie-bassoon";

  const lots: LotView[] = board.lots.map((l) => {
    const s = CATALOG.find((c) => c.key === l.surfaceKey);
    return {
      id: l.id,
      name: l.label ?? s?.name ?? l.surfaceKey,
      note: s ? `${firstSentence(s.blurb)} Shows up: ${s.seenBy}.` : "",
      mode: l.mode,
      sold: l.status === "sold",
      priceCents: l.priceCents,
      bidCents: l.topBid?.amountCents ?? null,
      bidder: l.status === "sold" ? (l.soldTo ?? "a patron") : (l.topBid?.patronName ?? null),
      anonymous: l.topBid?.anonymous ?? false,
      stepCents: bidStepCents(l.priceCents),
    };
  });

  const facts: [string, string][] = [
    [String(run.showCount), season ? "gigs a season" : "shows on the run"],
    ...(run.expectedAttendance ? [[`~${run.expectedAttendance.toLocaleString("en-US")}`, "expected attendance"] as [string, string]] : []),
    [String(openSpots(board)), "spots still open"],
  ];

  return (
    <>
      <Nav current="/auctions" />
      <main id="main">
      <div className="mx-auto max-w-[1020px] px-7 pt-[66px]">
        <div className="mb-[26px]">
          <Tape>Live board</Tape>
        </div>
        <h1 className={`poster leading-[0.88] ${act.name.length > 14 ? "text-[clamp(42px,8.4vw,100px)]" : "text-[clamp(52px,10vw,120px)]"}`}>{act.name}</h1>
        <p className="typewriter mt-[18px] text-[clamp(15px,2.2vw,19px)]">
          {run.title}. {run.showCount} {unit}, {formatDateRange(run.startsOn, run.endsOn)}. {act.city}.
        </p>
        {act.bio && <p className="mt-[22px] max-w-[58ch] border-l-[3px] border-ink pl-[18px] text-[16px]">{act.bio}</p>}
        <div className="mt-[26px] flex flex-wrap gap-[30px]">
          {facts.map(([value, label]) => (
            <div key={label}>
              <b className="poster block text-[clamp(24px,3.4vw,34px)] leading-none">{value}</b>
              <span className="typewriter text-[14px] text-gray">{label}</span>
            </div>
          ))}
        </div>
        <BoardLots lots={lots} closesAt={closesAt} closesLabel={closesLabel} heading={season ? "Bid on the season" : "Bid on the run"} />
      </div>

      {showBackers && <RosieBackers />}

      <div className="border-t-[3px] border-ink py-14">
        <div className="mx-auto max-w-[1020px] px-7">
          <p className="typewriter mb-3 text-[15px] text-red-deep">If a bid wins</p>
          <h2 className="poster mb-6 text-[clamp(28px,4vw,44px)] leading-none">What happens after {closeDay ?? "the close"}</h2>
          <Lines
            marked
            lines={[
              "The winning patron puts the money up within 48 hours, or the spot goes to the next bid.",
              `${noun} approves the mark. Nothing goes up without their yes.`,
              `${noun} plays the ${season ? "season" : "run"} it was already playing.`,
              `The money reaches ${noun.toLowerCase()} week by week as the ${season ? "season" : "run"} goes on.`,
              season
                ? "End of season: a record of every gig the placement ran at."
                : "End of the run, the patron gets a record of it: every show, every room, the attendance count.",
            ]}
          />
        </div>
      </div>
      </main>

      <Footer note={showBackers ? BACKERS_DISCLAIMER : undefined} />
    </>
  );
}
