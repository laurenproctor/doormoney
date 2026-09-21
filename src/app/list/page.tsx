import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { Section, SectionHead, Steps } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { getBoard } from "@/lib/boards";
import { getCategoryLabels } from "@/lib/category-registry";
import { AVAILABILITY_NOTE, STARTING_CATEGORIES, STARTING_CATEGORIES_NOTE } from "@/lib/starting-categories";
import { WIDGET_TIERS } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Create a fundraiser",
  description: "For organizers: say what the funding enables, describe the audience, choose sponsorship options and set the prices. Door Money earns 15% when a sponsorship sells, and nothing before that.",
};

// The address stays /list: it is in sent email. The page is "Create a fundraiser", for any organizer.
// It speaks to the organizer directly. The second person here is deliberate; see CLAUDE.md, voice rule 1.

const STEPS: [string, string][] = [
  ["Define what the funding enables", "Travel, equipment, a production, a season. One fundraiser, one named purpose, so a sponsor knows what the money makes possible."],
  ["Describe the audience", "Who the work reaches, and where: in a room, across a season, online. Leave out what you do not know. An unknown stays unknown."],
  ["Choose sponsorship options", "Pick the placements you have the authority to deliver. Anything not on offer stays off, and no sponsor's materials appear without your approval."],
  ["Set prices", "Your price is the price, fixed or open to bids. Door Money suggests one only where it has a sales history to suggest from."],
  ["State what sponsors receive", "What appears, where, and how you will document it. That statement is the promise a sponsor buys, so keep it the size you can deliver."],
  ["Publish when the fundraiser is ready", "A draft holds what is known so far. Publishing asks for the answers a sponsor needs, and nothing is public before then."],
];

const ORGANIZERS: [string, string][] = [
  ["Musicians", "Bands, ensembles, soloists and music organizations."],
  ["Teams", "A team, or a representative with authority over what the team offers."],
  ["Filmmakers", "A filmmaker or a production organization."],
  ["Theater companies", "A company, or an authorized producer."],
  ["Organizations", "A group that organizes the work and answers for its delivery."],
  ["What comes next", "Any organizer who can state the funding purpose, the audience, what the sponsor receives and how delivery will be documented."],
];

const MONEY: [string, string][] = [
  ["Door Money makes money when you make money.", `${SITE.name} keeps ${SITE.feePercent}% of completed sponsorships and charges nothing else. If nothing sells, you owe nothing.`],
  ["When does the money reach you?", "Door Money holds what a sponsor pays and releases your share under your fundraiser's terms. The terms depend on the category: a music fundraiser pays out weekly across its dates."],
  ["What if a sponsor sends something you do not want?", "Every sponsor's materials need your approval before anything appears. Your fundraiser, your call."],
  ["What about your other income?", `Tickets, sales, fees and grants are yours and stay that way. ${SITE.name} only ever touches the sponsorship money it brings in.`],
];

export default async function ListPage() {
  const [sample, labels] = await Promise.all([getBoard("gutter-hymns"), getCategoryLabels()]);
  return (
    <Page
      theme="amber"
      current="/list"
      eyebrow="For organizers"
      title="Fund the work with"
      accent="a clear promise."
      headline="md"
      strap="For organizers"
      intro={
        <>
          <p className="max-w-[55ch]">
            Door Money helps sponsors put money behind the work you are already doing. You say what the funding
            enables, who the audience is and what a sponsor receives. You choose what to offer, what it costs and who
            appears beside your name.
          </p>
          <p className="caps mt-6 text-[14.5px] leading-[2] text-accent-ink">
            {SITE.name} earns {SITE.feePercent}% when something sells, and nothing before that.
          </p>
          <div className="mt-[30px]">
            <ButtonLink href="#list">Create a fundraiser</ButtonLink>
          </div>
        </>
      }
    >
      <Section>
        <SectionHead eyebrow="Six steps">From a purpose to a published fundraiser</SectionHead>
        <Steps steps={STEPS} size="lg" ruleFirst={false} className="mt-[34px] max-w-[720px]" />
      </Section>

      <Section>
        <SectionHead eyebrow="Who organizes">Any organizer with a clear promise</SectionHead>
        <p className="max-w-[62ch] text-muted">{STARTING_CATEGORIES_NOTE}</p>
        <dl className="mt-9 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {ORGANIZERS.map(([who, what]) => (
            <div key={who} className="bg-ground p-6">
              <dt className="heading text-[20px] leading-[1.2]">{who}</dt>
              <dd className="mt-2 text-[15px] leading-[1.6] text-muted">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">{AVAILABILITY_NOTE}</p>
      </Section>

      <Section>
        <SectionHead eyebrow="What you can offer">Placements that fit your work</SectionHead>
        <p className="max-w-[62ch]">
          The options you see when you build a fundraiser belong to its category, so a team is never offered a
          musician&apos;s inventory and a filmmaker is never asked about a stage. Offer only what you have the
          authority to deliver.
        </p>
        <div className="mt-9 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STARTING_CATEGORIES.map((c) => (
            <div key={c.key} className="flex flex-col bg-ground p-6">
              <div className="caps text-[14px] text-accent-ink">{labels[c.key] ?? c.label}</div>
              <p className="mt-3 max-w-none text-[15px] leading-[1.6] text-muted">{c.placements}</p>
            </div>
          ))}
        </div>
        <div className="mt-7">
          <ButtonLink href="/how-sponsorship-works" variant="ghost" arrow>How sponsorship works</ButtonLink>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="For music fundraisers">A widget for a musician&apos;s own site</SectionHead>
        <div className="mt-[30px] grid items-center gap-9 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p>
              This one is music&apos;s today. A music fundraiser comes with a widget for the musician&apos;s own site.
              It shows the current fundraiser, takes backings from fans and pays out weekly, so fans can back the
              music on the musician&apos;s page instead of a third party&apos;s. Where a platform only allows links, a
              button sends them to the fundraiser instead. Both arrive on day one, at no extra cost.
            </p>
            <p className="mt-4 text-[14.5px] leading-[1.7] text-muted">
              Backings and their tiers are built for music. Other categories do not have a widget yet.
            </p>
            <div className="mt-[26px] flex flex-wrap gap-[18px]">
              <ButtonLink href="/widget" variant="ghost">See the music widget</ButtonLink>
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
        <SectionHead eyebrow="Create a fundraiser">Open a fundraiser</SectionHead>
        <p>
          Claim a username, describe the fundraiser, price what you offer, publish. The username is your address, so
          the fundraiser goes up at its own address and on the fundraisers page.
        </p>
        <div className="mt-[34px]">
          <ButtonLink href="/signup?next=%2Fdashboard%2Fact%2Fnew" arrow>Create a fundraiser</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}
