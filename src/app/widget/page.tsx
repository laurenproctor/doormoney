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
      theme="teal"
      current="/widget"
      eyebrow="For every act with a website"
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
    >
      <Section id="demo">
        <SectionHead eyebrow="The demo">What it looks like on a band&apos;s site</SectionHead>
        <p className="text-muted">
          A band page with the widget dropped in. Picking a tier and pressing the button shows how it feels for a fan.
        </p>

        <div className="edge mt-10 bg-panel ">
          <div className="flex items-center gap-2.5 border-b border-line bg-panel px-3.5 py-2.5">
            <i className="inline-block h-3 w-3 rounded-full border border-line" />
            <i className="inline-block h-3 w-3 rounded-full border border-line" />
            <i className="inline-block h-3 w-3 rounded-full border border-line" />
            <span className="ml-2 flex-1 border border-line bg-panel px-2.5 py-1 text-[14px] text-muted">gutterhymns.band/tour</span>
          </div>
          <div className="grid md:grid-cols-[1.25fr_1fr]">
            <div className="border-b border-line bg-ground px-[30px] py-[34px] text-ink md:border-b-0 md:border-r">
              <div className="display text-[clamp(40px,6vw,64px)] leading-[0.9]">
                {first}
                <br />
                <span className="text-accent-ink">{rest.join(" ")}</span>
              </div>
              <div className="mt-[22px] text-[14.5px] leading-[1.9] text-muted">
                {demo && (
                  <>
                    <b className="font-normal text-ink">{demo.run.title}.</b> {demo.run.showCount} shows,{" "}
                    {formatDateRange(demo.run.startsOn, demo.run.endsOn)}.
                    <br />
                  </>
                )}
                {DEMO_CITIES}
              </div>
              <div className="mt-[26px] flex flex-wrap gap-2.5">
                {["Tickets", "Merch", "Listen", "Mailing list"].map((l) => (
                  <span key={l} className="caps border border-line px-3 py-1.5 text-[14px] tracking-[0.04em] text-muted">
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-ground px-[22px] pb-[26px] pt-[22px]">
              <div className="caps mb-2.5 text-[14px] text-muted">Door Money widget, embedded in the page</div>
              <WidgetFrame slug={DEMO_SLUG} actName={demo?.act.name ?? DEMO_SLUG} />
            </div>
          </div>
        </div>
      </Section>

      <Section id="install">
        <SectionHead eyebrow="The install">One line, on any site</SectionHead>
        <p className="text-muted">
          Every act on Door Money gets their own snippet. It goes wherever the site builder allows custom code: a page,
          a sidebar, a footer. Nothing else to configure.
        </p>
        <pre className="edge mt-[26px] overflow-x-auto font-mono bg-panel px-6 py-[22px] text-[15px] leading-[1.7] text-ink ">
          <span className="text-accent-ink">&lt;script</span> src=<span className="text-ink">&quot;{SITE.url}/embed.js&quot;</span> data-act=
          <span className="text-ink">&quot;{DEMO_SLUG}&quot;</span>
          <span className="text-accent-ink">&gt;&lt;/script&gt;</span>
        </pre>
        <Steps steps={INSTALL} className="mt-[34px]" />
      </Section>

      <Section>
        <SectionHead eyebrow="The money">Why the act&apos;s site never handles a card</SectionHead>
        <p className="text-muted">
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
            stroke="var(--ink)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            className="edge glow block h-auto w-full bg-panel"
          >
            <rect x="20" y="20" width="400" height="290" />
            <text x="36" y="48" fill="var(--ink)" stroke="none" fontFamily="var(--font-bodoni),Georgia,serif" fontSize="19" letterSpacing="0.5">THE ACT&apos;S SITE</text>
            <text x="36" y="70" fill="var(--muted)" stroke="none" fontFamily="var(--font-archivo),Helvetica,sans-serif" fontSize="12">Shows the widget. Cannot read inside it.</text>
            <rect x="60" y="92" width="320" height="196" stroke="var(--accent)" />
            <text x="76" y="120" fill="var(--accent)" stroke="none" fontFamily="var(--font-bodoni),Georgia,serif" fontSize="19" letterSpacing="0.5">DOOR MONEY FRAME</text>
            <text x="76" y="142" fill="var(--muted)" stroke="none" fontFamily="var(--font-archivo),Helvetica,sans-serif" fontSize="12">Served by Door Money. Holds the run, the tiers, the name.</text>
            <rect x="100" y="164" width="240" height="100" fill="var(--accent)" />
            <text x="116" y="192" fill="var(--on-accent)" stroke="none" fontFamily="var(--font-bodoni),Georgia,serif" fontSize="19" letterSpacing="0.5">CARD FIELD</text>
            <text x="116" y="214" fill="var(--on-accent)" stroke="none" fontFamily="var(--font-archivo),Helvetica,sans-serif" fontSize="12">Served by the payment processor.</text>
            <text x="116" y="232" fill="var(--on-accent)" stroke="none" fontFamily="var(--font-archivo),Helvetica,sans-serif" fontSize="12">Card numbers stop here. Not the site,</text>
            <text x="116" y="250" fill="var(--on-accent)" stroke="none" fontFamily="var(--font-archivo),Helvetica,sans-serif" fontSize="12">not Door Money&apos;s servers either.</text>
          </svg>
          <ul>
            {FACTS.map((f, i) => (
              <li key={f} className={`flex items-baseline gap-3.5 py-3 text-[15px] leading-[1.55] ${i ? "border-t border-line" : ""}`}>
                <span aria-hidden="true" className="text-accent-ink">&#9642;</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Where it works">Every site, one way or another</SectionHead>
        <div className="mt-[34px] grid gap-[26px] md:grid-cols-2">
          <div className="edge bg-panel px-[22px] py-6 ">
            <h3 className="display mb-2 text-[22px]">The full widget</h3>
            <p className="max-w-none text-[15px] leading-[1.6] text-muted">
              Anywhere that accepts custom code or an embed block. Fans pay on the page, the run and the totals show
              live, and the act keeps the visitor on their own site.
            </p>
            <Platforms list={FULL} />
          </div>
          <div className="edge bg-panel px-[22px] py-6 ">
            <h3 className="display mb-2 text-[22px]">The link button</h3>
            <p className="max-w-none text-[15px] leading-[1.6] text-muted">
              For platforms that only allow links: link-in-bio pages, Bandcamp, a Substack footer, an Instagram bio.
              The button sends the fan to the act&apos;s board on Door Money, where the same payment happens.
            </p>
            <Platforms list={LINK} />
            <a
              href={`/board/${DEMO_SLUG}`}
              className="caps mt-4 inline-flex items-center gap-2.5 border border-accent bg-accent px-4 py-2.5 text-[14px] text-on-accent no-underline"
            >
              <span aria-hidden="true" className="text-on-accent">&#9679;</span> Back {demo?.act.name ?? "the act"} on Door Money
            </a>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="List an act">The widget comes with the board</SectionHead>
        <p className="text-muted">
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
        <span key={p} className="caps border border-line bg-panel px-2.5 py-1 text-[14px]">
          {p}
        </span>
      ))}
    </div>
  );
}
