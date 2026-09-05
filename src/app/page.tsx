import type { CSSProperties } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { HeroArt } from "@/components/HeroArt";
import { Theme } from "@/components/Theme";
import { NewsletterCTA } from "@/components/Newsletter";
import { boardWorth, listOpenBoards, openSpots } from "@/lib/boards";
import { CATALOG } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { periodOf } from "@/lib/periods";
import type { Board } from "@/lib/sample";
import { HOUSE_RULES, SITE } from "@/lib/site";
import { runPath } from "@/lib/urls";

const HOME_SURFACES = ["kick_head", "case_sticker", "strap", "tip_jar_card", "merch_runner", "posts_email"];

const KIND: Record<Board["act"]["type"], (city: string) => string> = {
  touring_band: () => "Band, touring",
  house_act: (city) => `House act, ${city}`,
  soloist: (city) => `Soloist, gigging ${city}`,
};

/*
  The page runs in this order: the idea, the musicians raising now, how it works for each side,
  what can be sponsored, the musician's final say beside the house rules, then the two ways in.
*/
export default async function HomePage() {
  const featured = HOME_SURFACES.map((k) => CATALOG.find((s) => s.key === k)!);
  const boards = (await listOpenBoards()).slice(0, 3);

  return (
    <Theme name="blue">
      <Nav current="/" />
      <main id="main" className="flex-1">

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <HeroArt theme="blue" photo="saxophone" />
        <div className="hero-in relative mx-auto flex min-h-[min(calc(100svh-82px),860px)] w-full max-w-[1120px] flex-col justify-center px-7 pb-12 pt-20">
          <Eyebrow className="mb-9">{SITE.strap}</Eyebrow>
          <h1 className="display max-w-[11ch] text-[clamp(50px,8.4vw,108px)] leading-[0.96]">
            Put money behind the <em className="text-accent-ink">music.</em>
          </h1>
          <p className="caps mt-9 max-w-[52ch] text-[14.5px] leading-[2]">{SITE.taglineSecond}</p>
          <p className="mt-5 max-w-[52ch] text-[16px] leading-[1.7] text-muted">
            Door Money lets businesses, brands and fans sponsor musicians in the places the work already happens: the
            kick drum and the road cases, the merch table, the mailing list and the music stand.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <ButtonLink href="/auctions" arrow>Back a musician</ButtonLink>
            <ButtonLink href="/list" variant="ghost">List an act</ButtonLink>
          </div>
          <div className="caps mt-auto flex items-end justify-between gap-4 pt-20 text-[14px] text-muted">
            <span>Musicians. Patrons. Together.</span>
            <span aria-hidden="true" className="text-[22px] leading-none">&darr;</span>
          </div>
        </div>
      </section>

      {/* The idea */}
      <Section>
        <div className="grid gap-12 md:grid-cols-[1.2fr_1fr] md:gap-20">
          <div>
            <SectionHead eyebrow="Patronage for working musicians">Musicians create value every night. Most of it never becomes income.</SectionHead>
          </div>
          <div className="grid content-center gap-5 text-[clamp(16px,1.9vw,19px)] leading-[1.6]">
            <p className="max-w-none">
              A coffee shop can back the neighborhood band. A gear company can support the musicians already using its
              products. A fan can help keep a residency alive.
            </p>
            <p className="max-w-none">
              Door Money turns those relationships into real income for musicians, without asking them to become
              influencers.
            </p>
          </div>
        </div>
      </Section>

      {/* Open fundraisers */}
      {boards.length > 0 && (
        <Section className="pool">
          <SectionHead eyebrow="Open fundraisers">Musicians raising now</SectionHead>
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
                  <span className="caps text-[14px] text-accent-ink">{KIND[b.act.type](b.act.city)}</span>
                  <span className="heading text-[clamp(24px,2.6vw,30px)] leading-[1.05]">{b.act.name}</span>
                  <span className="caps text-[14px] leading-[1.7] text-muted">
                    {b.run.title}. {b.run.showCount} {periodOf(b.run.kind).units}, {formatDateRange(b.run.startsOn, b.run.endsOn)}.
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

      {/* New fundraisers by email */}
      <NewsletterCTA source="home" />

      {/* How it works */}
      <Section>
        <SectionHead eyebrow="How it works">Money for the work musicians are already doing</SectionHead>
        <div className="mt-12 grid gap-x-16 gap-y-12 md:grid-cols-2">
          <Steps
            audience="For musicians"
            steps={[
              ["Musicians decide what they want to offer", "A kick drum. A road case. A thank-you post. A music stand. Musicians choose what goes into the fundraiser, set the price and approve every sponsor."],
              ["A patron puts money behind it", "A local business, brand or fan picks a sponsorship and pays for it before the first show."],
              ["The musician gets paid while they play", "Door Money holds the money and pays it to the musician in weekly slices as the shows happen. No invoices, no chasing, no waiting on a check."],
            ]}
          />
          <Steps
            audience="For patrons"
            steps={[
              ["Back a musician worth keeping on stage", "A touring band, a house act, a freelancer, or the soloist down the street."],
              ["Fund something real", "Pick a sponsorship and put the money behind one tour, residency or season. Door Money holds it and releases it only as the shows happen. A sponsorship that never runs costs nothing."],
              ["See what the money made possible", "The shows, the rooms and the audience the placement traveled through, and where every dollar went."],
            ]}
          />
        </div>
      </Section>

      {/* What can be backed */}
      <Section className="pool">
        <SectionHead eyebrow="What can be sponsored">Ways to back the work</SectionHead>
        <p className="text-muted">A musician has more to offer than a social post. The prices here are suggestions; each musician sets their own.</p>
        <div className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s, i) => (
            <div key={s.key} data-reveal style={{ "--i": i } as CSSProperties} className="lift flex flex-col bg-ground p-7">
              <div className="heading text-[24px] leading-[1.1]">{s.name}</div>
              <div className="caps mt-2 text-[14px] text-accent-ink">
                from {formatMoney(s.defaultPriceCents)} a {s.period}
              </div>
              <p className="mt-4 max-w-none text-[15px] leading-[1.6] text-muted">{s.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mt-7 max-w-[62ch] text-[15px] text-muted">
          Each musician sets their own prices, per fundraiser or per month. Every sponsorship needs the
          musician&apos;s yes, and patrons put the money up before the first show.
        </p>
        <div className="mt-7">
          <ButtonLink href="/how-sponsorship-works" variant="ghost" arrow>How sponsorship works</ButtonLink>
        </div>
      </Section>

      {/* The musician's call, and the house rules */}
      <Section>
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
          <div>
            <SectionHead eyebrow="The musician's call">The musician always has the final say</SectionHead>
            <p className="text-muted">
              Musicians choose what goes into their fundraiser, set the prices, approve every sponsor and decide what
              appears beside their name. The marketplace works because neither side gets to exploit the other.
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
        <SectionHead eyebrow="Get started">Back a musician, or list an act</SectionHead>
        <p className="text-muted">
          {SITE.name} runs in {SITE.city}: the bands, house acts, freelancers and soloists already making the city&apos;s
          musical life happen, and the people and businesses who want to keep them working. Patrons pick a fundraiser
          and put money behind it. Musicians open one in an afternoon.
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
          <ButtonLink href="/auctions" arrow>See the fundraisers</ButtonLink>
          <ButtonLink href="/list" variant="ghost">List an act</ButtonLink>
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
