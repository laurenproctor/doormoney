import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { Section, SectionHead, Steps } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { NewsletterCTA } from "@/components/Newsletter";
import { StartingCategories } from "@/components/StartingCategories";
import { getCategoryLabels } from "@/lib/category-registry";
import { SITE } from "@/lib/site";
import { STARTING_CATEGORIES_LIST } from "@/lib/starting-categories";

const DESCRIPTION =
  `How Door Money works: organizers fund work with a clear purpose, and sponsors receive the visibility described in the offer. Starting with ${STARTING_CATEGORIES_LIST}, and growing.`;

export const metadata: Metadata = {
  title: { absolute: "How Sponsorship Works | Door Money" },
  description: DESCRIPTION,
  alternates: { canonical: "/how-sponsorship-works" },
  openGraph: { type: "website", url: "/how-sponsorship-works", title: "How Sponsorship Works | Door Money", description: DESCRIPTION },
};

/*
  The page that explains the exchange to both sides, for every category: the organizer deciding
  whether to open a fundraiser, and the person or business deciding whether to sponsor one.

  It names no category's inventory and no category's payout rule. Music's options, suggested prices
  and stage drawing live one level down, at /how-sponsorship-works/music, and say they are music's.
  Delivery and release differ by category (docs/DELIVERY_POLICY_MATRIX.md), so this page says only
  that each fundraiser states its own terms. It lists no documentation methods either: those live in
  src/lib/verification.ts and reach a fundraiser's page through PlacementVerification. See CLAUDE.md,
  "No invented proof".
*/

const STEPS: [string, string][] = [
  [
    "An organizer opens a fundraiser",
    "The organizer says what the funding enables, describes the audience, and picks which sponsorship options to offer at prices they set themselves.",
  ],
  [
    "A sponsor chooses a sponsorship option",
    "A person or a business picks an option and pays Door Money. Each sponsorship is either fixed-price or open to bids; the organizer decides which.",
  ],
  [
    "The organizer approves the sponsor's materials",
    "The sponsor sends what the placement needs: a name, a credit line, artwork. No sponsor's materials appear without the organizer's approval.",
  ],
  [
    "The organizer delivers the promised placement",
    "The organizer delivers what the offer described, in the place and the window it named, and documents it.",
  ],
  [
    "Door Money documents delivery and releases funds",
    "Door Money holds the money, passes the organizer's documentation on to the sponsor's record, and releases funds according to the fundraiser's terms.",
  ],
];

/** What the words on this page mean, so nothing on it has to be guessed at. */
const TERMS: [string, string][] = [
  ["Sponsorship option", "A priced offer describing the visibility available. The organizer chooses which ones to offer."],
  ["Placement", "Where the sponsor appears. It may be physical, digital, printed, or part of a production."],
  ["Deliverable", "A specific promised appearance or action, with a due date or a delivery window."],
  ["Materials", "What the sponsor sends so the placement can happen: a name, a credit line, artwork, product information."],
  ["Evidence", "The organizer's documentation that a deliverable happened. It is not a Door Money certification."],
  ["Record", "The sponsor's summary of the purchased offer, the delivery, the evidence and the payment outcomes."],
];

/** Kinds of place, never one category's inventory. An organizer offers only what they have the authority to deliver. */
const PLACEMENTS: [string, string][] = [
  ["Physical placements", "On equipment, uniforms or other things the audience sees, where the organizer controls them."],
  ["Digital placements", "On a website, in a video, or in agreed posts on the organizer's own channels."],
  ["Printed credits", "A name or a credit line in a program, on a poster, or in printed materials."],
  ["Venue or event visibility", "Signage or a presence where the activity happens, with the venue's permission where it is needed."],
  ["Production-specific visibility", "An agreed credit on the work itself, or a thank-you that is part of it."],
  ["Approved product placement", "A product appearing in the work, only where that is specifically agreed."],
  ["Audience-facing communications", "A mention in the emails and announcements the audience already receives."],
];

const CONTROL: string[] = [
  "Choose which sponsorship options to offer.",
  "Set the price on every one of them.",
  "Accept or decline a sponsor's materials before anything appears.",
  "Choose how delivery will be documented.",
  "Offer only placements they have the authority to deliver.",
];

const NOT_PROMISED: string[] = [
  "Sales, customers or a commercial return.",
  "Audience growth, impressions or a measured reach that nobody measured.",
  "Distribution, festival acceptance or any result outside the organizer's control.",
  "A Door Money inspection. Documentation comes from the organizer, and Door Money passes it on.",
];

export default async function HowSponsorshipWorksPage() {
  const labels = await getCategoryLabels();
  return (
    <Page
      theme="lime"
      current="/how-sponsorship-works"
      eyebrow={SITE.strap}
      title="How"
      accent="sponsorship works"
      headline="md"
      strap="For organizers and the sponsors behind them"
      intro={
        <>
          <p className="text-[clamp(18px,2.2vw,22px)] leading-[1.5]">
            Organizers fund work with a clear purpose. Sponsors receive the visibility described in the offer, in the
            places the work already reaches.
          </p>
          <p className="mt-5 max-w-[55ch]">
            Organizers choose what they offer, set their own prices, and approve every sponsor&apos;s materials before
            anything appears.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <ButtonLink href="/fundraisers" arrow>Find a sponsorship</ButtonLink>
            <ButtonLink href="/list" variant="ghost">Create a fundraiser</ButtonLink>
          </div>
        </>
      }
    >
      <Section>
        <SectionHead eyebrow="A clear exchange">Support the work. Get something specific back.</SectionHead>
        <p className="max-w-[62ch]">
          A Door Money sponsorship is a direct exchange between an organizer and a sponsor. The sponsor funds a named
          piece of work. The organizer features the sponsor in an agreed place and documents that it happened.
        </p>
        <p className="mt-4 max-w-[62ch] text-muted">
          Every fundraiser answers three questions before anyone pays: what the funding enables, who the audience is,
          and what the sponsor receives. A sponsorship is not a donation, an investment or a share of the work, and it
          buys no say in it.
        </p>
      </Section>

      <Section>
        <SectionHead eyebrow="Five steps">From a fundraiser to a delivered sponsorship</SectionHead>
        <Steps className="mt-9" steps={STEPS} size="lg" ruleFirst={false} />
        <p className="mt-7 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
          Release terms are not the same in every category. Each fundraiser states its own delivery and release
          terms, and a sponsor sees them before paying.
        </p>
      </Section>

      <StartingCategories labels={labels} heading="Where Door Money starts" />

      <Section>
        <SectionHead eyebrow="Where sponsorship appears">Visibility in the places the work already reaches</SectionHead>
        <p className="max-w-[62ch]">
          A useful sponsorship does not have to interrupt the work. It can sit where an organizer and an audience
          already meet. These are kinds of placement, not a list of what every fundraiser offers: an organizer chooses
          the options, and a fundraiser lists only those.
        </p>
        <ul className="mt-9 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {PLACEMENTS.map(([name, body]) => (
            <li key={name} className="bg-ground p-6">
              <b className="heading block text-[20px] font-medium leading-[1.2]">{name}</b>
              <span className="mt-2 block text-[15px] leading-[1.6] text-muted">{body}</span>
            </li>
          ))}
        </ul>
        <p className="mt-7 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
          Door Money suggests prices only where it has a sales history to suggest from. Today that is music, and the
          music options are on their own page. Everywhere, the organizer&apos;s own price is the price.
        </p>
        <div className="mt-6">
          <ButtonLink href="/how-sponsorship-works/music" variant="ghost" arrow>Music options and suggested prices</ButtonLink>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="The words on this page">Six terms, in plain language</SectionHead>
        <dl className="mt-9 grid max-w-[900px] gap-px border border-line bg-line sm:grid-cols-2">
          {TERMS.map(([term, meaning]) => (
            <div key={term} className="bg-ground p-5">
              <dt className="caps text-[14px] text-accent-ink">{term}</dt>
              <dd className="mt-2 text-[15px] leading-[1.6] text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section>
        <SectionHead eyebrow="Organizers stay in control">The organizer makes the final call</SectionHead>
        <p className="max-w-[62ch]">
          Organizers choose which sponsorships to offer, set their prices, and decide which sponsors fit the work. A
          sponsorship supports the work. It buys no say in it.
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
        <SectionHead eyebrow="What a sponsor can count on">Support that can be pointed at</SectionHead>
        <p className="max-w-[62ch]">
          A sponsor should know what the money made possible and where the sponsorship appeared. Every fundraiser
          names the ways its organizer will document delivery, before anyone pays, and lists only those. The
          sponsor&apos;s record keeps the purchased offer, what was delivered and the evidence the organizer supplied.
        </p>
        <p className="caps mt-9 text-[14px] text-accent-ink">What Door Money does not promise</p>
        <ul className="mt-3 grid max-w-[62ch] gap-1.5 text-[15px] leading-[1.7] text-muted">
          {NOT_PROMISED.map((line) => (
            <li key={line}>
              <span aria-hidden="true" className="text-accent-ink">&#9642;</span> {line}
            </li>
          ))}
        </ul>
      </Section>

      <NewsletterCTA source="how-sponsorship-works" />

      <Section className="pb-24">
        <SectionHead eyebrow="Get started">{SITE.tagline}</SectionHead>
        <p className="max-w-[62ch]">
          Sponsors find work with an audience that fits. Organizers open a fundraiser that gives sponsors a clear
          reason to put money behind the work.
        </p>
        <div className="mt-[30px] flex flex-wrap gap-5">
          <ButtonLink href="/fundraisers" arrow>Find a sponsorship</ButtonLink>
          <ButtonLink href="/list" variant="ghost">Create a fundraiser</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}
