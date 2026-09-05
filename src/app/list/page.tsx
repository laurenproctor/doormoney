import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { Section, SectionHead, Steps } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { getBoard } from "@/lib/boards";
import { WIDGET_TIERS } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "List an act",
  description: "Get paid for the audience you're already building. Door Money earns 15% when a sponsorship sells, and nothing before that.",
};

// This page speaks to the musician directly. The second person here is deliberate; see CLAUDE.md, voice rule 1.

const STEPS: [string, string][] = [
  ["You decide what you offer", "The suggested prices, or your own numbers. Anything not for sale stays off, and nothing goes up without your yes."],
  ["The fundraiser goes live", "Fixed price or open to bids, one sponsorship at a time. Winners put the money up within 48 hours or the spot rolls to the next bid."],
  ["Nothing about the gigs changes", "You keep playing the gigs you were already going to play. Door Money adds another way for those gigs to pay."],
  ["The money arrives while you play", "It lands week by week as the shows happen, not at the end. No invoices, no chasing, no waiting on anybody's accounting department."],
];

const BOARD: [string, string[]][] = [
  ["Onstage", ["Kick drum head", "Guitar straps", "Amp grilles", "Music stand", "Riser fascia"]],
  ["Around the room", ["Tip jar card", "Merch table", "Road cases", "Hang tags", "Picks", "Stage thank-you"]],
  ["Online", ["Posts and email", "Rig rundown", "Vlog logo card", "Poster credit"]],
];

const MONEY: [string, string][] = [
  ["Door Money makes money when you make money.", `${SITE.name} keeps ${SITE.feePercent}% of completed sponsorships and charges nothing else. If nothing sells, you owe nothing.`],
  ["When is the money real?", "The moment a sponsorship sells. Winners put the money up within 48 hours, before a note is played, and it reaches you while the shows are happening."],
  ["What if a patron asks for something you don't want?", "Every sponsorship needs your yes before it ships, and that yes can become a no before anything goes up. Your fundraiser, your call."],
  ["What about regular income?", `Door, merch, tips and guarantees are yours and stay that way. ${SITE.name} only ever touches the patron money it brings in.`],
];

export default async function ListPage() {
  const sample = await getBoard("gutter-hymns");
  return (
    <Page
      theme="amber"
      current="/list"
      eyebrow="For working musicians"
      title="Get paid for the audience"
      accent="you're already building."
      headline="md"
      intro={
        <>
          <p className="max-w-[55ch]">
            Door Money helps businesses, brands and fans put money behind the shows you&apos;re already playing. You
            choose what to offer, what it costs and who appears beside your name.
          </p>
          <p className="caps mt-6 text-[14.5px] leading-[2] text-accent-ink">
            {SITE.name} earns {SITE.feePercent}% when something sells, and nothing before that.
          </p>
          <div className="mt-[30px]">
            <ButtonLink href="#list">List an act</ButtonLink>
          </div>
        </>
      }
      stamp={
        <>
          DOOR MONEY<br />PAID<br />AT THE DOOR
        </>
      }
    >
      <Section>
        <SectionHead eyebrow="How listing works">What listing gets a musician</SectionHead>
        <Steps steps={STEPS} size="lg" ruleFirst={false} className="mt-[34px] max-w-[720px]" />
      </Section>

      <Section>
        <SectionHead eyebrow="What can be listed">What you can offer</SectionHead>
        <div className="mt-[30px] grid gap-8 md:grid-cols-3">
          {BOARD.map(([group, items]) => (
            <div key={group}>
              <div className="caps mb-3.5 border-b border-line pb-2.5 text-[14px] text-accent-ink">{group}</div>
              <div className="flex flex-wrap gap-2.5">
                {items.map((c) => (
                  <span key={c} className="caps edge px-3.5 py-2 text-[14px]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[14.5px] text-muted">
          Touring musicians price per tour, house acts per month, soloists per season. The placements page lists full
          details and standard prices. Instruments are never for sale and nobody will ever ask.
        </p>
      </Section>

      <Section>
        <SectionHead eyebrow="The widget">The fundraiser goes wherever you do</SectionHead>
        <div className="mt-[30px] grid items-center gap-9 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p>
              Listing on Door Money comes with a widget for your own site. It shows the current fundraiser, takes the
              payment and pays out weekly, so fans can back you on your page instead of a third party&apos;s. Where a
              platform only allows links, a button sends them to your board instead. Both arrive on day one, at no
              extra cost.
            </p>
            <div className="mt-[26px] flex flex-wrap gap-[18px]">
              <ButtonLink href="/widget" variant="ghost">See the widget</ButtonLink>
            </div>
          </div>
          {sample && (
            <div aria-hidden="true" className="edge glow max-w-[340px] bg-panel">
              <div className="caps flex items-center justify-between border-b border-line px-3.5 py-2.5 text-[14px]">
                Back the {sample.run.title.toLowerCase()}
                <i className="not-italic text-accent-ink">{SITE.name}</i>
              </div>
              <div className="px-3.5 py-3">
                <b className="block text-[15px]">{sample.act.name}</b>
                <small className="caps text-[14px] text-muted">
                  {sample.run.showCount} shows. {formatDateRange(sample.run.startsOn, sample.run.endsOn)}.
                </small>
                <div className="relative mt-2.5 h-1.5 bg-line">
                  <i className="absolute inset-y-0 left-0 w-[59%] bg-accent" />
                </div>
                <div className="mt-2.5 grid gap-1.5">
                  {[...WIDGET_TIERS.map((t) => [t.title, formatMoney(t.amountCents)]), ["Take a sponsorship", "$500+"]].map(([title, price], i) => (
                    <span key={title} className={`flex justify-between border border-line px-2.5 py-1.5 text-[14px] ${i === 0 ? "border-accent! bg-accent/10" : ""}`}>
                      {title}
                      <b>{price}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="caps mx-3.5 mb-3.5 mt-3 border border-accent bg-accent p-[10px] text-center text-[14px] text-on-accent">
                Back for {formatMoney(WIDGET_TIERS[0].amountCents)}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="The money">Straight questions, straight answers</SectionHead>
        <div className="mt-[34px] grid gap-[26px] md:grid-cols-2">
          {MONEY.map(([q, a]) => (
            <div key={q}>
              <b className="heading mb-1.5 block text-[20px]">{q}</b>
              <p className="max-w-none text-[15px] text-muted">{a}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="list">
        <SectionHead eyebrow="List an act">Open a fundraiser</SectionHead>
        <p>
          Claim a username, describe the fundraiser, price what you offer, publish. The username is your address, so
          the fundraiser goes up at its own address and on the fundraiser page, and the widget snippet is ready the same day.
        </p>
        <div className="mt-[34px]">
          <ButtonLink href="/signup?next=%2Fdashboard%2Fact%2Fnew" arrow>List an act</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}
