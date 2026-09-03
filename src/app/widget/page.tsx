import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { Lines, Section, SectionHead, Steps } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { getBoard } from "@/lib/boards";
import { formatDateRange } from "@/lib/dates";
import { SITE } from "@/lib/site";
import { WidgetFrame } from "./WidgetFrame";

export const metadata: Metadata = { title: "The widget" };

const DEMO_SLUG = "gutter-hymns";

// The pretend band site around the demo. Sample copy, like the mockup.
const DEMO_CITIES =
  "Providence, Boston, Portland, Burlington, Albany, Kingston, Brooklyn, Philadelphia, Baltimore, Richmond, Asheville, Nashville, Louisville, Cincinnati, Columbus, Pittsburgh, Buffalo, Rochester.";

const INSTALL: [string, string][] = [
  ["The act copies their snippet", "It appears on the act's Door Money dashboard the moment their board is live. Same snippet for every page it goes on."],
  ["The act pastes it into their site", "Squarespace, WordPress, Wix, Webflow, Carrd, Shopify, a hand-built site. Anywhere that takes an embed block or custom HTML."],
  ["The widget keeps itself current", "When the run changes, the totals change, or a new board opens, the widget updates on its own. The act never touches the code again."],
];

const FACTS = [
  "The act's site only holds one line of code. The widget itself lives on Door Money and loads into a frame the site cannot see into.",
  "Inside that frame, the card field comes from the payment processor. The card number never reaches the act's site and never reaches Door Money's servers. Only a token does.",
  "Door Money holds every payment and releases it to the act weekly, exactly as it does for placements bought on Door Money itself.",
  "If an act's site is ever hacked or defaced, the widget stays untouched, because none of it is stored there.",
  "Refunds, receipts and disputes run through Door Money, so the act never fields a payment question.",
];

const FULL = ["Squarespace", "WordPress", "Wix", "Webflow", "Carrd", "Shopify", "Own code"];
const LINK = ["Linktree", "Bandcamp", "Instagram", "Substack", "Email signatures"];

export default async function WidgetPage() {
  const demo = await getBoard(DEMO_SLUG);
  const [first, ...rest] = demo?.act.name.split(" ") ?? ["Gutter", "Hymns"];

  return (
    <Page
      current="/widget"
      tape="For every act with a website"
      title="The"
      accent="widget"
      intro={
        <>
          <p>
            One line of code puts a Door Money box on any act&apos;s own site. Fans and local businesses back the act
            right there, on the page they already visit, without leaving for another platform. The money reaches the
            act on the same weekly schedule as everything else on Door Money.
          </p>
          <Lines
            className="mt-[30px]"
            lines={[
              "The act pastes one line into their site.",
              "The widget shows the current run and takes the payment.",
              "Door Money holds the money and pays the act weekly.",
              "The act keeps every fan on their own page.",
            ]}
          />
          <div className="mt-[34px] flex flex-wrap gap-[22px]">
            <ButtonLink href="#demo">See it working</ButtonLink>
            <ButtonLink href="#install" variant="ghost">How to install</ButtonLink>
          </div>
        </>
      }
      footerNote="The widget shown here is a demo; the snippet, domain and tiers illustrate the idea only, until Door Money opens."
    >
      <Section id="demo">
        <SectionHead eyebrow="The demo">What it looks like on a band&apos;s site</SectionHead>
        <p className="text-gray">
          A sample band page with the widget dropped in. The tiers, totals and card field are pretend; picking a tier
          and pressing the button shows how it feels for a fan.
        </p>

        <div className="hard-border mt-10 bg-white shadow-[9px_9px_0_var(--black)]">
          <div className="flex items-center gap-2.5 border-b-[3px] border-ink bg-[#F4F1EA] px-3.5 py-2.5">
            <i className="inline-block h-3 w-3 rounded-full border-2 border-ink" />
            <i className="inline-block h-3 w-3 rounded-full border-2 border-ink" />
            <i className="inline-block h-3 w-3 rounded-full border-2 border-ink" />
            <span className="typewriter ml-2 flex-1 border-2 border-ink bg-white px-2.5 py-1 text-[12.5px] text-gray">gutterhymns.band/tour</span>
          </div>
          <div className="grid md:grid-cols-[1.25fr_1fr]">
            <div className="border-b-[3px] border-ink bg-[#1A1814] px-[30px] py-[34px] text-paper md:border-b-0 md:border-r-[3px]">
              <div className="poster text-[clamp(40px,6vw,64px)] leading-[0.9]">
                {first}
                <br />
                <span className="text-tape">{rest.join(" ")}</span>
              </div>
              <div className="typewriter mt-[22px] text-[13.5px] leading-[1.9] text-[#C9C4B8]">
                {demo && (
                  <>
                    <b className="font-normal text-paper">{demo.run.title}.</b> {demo.run.showCount} shows,{" "}
                    {formatDateRange(demo.run.startsOn, demo.run.endsOn)}.
                    <br />
                  </>
                )}
                {DEMO_CITIES}
              </div>
              <div className="mt-[26px] flex flex-wrap gap-2.5">
                {["Tickets", "Merch", "Listen", "Mailing list"].map((l) => (
                  <span key={l} className="poster border-2 border-[#6B655A] px-3 py-1.5 text-[12px] tracking-[0.04em] text-[#C9C4B8]">
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-paper px-[22px] pb-[26px] pt-[22px]">
              <div className="typewriter mb-2.5 text-[12px] text-gray">Door Money widget, embedded in the page</div>
              <WidgetFrame slug={DEMO_SLUG} actName={demo?.act.name ?? DEMO_SLUG} />
            </div>
          </div>
        </div>
      </Section>

      <Section id="install">
        <SectionHead eyebrow="The install">One line, on any site</SectionHead>
        <p className="text-gray">
          Every act on Door Money gets their own snippet. It goes wherever the site builder allows custom code: a page,
          a sidebar, a footer. Nothing else to configure.
        </p>
        <pre className="typewriter hard-border mt-[26px] overflow-x-auto bg-ink px-6 py-[22px] text-[14px] leading-[1.7] text-paper shadow-[7px_7px_0_var(--red)]">
          <span className="text-tape">&lt;script</span> src=<span className="text-[#FFB3A3]">&quot;{SITE.url}/embed.js&quot;</span> data-act=
          <span className="text-[#FFB3A3]">&quot;{DEMO_SLUG}&quot;</span>
          <span className="text-tape">&gt;&lt;/script&gt;</span>
        </pre>
        <Steps steps={INSTALL} className="mt-[34px]" />
      </Section>

      <Section>
        <SectionHead eyebrow="The money">Why the act&apos;s site never handles a card</SectionHead>
        <p className="text-gray">
          The widget takes payment on the act&apos;s page without the act&apos;s site ever seeing the card. Here is
          how the layers sit.
        </p>
        <div className="mt-9 grid items-start gap-[30px] md:grid-cols-2">
          <svg
            viewBox="0 0 440 330"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="Three nested boxes: the act's site, the Door Money frame inside it, and the payment processor's card field inside that"
            fill="none"
            stroke="#000"
            strokeWidth="3"
            strokeLinejoin="round"
            className="hard-border hard-shadow block h-auto w-full bg-white"
          >
            <rect x="20" y="20" width="400" height="290" />
            <text x="36" y="48" fill="#000" stroke="none" fontFamily="Anton,Impact,sans-serif" fontSize="18" letterSpacing="1">THE ACT&apos;S SITE</text>
            <text x="36" y="70" fill="#55524B" stroke="none" fontFamily="'Special Elite','Courier New',monospace" fontSize="12">Shows the widget. Cannot read inside it.</text>
            <rect x="60" y="92" width="320" height="196" stroke="#E03A1E" />
            <text x="76" y="120" fill="#E03A1E" stroke="none" fontFamily="Anton,Impact,sans-serif" fontSize="18" letterSpacing="1">DOOR MONEY FRAME</text>
            <text x="76" y="142" fill="#55524B" stroke="none" fontFamily="'Special Elite','Courier New',monospace" fontSize="12">Served by Door Money. Holds the run, the tiers, the name.</text>
            <rect x="100" y="164" width="240" height="100" fill="#F2C230" />
            <text x="116" y="192" fill="#000" stroke="none" fontFamily="Anton,Impact,sans-serif" fontSize="18" letterSpacing="1">CARD FIELD</text>
            <text x="116" y="214" fill="#000" stroke="none" fontFamily="'Special Elite','Courier New',monospace" fontSize="12">Served by the payment processor.</text>
            <text x="116" y="232" fill="#000" stroke="none" fontFamily="'Special Elite','Courier New',monospace" fontSize="12">Card numbers stop here. Not the site,</text>
            <text x="116" y="250" fill="#000" stroke="none" fontFamily="'Special Elite','Courier New',monospace" fontSize="12">not Door Money&apos;s servers either.</text>
          </svg>
          <ul>
            {FACTS.map((f, i) => (
              <li key={f} className={`typewriter flex items-baseline gap-3.5 py-3 text-[15px] leading-[1.55] ${i ? "border-t-2 border-dashed border-[#A79D8A]" : ""}`}>
                <span className="poster text-[14px] text-red">x</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Where it works">Every site, one way or another</SectionHead>
        <div className="mt-[34px] grid gap-[26px] md:grid-cols-2">
          <div className="hard-border bg-white px-[22px] py-6 shadow-[6px_6px_0_var(--black)]">
            <h4 className="poster mb-2 text-[22px]">The full widget</h4>
            <p className="max-w-none text-[14.5px] leading-[1.6] text-gray">
              Anywhere that accepts custom code or an embed block. Fans pay on the page, the run and the totals show
              live, and the act keeps the visitor on their own site.
            </p>
            <Platforms list={FULL} />
          </div>
          <div className="hard-border bg-white px-[22px] py-6 shadow-[6px_6px_0_var(--black)]">
            <h4 className="poster mb-2 text-[22px]">The link button</h4>
            <p className="max-w-none text-[14.5px] leading-[1.6] text-gray">
              For platforms that only allow links: link-in-bio pages, Bandcamp, a Substack footer, an Instagram bio.
              The button sends the fan to the act&apos;s board on Door Money, where the same payment happens.
            </p>
            <Platforms list={LINK} />
            <a
              href={`/board/${DEMO_SLUG}`}
              className="poster hard-border mt-4 inline-flex items-center gap-2.5 bg-tape px-4 py-2.5 text-[15px] tracking-[0.03em] text-ink no-underline shadow-[4px_4px_0_var(--black)]"
            >
              <span className="text-red">&#9679;</span> Back {demo?.act.name ?? "the act"} on Door Money
            </a>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="List an act">The widget comes with the board</SectionHead>
        <p className="text-gray">
          Every act that lists on Door Money gets the snippet and the link button on day one. Nothing extra to set up,
          nothing extra to pay.
        </p>
        <div className="mt-[34px] flex flex-wrap gap-[22px]">
          <ButtonLink href="/list">List an act</ButtonLink>
          <ButtonLink href="/placements" variant="ghost">See the placements</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}

function Platforms({ list }: { list: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {list.map((p) => (
        <span key={p} className="typewriter border-2 border-ink bg-cream px-2.5 py-1 text-[12px]">
          {p}
        </span>
      ))}
    </div>
  );
}
