import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Lines } from "@/components/Brand";
import { HeroArt } from "@/components/HeroArt";
import { NewsletterCTA } from "@/components/Newsletter";
import { PlacementVerification } from "@/components/PlacementVerification";
import { Theme, themeFor } from "@/components/Theme";
import { WidgetFrame } from "@/components/WidgetFrame";
import { openSpots } from "@/lib/boards";
import { CATALOG } from "@/lib/catalog";
import { clockOf, closeStamp, formatDateRange, weekdayOf } from "@/lib/dates";
import { instagramHandle, instagramUrl, safeWebsite, websiteLabel } from "@/lib/links";
import { formatMoney } from "@/lib/money";
import { buyNowOpen, minimumBidCents } from "@/lib/auctions";
import type { Board } from "@/lib/sample";
import { BoardLots, type LotView } from "./BoardLots";
import { BACKERS_DISCLAIMER, RosieBackers } from "./backers";

/** "an 18-show run", "a 32-gig season". */
const article = (n: number) => (/^(8|11$|18$|8\d)/.test(String(n)) ? "an" : "a");
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

export type PaidNotice = { kind: "paid" | "processing"; amount: number; email: string | null };

/**
 * The board itself: everything a patron reads, from the hero to the newsletter.
 *
 * One component for two routes. /[slug]/[run] renders it for the public once a run is open, and
 * the musician's own /dashboard/runs/[id]/preview renders the same thing for a draft with `draft`
 * set, so a preview is the board rather than a picture of one. The route decides who may see it;
 * this decides what it looks like.
 */
export function BoardView({
  board,
  slug,
  paid = null,
  draft = null,
}: {
  board: Board;
  slug: string;
  paid?: PaidNotice | null;
  /** The banner for a private preview: where to go back to, and whether the board is already up. */
  draft?: { backHref: string; published: boolean } | null;
}) {
  const { act, run } = board;

  // Every act gets its own color of light, the same one every time.
  const theme = themeFor(slug);
  const season = run.kind === "season";
  const unit = season ? "gigs" : "shows";
  const noun = act.type === "soloist" ? "The musician" : "The band";
  const auction = board.lots.some((l) => l.mode === "auction");
  const closesAt = run.biddingClosesAt;
  const closeDay = closesAt ? weekdayOf(closesAt) : null;
  // The headline names the close in full, so nobody has to work out which Friday it means.
  const closeFull = closesAt ? closeStamp(closesAt) : null;
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

  // Both come from the musician's own typing, so both are checked before they reach an href.
  const website = safeWebsite(act.website);
  const handle = instagramHandle(act.instagram);

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
      {draft && (
        <div className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-7 py-3">
            <span className="caps flex items-center gap-3 text-[14px] text-accent-ink">
              <i aria-hidden="true" className="inline-block h-1.5 w-1.5 flex-none bg-accent" />
              {draft.published ? "Preview of the published board" : "Draft preview, private to this account"}
            </span>
            <a href={draft.backHref} className="caps text-[14px] text-muted underline decoration-1 underline-offset-4 hover:text-ink">
              Back to editing
            </a>
          </div>
        </div>
      )}
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <HeroArt theme={theme} src={act.photoUrl} />
          <div className="hero-in relative mx-auto max-w-[1120px] px-7 pb-10 pt-[72px]">
            <Eyebrow className="mb-7">{draft && !draft.published ? "Draft board" : "Live board"}</Eyebrow>
            <h1 className={`display max-w-[14ch] leading-[0.98] ${act.name.length > 14 ? "text-[clamp(40px,7vw,92px)]" : "text-[clamp(48px,8.4vw,108px)]"}`}>{act.name}</h1>
            <p className="caps mt-6 text-[14.5px] leading-[2]">
              {run.title}. {run.showCount} {unit}, {formatDateRange(run.startsOn, run.endsOn)}. {act.city}.
            </p>
            <p className="mt-6 max-w-[60ch] text-[clamp(16px,1.9vw,18px)] leading-[1.55]">{lead}</p>
            {act.bio && <p className="mt-5 max-w-[58ch] border-l border-accent/60 pl-5 text-[16px] text-muted">{act.bio}</p>}
            {(website || handle) && (
              <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14.5px]">
                {website && (
                  <a
                    href={website}
                    rel="noopener noreferrer nofollow ugc"
                    target="_blank"
                    aria-label={`${act.name} website, opens in a new tab`}
                    className="break-all text-accent-ink underline decoration-1 underline-offset-4"
                  >
                    {websiteLabel(website)}
                  </a>
                )}
                {handle && (
                  <a
                    href={instagramUrl(handle)}
                    rel="noopener noreferrer nofollow ugc"
                    target="_blank"
                    aria-label={`${act.name} on Instagram, opens in a new tab`}
                    className="text-accent-ink underline decoration-1 underline-offset-4"
                  >
                    Instagram, @{handle}
                  </a>
                )}
              </p>
            )}
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

        <PlacementVerification
          actName={act.name}
          runTitle={run.title}
          verification={{ methods: run.verificationMethods ?? [], other: run.verificationOther ?? null }}
        />

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
            <h2 className="heading mb-8 text-[clamp(28px,4vw,46px)] leading-[1.02]">What happens after {closeFull ?? "the close"}</h2>
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
