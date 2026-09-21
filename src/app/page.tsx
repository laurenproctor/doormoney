import type { CSSProperties } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { HeroArt } from "@/components/HeroArt";
import { Theme } from "@/components/Theme";
import { NewsletterCTA } from "@/components/Newsletter";
import { StartingCategories } from "@/components/StartingCategories";
import { CategoryBadge } from "@/components/domain";
import { boardWorth, listOpenBoards, openSpots } from "@/lib/boards";
import { getCategoryLabels } from "@/lib/category-registry";
import { formatMoney } from "@/lib/money";
import { fundraiserLine } from "@/lib/periods";
import { organizerLabel } from "@/lib/categories";
import { HOUSE_RULES, SITE } from "@/lib/site";
import { runPath } from "@/lib/urls";

/**
 * Where a sponsor can appear, by kind of place and never by one category's inventory. The home page
 * used to show music's catalog here, with music's suggested prices, which told a team or a
 * filmmaker that a kick drum head was the product. Prices live on a fundraiser, set by its organizer.
 */
const PLACEMENT_KINDS: [string, string][] = [
  ["Physical placements", "On equipment, uniforms, signage or a venue, wherever the organizer has the authority to offer it."],
  ["Printed credits", "In a program, on a poster, or in the materials an audience takes home."],
  ["Digital placements", "On a website, in an email to the audience, or in agreed posts."],
  ["Part of the production", "An agreed credit, a spoken thank-you, or specifically approved product placement."],
];

/*
  The page runs in this order: the idea, the organizers raising now, the starting categories, how it
  works for each side, where a sponsor can appear, the organizer's final say beside the house rules,
  then the two ways in. It is a shared page: it names organizers and sponsors, never one category.
*/
export default async function HomePage() {
  const [all, labels] = await Promise.all([listOpenBoards(), getCategoryLabels()]);
  const boards = all.slice(0, 3);

  return (
    <Theme name="blue">
      <Nav current="/" />
      <main id="main" className="flex-1">

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <HeroArt theme="blue" photo="saxophone" />
        <div className="hero-in relative mx-auto flex min-h-[min(calc(100svh-82px),860px)] w-full max-w-[1120px] flex-col justify-center px-7 pb-12 pt-20">
          <Eyebrow className="mb-9">{SITE.strap}</Eyebrow>
          <h1 className="display max-w-[13ch] text-[clamp(46px,7.6vw,98px)] leading-[0.96]">
            Put money behind work people <em className="text-accent-ink">care about.</em>
          </h1>
          <p className="caps mt-9 max-w-[52ch] text-[14.5px] leading-[2]">{SITE.taglineSecond}</p>
          <p className="mt-5 max-w-[52ch] text-[16px] leading-[1.7] text-muted">
            Sponsors receive specified visibility in the places the work already reaches. Every fundraiser says what
            the funding enables, who the audience is and what a sponsor can count on receiving.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <ButtonLink href="/auctions" arrow>Find a sponsorship</ButtonLink>
            <ButtonLink href="/list" variant="ghost">Create a fundraiser</ButtonLink>
          </div>
          <div className="caps mt-auto flex items-end justify-between gap-4 pt-20 text-[14px] text-muted">
            <span>{SITE.signoff}</span>
            <span aria-hidden="true" className="text-[22px] leading-none">&darr;</span>
          </div>
        </div>
      </section>

      {/* The idea */}
      <Section>
        <div className="grid gap-12 md:grid-cols-[1.2fr_1fr] md:gap-20">
          <div>
            <SectionHead eyebrow="Relevant audiences">Good work gathers an audience. Most of that attention never becomes funding.</SectionHead>
          </div>
          <div className="grid content-center gap-5 text-[clamp(16px,1.9vw,19px)] leading-[1.6]">
            <p className="max-w-none">
              A gear company can sponsor the musicians already using its products. A clinic can put its name behind a
              local team&apos;s season. A camera shop can take a credit on a documentary. A cafe can appear in a
              theater program.
            </p>
            <p className="max-w-none">
              Door Money turns those relationships into funding for the work, with a clear statement of what the
              sponsor receives in return.
            </p>
          </div>
        </div>
      </Section>

      {/* Open fundraisers */}
      {boards.length > 0 && (
        <Section className="pool">
          <SectionHead eyebrow="Open fundraisers">Organizers raising now</SectionHead>
          <div className="mt-10 grid gap-px bg-line md:grid-flow-col md:auto-cols-fr">
            {boards.map((b, i) => {
              return (
                <Link
                  key={b.act.slug}
                  href={runPath(b.act.slug, b.run.slug)}
                  data-reveal
                  style={{ "--i": i } as CSSProperties}
                  className="lift flex flex-col gap-3 bg-ground p-7 text-ink no-underline"
                >
                  <CategoryBadge category={{ key: b.run.categoryKey, label: labels[b.run.categoryKey] }} className="self-start" />
                  <span className="caps text-[14px] text-accent-ink">{organizerLabel(b.run.categoryKey, b.act.type, b.act.city)}</span>
                  <span className="heading text-[clamp(24px,2.6vw,30px)] leading-[1.05]">{b.act.name}</span>
                  <span className="caps text-[14px] leading-[1.7] text-muted">
                    {fundraiserLine(b.run)}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-7 gap-y-3 border-t border-line pt-4">
                    <Stat value={formatMoney(boardWorth(b))} label="sold and current bids" />
                    <Stat value={String(openSpots(b))} label="sponsorship options open" />
                  </span>
                  <span className="caps mt-1 text-[14px] text-accent-ink">See the fundraiser &rarr;</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-7">
            <ButtonLink href="/auctions" variant="ghost" arrow>All fundraisers</ButtonLink>
          </div>
        </Section>
      )}

      {/* The starting categories */}
      <StartingCategories labels={labels} />

      {/* New fundraisers by email */}
      <NewsletterCTA source="home" />

      {/* How it works */}
      <Section>
        <SectionHead eyebrow="How it works">Funding for the work, visibility for the sponsor</SectionHead>
        <div className="mt-12 grid gap-x-16 gap-y-12 md:grid-cols-2">
          <Steps
            audience="For organizers"
            steps={[
              ["Organizers say what the funding enables", "Travel, equipment, a production, a season. The organizer names the purpose, describes the audience and chooses which sponsorship options to offer."],
              ["Organizers set the terms", "Each option has the organizer's own price, fixed or open to bids, and states what the sponsor receives."],
              ["Organizers approve, deliver and document", "No sponsor's materials appear without the organizer's approval. The organizer delivers the placement and documents it for the sponsor's record."],
            ]}
          />
          <Steps
            audience="For sponsors"
            steps={[
              ["Find work with a relevant audience", "A fundraiser describes who the work reaches. Door Money guarantees no audience size, sales or results."],
              ["Choose a sponsorship option", "The offer states what the sponsor receives and how the organizer will document it, before anyone pays."],
              ["Keep the record", "The record shows what was purchased, what the organizer delivered and the evidence the organizer supplied."],
            ]}
          />
        </div>
      </Section>

      {/* Where a sponsor can appear */}
      <Section className="pool">
        <SectionHead eyebrow="Where a sponsor appears">Visibility in the places the work already reaches</SectionHead>
        <p className="text-muted">Sponsors receive specified visibility in the places the work already reaches. These are kinds of placement, not a price list: each organizer decides what to offer.</p>
        <div className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {PLACEMENT_KINDS.map(([name, body], i) => (
            <div key={name} data-reveal style={{ "--i": i } as CSSProperties} className="lift flex flex-col bg-ground p-7">
              <div className="heading text-[24px] leading-[1.1]">{name}</div>
              <p className="mt-4 max-w-none text-[15px] leading-[1.6] text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-7 max-w-[62ch] text-[15px] text-muted">
          Organizers set their own prices and offer only the placements they have the authority to deliver. A
          sponsorship is not an investment, a donation or a promise of sales.
        </p>
        <div className="mt-7">
          <ButtonLink href="/how-sponsorship-works" variant="ghost" arrow>How sponsorship works</ButtonLink>
        </div>
      </Section>

      {/* The organizer's call, and the house rules */}
      <Section>
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
          <div>
            <SectionHead eyebrow="The organizer's call">The organizer always has the final say</SectionHead>
            <p className="text-muted">
              Organizers choose what goes into their fundraiser, set the prices, approve every sponsor&apos;s materials
              and decide what appears beside their name. Sponsors see exactly what they are buying. The marketplace
              works because neither side gets to exploit the other.
            </p>
          </div>
          <div>
            <Eyebrow className="mb-4">House rules</Eyebrow>
            <ol className="glow bg-panel px-8 py-4 max-md:px-6">
              {HOUSE_RULES.map((r, i) => (
                <li key={r} className={`grid grid-cols-[48px_1fr] items-baseline gap-4 py-5 text-[clamp(15px,1.8vw,17px)] leading-[1.55] ${i ? "border-t border-line" : ""}`}>
                  <span className="heading text-[24px] text-accent-ink">{String(i + 1).padStart(2, "0")}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* Two ways in */}
      <Section id="list" className="pool">
        <SectionHead eyebrow="Get started">Find a sponsorship, or create a fundraiser</SectionHead>
        <p className="text-muted">
          Sponsors pick a fundraiser, read what the sponsorship includes and put money behind it. Organizers say what
          the funding enables, describe the audience and publish when the fundraiser is ready. {SITE.origin}
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
          <ButtonLink href="/auctions" arrow>Find a sponsorship</ButtonLink>
          <ButtonLink href="/list" variant="ghost">Create a fundraiser</ButtonLink>
        </div>
      </Section>

      </main>
      <Footer />
    </Theme>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="block">
      <b className="heading block text-[22px] leading-none">{value}</b>
      <span className="caps mt-1 block text-[14px] text-muted">{label}</span>
    </span>
  );
}

function Steps({ audience, steps }: { audience: string; steps: [string, string][] }) {
  return (
    <div>
      <div className="heading mb-2 text-[26px]">{audience}</div>
      {steps.map(([title, body], i) => (
        <div key={title} data-reveal style={{ "--i": i } as CSSProperties} className="grid grid-cols-[52px_1fr] gap-4 border-t border-line py-5">
          <div className="heading text-[28px] leading-none text-accent-ink">{String(i + 1).padStart(2, "0")}</div>
          <div>
            <b className="block text-[16px] font-medium">{title}</b>
            <p className="max-w-none text-[15px] leading-[1.6] text-muted">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
