import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Lines } from "@/components/Brand";
import { HeroArt } from "@/components/HeroArt";
import { NewsletterCTA } from "@/components/Newsletter";
import { Theme, themeFor } from "@/components/Theme";
import { WidgetFrame } from "@/components/WidgetFrame";
import { getBoard, openSpots } from "@/lib/boards";
import { CATALOG } from "@/lib/catalog";
import { clockOf, formatDateRange, weekdayOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buyNowOpen, closeTimeOf, minimumBidCents, settleDueLots } from "@/lib/auctions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { BoardLots, type LotView } from "./BoardLots";
import { BACKERS_DISCLAIMER, RosieBackers } from "./backers";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

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

/** Whether anything on this board is past its moment: bidding over, or a funding window run out. */
async function hasOverdueLot(board: NonNullable<Awaited<ReturnType<typeof getBoard>>>) {
  const nowIso = new Date().toISOString();
  const closes = board.run?.biddingClosesAt ?? null;
  const overdueBidding = board.lots.some((l) => {
    if (l.mode !== "auction" || l.status !== "open") return false;
    const at = closeTimeOf({ closes_at: l.closesAt ?? null }, { bidding_closes_at: closes });
    return at !== null && at <= nowIso;
  });
  if (overdueBidding) return true;
  // A funding deadline is not on the public board, so ask for the ones that matter.
  const waiting = board.lots.filter((l) => l.mode === "auction" && l.status === "pending_funding").map((l) => l.id);
  if (!waiting.length) return false;
  const { data } = await supabaseAdmin().from("lots").select("id").in("id", waiting).lt("funding_deadline", nowIso).limit(1);
  return Boolean(data?.length);
}

/** "an 18-show run", "a 32-gig season". */
const article = (n: number) => (/^(8|11$|18$|8\d)/.test(String(n)) ? "an" : "a");
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

/** What the patron sees back on the board after Stripe's embedded checkout sends them here. */
async function paidNotice(sessionId: string | undefined, slug: string) {
  if (!sessionId || !sessionId.startsWith("cs_") || !stripeConfigured()) return null;
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.metadata?.act_slug !== slug) return null;
    const email = s.customer_details?.email ?? null;
    if (s.status === "complete" && s.payment_status !== "unpaid") return { kind: "paid" as const, amount: s.amount_total ?? 0, email };
    if (s.status === "complete") return { kind: "processing" as const, amount: s.amount_total ?? 0, email };
    return null;
  } catch {
    return null;
  }
}

export default async function BoardPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  let board = await getBoard(slug);
  if (!board || !board.run) notFound();

  // An auction that has run out of time settles here rather than waiting for the next cron pass.
  // Both writes are conditional on the state they expect, so two readers at once cannot double up.
  if (await hasOverdueLot(board)) {
    await settleDueLots(supabaseAdmin());
    board = (await getBoard(slug)) ?? board;
  }
  const { act, run } = board;
  const paid = await paidNotice(typeof sp.paid === "string" ? sp.paid : undefined, slug);

  // Every act gets its own colour of light, the same one every time.
  const theme = themeFor(slug);
  const season = run.kind === "season";
  const unit = season ? "gigs" : "shows";
  const noun = act.type === "soloist" ? "The musician" : "The band";
  const auction = board.lots.some((l) => l.mode === "auction");
  const closesAt = run.biddingClosesAt;
  const closeDay = closesAt ? weekdayOf(closesAt) : null;
  const closesLabel = closesAt ? `${auction ? "bidding" : "listing"} closes ${closeDay}, ${clockOf(closesAt)}` : "no close time set";
  // The commercial context first, from the run data; the bio's personality follows it.
  const plural = act.type !== "soloist";
  const lead = season
    ? `${act.name} is playing ${article(run.showCount)} ${run.showCount}-gig ${run.title.toLowerCase()}, ${formatDateRange(run.startsOn, run.endsOn)}, carrying the same case and stand into every room.`
    : `${act.name} ${plural ? "are" : "is"} taking ${article(run.showCount)} ${run.showCount}-show ${run.title.toLowerCase()}, ${formatDateRange(run.startsOn, run.endsOn)}${
        run.expectedAttendance ? `, putting roughly ${run.expectedAttendance.toLocaleString("en-US")} people in front of the same stage setup` : ""
      }.`;
  const showBackers = slug === "rosie-bassoon";
  const backers = board.backers ?? [];

  const nowIso = new Date().toISOString();
  const lots: LotView[] = board.lots.map((l) => {
    const s = CATALOG.find((c) => c.key === l.surfaceKey);
    const lotCloses = l.closesAt ?? closesAt ?? null;
    return {
      id: l.id,
      name: l.label ?? s?.name ?? l.surfaceKey,
      note: s ? `${firstSentence(s.blurb)} Shows up: ${s.seenBy}.` : "",
      mode: l.mode,
      sold: l.status === "sold",
      soldCents: l.soldCents ?? null,
      wonAtAuction: l.wonAtAuction ?? false,
      pending: l.status === "pending_funding",
      awaitingFunding: l.mode === "auction" && l.status === "pending_funding",
      closed: l.mode === "auction" && (l.status !== "open" || Boolean(lotCloses && lotCloses <= nowIso)),
      priceCents: l.priceCents,
      bidCents: l.topBid?.amountCents ?? null,
      // A patron who bid anonymously stays anonymous on the board after they win. The act sees the
      // name on the dashboard, and the mark itself is not anonymous by definition.
      bidder: l.status === "sold" ? (l.topBid?.anonymous ? "Anonymous patron" : (l.soldTo ?? "a patron")) : (l.topBid?.patronName ?? null),
      anonymous: l.topBid?.anonymous ?? false,
      minimumCents: minimumBidCents(l.priceCents, l.topBid?.amountCents ?? null),
      // The buy-it-now offer stands while the bidding is below it.
      buyNowCents: buyNowOpen({ status: l.status, buy_now_cents: l.buyNowCents ?? null }, l.topBid?.amountCents ?? null) ? (l.buyNowCents ?? null) : null,
      closesAt: lotCloses,
    };
  });

  const facts: [string, string][] = [
    [String(run.showCount), season ? "gigs a season" : "shows on the run"],
    ...(run.expectedAttendance ? [[`~${run.expectedAttendance.toLocaleString("en-US")}`, "expected attendance"] as [string, string]] : []),
    [String(openSpots(board)), "placements still open"],
  ];

  return (
    <Theme name={theme}>
      <Nav current="/auctions" />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <HeroArt theme={theme} src={act.photoUrl} />
          <div className="hero-in relative mx-auto max-w-[1120px] px-7 pb-10 pt-[72px]">
            <Eyebrow className="mb-7">Live board</Eyebrow>
            <h1 className={`display max-w-[14ch] leading-[0.98] ${act.name.length > 14 ? "text-[clamp(40px,7vw,92px)]" : "text-[clamp(48px,8.4vw,108px)]"}`}>{act.name}</h1>
            <p className="caps mt-6 text-[14.5px] leading-[2]">
              {run.title}. {run.showCount} {unit}, {formatDateRange(run.startsOn, run.endsOn)}. {act.city}.
            </p>
            <p className="mt-6 max-w-[60ch] text-[clamp(16px,1.9vw,18px)] leading-[1.55]">{lead}</p>
            {act.bio && <p className="mt-5 max-w-[58ch] border-l border-accent/60 pl-5 text-[16px] text-muted">{act.bio}</p>}
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
          {paid && (
            <div role="status" className="lit mt-10 bg-panel px-8 py-7 max-md:px-6">
              <Eyebrow className="mb-3">{paid.kind === "paid" ? "Paid" : "Payment on its way"}</Eyebrow>
              <p className="max-w-none text-[16px]">
                {paid.kind === "paid"
                  ? `${formatMoney(paid.amount)} received. The spot is taken for the run, and the board shows it within a minute.`
                  : `${formatMoney(paid.amount)} is clearing. The spot is held until it lands, and the board updates on its own.`}
                {paid.email ? ` A record is on its way to ${paid.email}.` : ""}
              </p>
              <p className="mt-2 max-w-none text-[15px] text-muted">Door Money holds the money and pays {act.name} every Friday through the run.</p>
            </div>
          )}
          <BoardLots lots={lots} closesAt={closesAt} closesLabel={closesLabel} heading={season ? "Back the season" : "Back the run"} />
        </div>

        <div id="fans" className="border-t border-line py-16">
          <div className="mx-auto grid max-w-[1120px] items-start gap-12 px-7 md:grid-cols-[1fr_400px]">
            <div>
              <Eyebrow className="mb-5">Fans</Eyebrow>
              <h2 className="heading mb-6 text-[clamp(28px,4vw,46px)] leading-[1.02]">Back the {season ? "season" : "run"} for $25 or $100</h2>
              <p>
                Fans back a {season ? "season" : "run"} without taking a placement: a name on the tour thank-you, or on the merch table card at every{" "}
                {season ? "gig" : "show"}. Door Money holds the money and pays {act.name} weekly, the same as a placement.
              </p>
              {backers.length > 0 && (
                <>
                  <p className="caps mt-8 text-[14px] text-muted">
                    {backers.length} {backers.length === 1 ? "fan" : "fans"} so far
                  </p>
                  <p className="mt-3 max-w-[60ch] text-[15px] leading-[1.7]">{backers.map((b) => b.name).join(", ")}</p>
                </>
              )}
            </div>
            <WidgetFrame slug={slug} actName={act.name} source="board" theme={theme} />
          </div>
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
                `${noun} approves the mark. The musician always has the final say.`,
                `${noun} plays the ${season ? "season" : "run"} it was already playing.`,
                `The money reaches ${noun.toLowerCase()} week by week as the ${season ? "season" : "run"} goes on.`,
                season
                  ? "End of season: a record of every gig the placement ran at."
                  : "End of the run, the patron gets a record of it: every show, every room, the attendance count.",
              ]}
            />
          </div>
        </div>

        <NewsletterCTA source={`board:${board.act.slug}`} eyebrow="The next board" />
      </main>

      <Footer note={showBackers ? BACKERS_DISCLAIMER : undefined} />
    </Theme>
  );
}
