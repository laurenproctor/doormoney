import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Lines } from "@/components/Brand";
import { HeroArt } from "@/components/HeroArt";
import { Theme, themeFor } from "@/components/Theme";
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

  // Every act gets its own colour of light, the same one every time.
  const theme = themeFor(slug);
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
    <Theme name={theme}>
      <Nav current="/auctions" />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <HeroArt theme={theme} />
          <div className="relative mx-auto max-w-[1120px] px-7 pb-10 pt-[72px]">
            <Eyebrow className="mb-7">Live board</Eyebrow>
            <h1 className={`display max-w-[14ch] leading-[0.98] ${act.name.length > 14 ? "text-[clamp(40px,7vw,92px)]" : "text-[clamp(48px,8.4vw,108px)]"}`}>{act.name}</h1>
            <p className="caps mt-6 text-[14.5px] leading-[2]">
              {run.title}. {run.showCount} {unit}, {formatDateRange(run.startsOn, run.endsOn)}. {act.city}.
            </p>
            {act.bio && <p className="mt-6 max-w-[58ch] border-l border-accent/60 pl-5 text-[16px] text-muted">{act.bio}</p>}
            <div className="mt-8 flex flex-wrap gap-x-12 gap-y-6">
              {facts.map(([value, label]) => (
                <div key={label}>
                  <b className="heading block text-[clamp(28px,4vw,40px)] leading-none">{value}</b>
                  <span className="caps mt-1.5 block text-[14px] text-muted">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-[1120px] px-7">
          <BoardLots lots={lots} closesAt={closesAt} closesLabel={closesLabel} heading={season ? "Bid on the season" : "Bid on the run"} />
        </div>

        {showBackers && <RosieBackers />}

        <div className="border-t border-line py-16">
          <div className="mx-auto max-w-[1120px] px-7">
            <Eyebrow className="mb-5">If a bid wins</Eyebrow>
            <h2 className="heading mb-8 text-[clamp(28px,4vw,46px)] leading-[1.02]">What happens after {closeDay ?? "the close"}</h2>
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
    </Theme>
  );
}
