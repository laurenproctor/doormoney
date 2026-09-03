import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { Section, SectionHead, Steps } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { ActWaitlistForm } from "@/components/WaitlistForm";
import { getBoard } from "@/lib/boards";
import { WIDGET_TIERS } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "List an act" };

const STEPS: [string, string][] = [
  ["The musician picks the surfaces", "Standard-card prices, or whatever numbers the act wants. Anything not for sale stays off the board, and nothing goes up without the musician's yes."],
  ["The board goes live", "Acts choose auction or fixed price, surface by surface. Winners put the money up within 48 hours or the spot rolls to the next bid."],
  ["The run happens", "The act plays the season or the tour it was already playing. Nothing about the gigs changes."],
  ["The money arrives during the run", "The money lands week by week as the run goes on, not at the end of it. No invoices, no chasing, no waiting on anybody's accounting department."],
];

const CHIPS = ["Kick drum head", "Road cases", "Guitar straps", "Amp grilles", "Tip jar card", "Stage thank-you", "Merch table", "Hang tags", "Picks", "Posts and email", "Rig rundown", "Case lid, solo", "Music stand"];

const MONEY: [string, string][] = [
  ["What does it cost?", `Nothing to list. ${SITE.name} takes ${SITE.feePercent}% of sold spots, and only sold spots. If nothing sells, the act owes nothing and has lost nothing.`],
  ["When is the money real?", "The moment a spot sells. Winners put the money up within 48 hours, before a note is played, and it reaches the act while the run is happening."],
  ["What if a patron asks for something an act doesn't want?", "Every placement needs the musician's yes before it ships, and that yes can become a no before anything goes up. The act's board, the act's call."],
  ["What about regular income?", `Door, merch, tips, and guarantees belong to the act and stay that way. ${SITE.name} only ever touches the patron money it brings in.`],
];

export default async function ListPage() {
  const sample = await getBoard("gutter-hymns");
  return (
    <Page
      current="/list"
      tape="For bands, house acts, and soloists"
      title="List an"
      accent="act"
      intro={
        <>
          <p className="typewriter text-[clamp(18px,2.5vw,25px)]">Musicians set the surfaces, the prices, and the final yes.</p>
          <p className="mt-5 max-w-[55ch]">
            Patrons and brands pay for small placements on the gear a band already hauls to every show: the kick drum,
            the cases, the straps, the tip jar, the feed. The money is there before the first date, and it arrives
            while the run is happening rather than months after it. Listing is free.
          </p>
          <div className="mt-[34px]">
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
        <SectionHead eyebrow="What can be listed">Gear an act already owns</SectionHead>
        <div className="mt-[30px] flex flex-wrap gap-3.5">
          {CHIPS.map((c) => (
            <span key={c} className="poster hard-border bg-white px-4 py-2 text-[16px] shadow-[4px_4px_0_var(--black)]">
              {c}
            </span>
          ))}
        </div>
        <p className="typewriter mt-6 text-[14.5px] text-gray">
          Touring acts price per tour, house acts per month, soloists per season. The placements page lists full
          details and standard prices. Instruments are never for sale and nobody will ever ask.
        </p>
      </Section>

      <Section>
        <SectionHead eyebrow="The widget">The board goes wherever the act does</SectionHead>
        <div className="mt-[30px] grid items-center gap-9 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p>
              Listing on Door Money comes with a widget for the act&apos;s own site. It shows the current run, takes
              the payment, and pays out weekly, so an act can send fans to their own page instead of a third party.
              Where a platform only allows links, a button sends fans to the act&apos;s board instead. Both arrive on
              day one, at no extra cost.
            </p>
            <div className="mt-[26px] flex flex-wrap gap-[18px]">
              <ButtonLink href="/widget" variant="ghost">See the widget</ButtonLink>
            </div>
          </div>
          {sample && (
            <div aria-hidden="true" className="hard-border hard-shadow max-w-[340px] bg-white">
              <div className="poster flex items-center justify-between border-b-[3px] border-ink bg-tape px-3.5 py-2.5 text-[15px]">
                Back the {sample.run.title.toLowerCase()}
                <i className="-rotate-3 border-2 border-ink bg-white px-[7px] py-0.5 text-[14px] not-italic tracking-[0.06em] text-red-deep">{SITE.name}</i>
              </div>
              <div className="px-3.5 py-3">
                <b className="block text-[15px]">{sample.act.name}</b>
                <small className="typewriter text-[14px] text-gray">
                  {sample.run.showCount} shows. {formatDateRange(sample.run.startsOn, sample.run.endsOn)}.
                </small>
                <div className="relative mt-2.5 h-3 border-2 border-ink">
                  <i className="absolute inset-y-0 left-0 w-[59%] bg-red" />
                </div>
                <div className="mt-2.5 grid gap-1.5">
                  {[...WIDGET_TIERS.map((t) => [t.title, formatMoney(t.amountCents)]), ["Take a placement", "$500+"]].map(([title, price], i) => (
                    <span key={title} className={`flex justify-between border-2 border-ink px-2.5 py-1.5 text-[14px] ${i === 0 ? "bg-tape" : ""}`}>
                      {title}
                      <b>{price}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="poster mx-3.5 mb-3.5 mt-3 border-[3px] border-ink bg-red-deep p-[9px] text-center text-[15px] text-white shadow-[3px_3px_0_var(--black)]">
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
              <b className="poster mb-1.5 block text-[20px]">{q}</b>
              <p className="max-w-none text-[15px] text-gray">{a}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="list">
        <SectionHead eyebrow="List an act">First fifty acts list free forever</SectionHead>
        <p>
          {SITE.name} is opening in {SITE.city} first. Acts that leave a name here get an email when listings go live,
          with the founding acts up first.
        </p>
        <div className="mt-[34px] max-w-[560px]">
          <ActWaitlistForm />
        </div>
      </Section>
    </Page>
  );
}
