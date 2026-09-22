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

/*
  The page runs in this order: what Door Money is, the organizers raising now, the exchange for each
  side, the starting categories, the house rules, the email, and the two ways in.

  It introduces the product and stops there. The kinds of placement, the glossary and what Door
  Money does not promise live on /how-sponsorship-works, which is the page for somebody who wants
  all of it. It is a shared page: it names organizers and sponsors, never one category.
*/
export default async function HomePage() {
  const [all, labels] = await Promise.all([listOpenBoards(), getCategoryLabels()]);
  const boards = all.slice(0, 3);

  return (
    <Theme name="blue">
      <Nav current="/" />
      <main id="main" className="flex-1">

      {/* Hero: the line, one sentence, the two ways in. */}
      <section className="relative overflow-hidden border-b border-line">
        <HeroArt theme="blue" photo="saxophone" />
        <div className="hero-in relative mx-auto flex min-h-[min(calc(100svh-82px),860px)] w-full max-w-[1120px] flex-col justify-center px-7 pb-12 pt-20">
          <Eyebrow className="mb-9">{SITE.strap}</Eyebrow>
          <h1 className="display max-w-[13ch] text-[clamp(46px,7.6vw,98px)] leading-[0.96]">
            Put money behind work people <em className="text-accent-ink">care about.</em>
          </h1>
          <p className="mt-9 max-w-[54ch] text-[clamp(17px,2vw,19px)] leading-[1.6]">
            Sponsors support work that reaches the audiences they care about, and receive the visibility described
            in the offer.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <ButtonLink href="/fundraisers" arrow>Find a sponsorship</ButtonLink>
            <ButtonLink href="/list" variant="ghost">Create a fundraiser</ButtonLink>
          </div>
          <div className="caps mt-auto flex items-end justify-between gap-4 pt-20 text-[14px] text-muted">
            <span>{SITE.signoff}</span>
            <span aria-hidden="true" className="text-[22px] leading-none">&darr;</span>
          </div>
        </div>
      </section>

      {/* What Door Money is */}
      <Section>
        <div className="grid gap-12 md:grid-cols-[1.2fr_1fr] md:gap-20">
          <div>
            <SectionHead eyebrow="What Door Money is">Work that gathers an audience can be sponsored</SectionHead>
          </div>
          <div className="grid content-center gap-5 text-[clamp(16px,1.9vw,19px)] leading-[1.6]">
            <p className="max-w-none">
              A gear company can sponsor the musicians already using its products. A clinic can put its name behind a
              local team&apos;s season. A camera shop can take a credit on a documentary. A cafe can appear in a
              theater program.
            </p>
            <p className="max-w-none">
              Door Money turns those relationships into funding, with a clear statement of what the sponsor receives.
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
            <ButtonLink href="/fundraisers" variant="ghost" arrow>Find a sponsorship</ButtonLink>
          </div>
        </Section>
      )}

      {/* What each side gets */}
      <Section>
        <SectionHead eyebrow="The exchange">Funding for the work, visibility for the sponsor</SectionHead>
        <p className="max-w-[62ch] text-muted">
          Sponsors receive specified visibility in the places the work already reaches. Organizers set their own
          prices and offer only the placements they can deliver.
        </p>
        <div className="mt-12 grid gap-x-16 gap-y-12 md:grid-cols-2">
          <Steps
            audience="For organizers"
            steps={[
              ["Say what the funding enables", "Travel, equipment, a production, a season."],
              ["Set the price", "Each option carries the organizer's own price, fixed or open to bids."],
              ["Approve, deliver, document", "No sponsor's materials appear without the organizer's approval."],
            ]}
          />
          <Steps
            audience="For sponsors"
            steps={[
              ["Find a relevant audience", "Every fundraiser describes who the work reaches."],
              ["Read the offer before paying", "It states what the sponsor receives and how delivery will be documented."],
              ["Keep the record", "What was bought, what the organizer delivered, and the evidence supplied."],
            ]}
          />
        </div>
        <div className="mt-10">
          <ButtonLink href="/how-sponsorship-works" variant="ghost" arrow>How it works</ButtonLink>
        </div>
      </Section>

      {/* The starting categories */}
      <StartingCategories labels={labels} className="pool" />

      {/* The house rules */}
      <Section>
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
          <div>
            <SectionHead eyebrow="House rules">The organizer has the final say</SectionHead>
            <p className="text-muted">
              Organizers choose what goes into a fundraiser, set the prices and approve every sponsor&apos;s materials.
            </p>
          </div>
          <div>
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

      {/* New fundraisers by email */}
      <NewsletterCTA source="home" />

      {/* Two ways in */}
      <Section id="list">
        <SectionHead eyebrow="Two ways in">Find a sponsorship, or create a fundraiser</SectionHead>
        <p className="text-muted">
          Sponsors put money behind work they want to see happen. Organizers say what the funding enables and what a
          sponsor receives.
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
          <ButtonLink href="/fundraisers" arrow>Find a sponsorship</ButtonLink>
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
