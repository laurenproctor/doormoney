import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Page } from "@/components/Page";
import { Section, SectionHead, Steps } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { NewsletterCTA } from "@/components/Newsletter";
import { CATALOG, type ActType, type Period, type Surface, type SurfaceGroup } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { VERIFICATION_METHODS } from "@/lib/verification";
import { DIAGRAMS, StageSchematic } from "./diagrams";

export const metadata: Metadata = {
  title: { absolute: "How Music Sponsorship Works | Door Money" },
  description:
    "Learn how Door Money connects working musicians with fans, local businesses, and brands through artist-controlled, verified sponsorships.",
  alternates: { canonical: "/how-sponsorship-works" },
  openGraph: {
    type: "website",
    url: "/how-sponsorship-works",
    title: "How Music Sponsorship Works | Door Money",
    description:
      "Learn how Door Money connects working musicians with fans, local businesses, and brands through artist-controlled, verified sponsorships.",
  },
};

/*
  The page that explains the model to both sides: the musician deciding whether to open a fundraiser,
  and the fan, local business or brand deciding whether to back one.

  Every option, price and verification method on this page is read from the product rather than
  written here: src/lib/catalog.ts holds the sponsorship options and their suggested prices, and
  src/lib/verification.ts holds the ways a musician can document what happened. Nothing here
  promises more than those two files do. See CLAUDE.md, "No invented proof".
*/

/** The heading pair above each group of sponsorship options. Local to this page; the catalogue's own labels serve Home. */
const GROUP_HEADS: Record<SurfaceGroup, { eyebrow: string; heading: string; intro: string }> = {
  onstage: {
    eyebrow: "Onstage",
    heading: "Where the cameras already point",
    intro:
      "The stage is the part of the night that gets photographed. A mark on the gear travels through every room on the fundraiser, in crowd photos, phone videos and press shots. Each format matches the musician's own artwork.",
  },
  room: {
    eyebrow: "At the merch table and in the room",
    heading: "Where fans stop and read",
    intro:
      "The stage gets glances. The merch table and the tip jar get pauses. These options live where fans stop, buy and talk, and some of them go home in a pocket.",
  },
  online: {
    eyebrow: "Online and in print",
    heading: "Where the numbers come with it",
    intro:
      "Posts, email, video and print reach the audience between shows, and they arrive with familiar figures: views, reach, opens and clicks. They also make the easiest first sponsorship for anyone who has never backed a musician before.",
  },
};

const GROUP_ORDER: SurfaceGroup[] = ["onstage", "room", "online"];

/** The full-width card at the top of a group. */
const HERO_KEYS = new Set(["kick_head", "tip_jar_card"]);

/**
 * The five surfaces the stage drawing numbers. Soloist gear is not in the drawing, so it is not in
 * the key either: the numbers under the schematic have to match the numbers on it.
 */
const STAGE_KEY = CATALOG.filter((s) => s.group === "onstage" && !s.appliesTo.includes("soloist"));

const FIT: Record<ActType, string> = { touring_band: "bands", house_act: "house acts", soloist: "soloists" };

/** "Bands, house acts and soloists": who a sponsorship option is offered by, from the catalogue itself. */
function fitLabel(types: ActType[]): string {
  const names = (["touring_band", "house_act", "soloist"] as ActType[]).filter((t) => types.includes(t)).map((t) => FIT[t]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `Offered by ${list}`;
}

/** A fundraiser is the period being funded, so a per-run price is a price for the whole fundraiser. */
const PER: Record<Period, string> = { run: "per fundraiser", month: "per month", season: "per season" };

const STEPS: [string, string][] = [
  [
    "The musician opens a fundraiser",
    "The musician says what the money is for, a tour, a residency or a season, and picks which sponsorship options to offer at prices they set themselves.",
  ],
  [
    "A sponsor takes one",
    "A fan, a local business or a brand picks an option and pays Door Money. Some options carry a fixed price and some are open to bids; the musician decides which.",
  ],
  [
    "The musician approves the mark",
    "The sponsor sends the name or logo as it will appear. Nothing goes up without the musician's yes, and a musician who declines refunds the sponsor in full.",
  ],
  [
    "Door Money pays and documents",
    "The musician is paid every Friday through the fundraiser. The sponsor gets a record at the end: the dates played, the rooms, and how the musician documented the placement.",
  ],
];

/** What the four words on this page mean, so nothing on it has to be guessed at. */
const TERMS: [string, string][] = [
  ["Sponsorship option", "What the sponsor receives. The musician chooses which ones to offer."],
  ["Placement", "Where the sponsor appears: a kick drum head, a merch table runner, a newsletter."],
  ["Price", "Set by the musician. The figures on this page are Door Money's suggestions."],
  ["Verification", "How the musician documents that the placement ran, agreed before anyone pays."],
];

const CONTROL: string[] = [
  "Choose which sponsorship options to offer.",
  "Set the price on every one of them.",
  "Approve or decline the mark before it goes up.",
  "Choose how the placement will be documented.",
  "Decline anything that is not a fit. The sponsor is refunded in full.",
];

export default function HowSponsorshipWorksPage() {
  return (
    <Page
      theme="lime"
      current="/how-sponsorship-works"
      eyebrow="How sponsorship works"
      title="How music"
      accent="sponsorship works"
      headline="md"
      strap="For musicians and the people backing them"
      intro={
        <>
          <p className="text-[clamp(18px,2.2vw,22px)] leading-[1.5]">
            Door Money helps fans, local businesses and brands fund working musicians through practical sponsorships,
            connected to the places the music already goes: the stage, the merch table, the newsletter, the feed.
          </p>
          <p className="mt-5 max-w-[55ch]">
            Musicians choose what they offer, set their own prices, and approve every name and logo before it appears.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <ButtonLink href="/auctions" arrow>Browse fundraisers</ButtonLink>
            <ButtonLink href="/list" variant="ghost">Start a fundraiser</ButtonLink>
          </div>
        </>
      }
      footerNote="Prices on the sponsorship page are suggestions; each musician sets their own."
    >
      <Section>
        <SectionHead eyebrow="A clear exchange">Support the work. Get something real back.</SectionHead>
        <p className="max-w-[62ch]">
          A Door Money sponsorship is a direct exchange between a musician and a sponsor. The sponsor funds a specific
          part of the work. The musician features the sponsor in an agreed place and documents the result.
        </p>
        <p className="mt-4 max-w-[62ch] text-muted">
          This is not creative control. Musicians decide what is available, what it costs, and which sponsors they take.
        </p>
      </Section>

      <Section>
        <SectionHead eyebrow="Four steps">From a fundraiser to a paid musician</SectionHead>
        <Steps className="mt-9" steps={STEPS} size="lg" ruleFirst={false} />
      </Section>

      <Section>
        <SectionHead eyebrow="Where sponsorship appears">Sponsorship that travels with the music</SectionHead>
        <p className="max-w-[62ch]">
          A useful sponsorship does not have to interrupt the show. It can sit in the places musicians and their
          audiences already meet. Every option below is one a musician can offer today.
        </p>
        <dl className="mt-9 grid max-w-[900px] gap-px border border-line bg-line sm:grid-cols-2">
          {TERMS.map(([term, meaning]) => (
            <div key={term} className="bg-ground p-5">
              <dt className="caps text-[14px] text-accent-ink">{term}</dt>
              <dd className="mt-2 text-[15px] leading-[1.6] text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {GROUP_ORDER.map((g) => {
        const surfaces = CATALOG.filter((s) => s.group === g);
        const head = GROUP_HEADS[g];
        return (
          <Section key={g}>
            <SectionHead eyebrow={head.eyebrow}>{head.heading}</SectionHead>
            <p className="max-w-[62ch]">{head.intro}</p>
            {g === "onstage" && <StageKey surfaces={STAGE_KEY} />}
            <p className="caps mt-9 text-[14px] text-accent-ink">Suggested pricing</p>
            <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
              Every musician sets their own prices. These figures are Door Money&apos;s suggested starting points, and
              availability and pricing change from fundraiser to fundraiser.
            </p>
            <div className="mt-7 grid gap-[26px] md:grid-cols-2">
              {surfaces.map((s) => (
                <OptionCard key={s.key} surface={s} hero={HERO_KEYS.has(s.key)} diagram={DIAGRAMS[s.key]} />
              ))}
            </div>
            {g === "online" && (
              <p className="mt-6 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
                Touring musicians price a fundraiser per tour, typically 15 to 25 shows. House acts price per month and
                soloists per season. Longer fundraisers and bigger rooms scale per date, so nobody renegotiates.
              </p>
            )}
          </Section>
        );
      })}

      <Section>
        <SectionHead eyebrow="Category exclusivity">One musician. One category.</SectionHead>
        <div className="edge glow mt-9 max-w-[760px] bg-accent text-on-accent px-7 py-[30px]">
          <div className="heading text-[24px]">Priced by the musician, like everything else here</div>
          <p className="mt-2 text-[15px] leading-[1.6]">
            A coffee company may not want another coffee company on the same fundraiser. A guitar brand may want the
            gear category to itself. Musicians can make that exclusivity available, and price it accordingly.
          </p>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Musicians stay in control">The musician makes the final call</SectionHead>
        <p className="max-w-[62ch]">
          Musicians choose which sponsorships to offer, set their prices, and decide which sponsors fit the work. A
          sponsorship supports the music. It buys no say in it.
        </p>
        <ul className="edge glow mt-[30px] max-w-[600px] bg-panel px-7 py-[26px] text-[15px] leading-[2.1]">
          {CONTROL.map((line) => (
            <li key={line}>
              <span aria-hidden="true" className="text-accent-ink">&#9642;</span> {line}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <SectionHead eyebrow="Sponsors receive proof">Support that can be pointed at</SectionHead>
        <p className="max-w-[62ch]">
          A sponsor should know what the money made possible and where the sponsorship appeared. Every fundraiser names
          the ways its musician will document the placement, before anyone pays. These are the methods a musician can
          choose from:
        </p>
        <ul className="mt-9 grid max-w-[900px] gap-px border border-line bg-line sm:grid-cols-2">
          {VERIFICATION_METHODS.map((m) => (
            <li key={m.key} className="grid grid-cols-[26px_1fr] items-start gap-4 bg-ground p-5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center border border-accent bg-accent text-[16px] leading-none text-on-accent"
              >
                &#10003;
              </span>
              <span className="min-w-0">
                <b className="block text-[15px] font-medium leading-[1.45]">{m.label}</b>
                <span className="mt-1.5 block text-[15px] leading-[1.6] text-muted">{m.note}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
          Each fundraiser lists the ones its musician picked, and only those. Documentation comes from the musician and
          appears in the Door Money record at the end of the fundraiser, alongside the dates played and the rooms.
        </p>
      </Section>

      <NewsletterCTA source="how-sponsorship-works" />

      <Section className="pb-24">
        <SectionHead eyebrow="Get started">Put money behind the music.</SectionHead>
        <p className="max-w-[62ch]">
          Find a musician whose work is worth keeping on the road, or open a fundraiser that gives people a real way to
          back the music.
        </p>
        <div className="mt-[30px] flex flex-wrap gap-5">
          <ButtonLink href="/auctions" arrow>Browse fundraisers</ButtonLink>
          <ButtonLink href="/list" variant="ghost">Start a fundraiser</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}

/** Head-on stage drawing with the onstage placements numbered, plus the key underneath. */
function StageKey({ surfaces }: { surfaces: Surface[] }) {
  return (
    <div className="edge glow mt-[34px] bg-panel px-[22px] pb-[18px] pt-[22px]">
      <StageSchematic />
      <div className="caps mt-4 grid grid-cols-2 gap-x-[18px] gap-y-1.5 border-t border-line pt-3 text-[14px] text-muted min-[701px]:grid-cols-3">
        {surfaces.map((s, i) => (
          <div key={s.key}>
            <b className="mr-1.5 font-sans font-bold text-accent-ink">{i + 1}</b>
            {s.name}
          </div>
        ))}
        <div>The filled shape is the sponsored placement.</div>
      </div>
    </div>
  );
}

function OptionCard({ surface: s, hero, diagram }: { surface: Surface; hero: boolean; diagram?: ReactNode }) {
  return (
    <div className={`edge glow px-6 py-[26px] ${hero ? "col-span-full lit bg-panel" : "bg-panel"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3.5">
        <h3 className={`heading leading-[1.05] ${hero ? "text-[clamp(26px,3.6vw,36px)]" : "text-[24px]"}`}>{s.name}</h3>
        <div className="caps whitespace-nowrap text-[15px] text-accent-ink">
          from {formatMoney(s.defaultPriceCents)} {PER[s.period]}
        </div>
      </div>
      <p className="mt-2.5 max-w-none text-[15px] leading-[1.65] text-muted">{s.blurb}</p>
      <dl className="mt-3.5 grid gap-1 border-t border-line pt-2.5 text-[14px] leading-[1.9]">
        <div>
          <dt className="inline text-accent-ink">Placement seen by:</dt>{" "}
          <dd className="inline">{s.seenBy}.</dd>
        </div>
        <div>
          <dt className="sr-only">Offered by</dt>
          <dd className="text-muted">{fitLabel(s.appliesTo)}.</dd>
        </div>
      </dl>
      {diagram && (
        <div className="mt-[18px]">
          <div className="edge bg-panel p-1.5">{diagram}</div>
        </div>
      )}
    </div>
  );
}
