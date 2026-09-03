import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { HeroArt } from "@/components/HeroArt";
import { Theme } from "@/components/Theme";
import { WaitlistForm } from "@/components/WaitlistForm";
import { CATALOG } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { HOUSE_RULES, SITE } from "@/lib/site";

const HOME_SURFACES = ["kick_head", "case_sticker", "strap", "tip_jar_card", "merch_runner", "posts_email"];

export default function HomePage() {
  const featured = HOME_SURFACES.map((k) => CATALOG.find((s) => s.key === k)!);

  return (
    <Theme name="blue">
      <Nav current="/" />
      <main id="main" className="flex-1">

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <HeroArt theme="blue" photo="saxophone" />
        <div className="relative mx-auto flex min-h-[min(calc(100svh-82px),860px)] w-full max-w-[1120px] flex-col justify-center px-7 pb-12 pt-20">
          <Eyebrow className="mb-9">{SITE.strap}</Eyebrow>
          <h1 className="display max-w-[11ch] text-[clamp(50px,8.4vw,108px)] leading-[0.96]">
            Put money behind the <em className="text-accent-ink">music.</em>
          </h1>
          <p className="caps mt-9 max-w-[44ch] text-[14.5px] leading-[2]">{SITE.taglineSecond}</p>
          <p className="mt-5 max-w-[50ch] text-[16px] leading-[1.7] text-muted">
            Local businesses and gear brands put money behind working musicians. A name on the kick drum, the road
            cases, the tip jar, or a post. Small sums, but they cover the gas, the rooms, and the difference between a
            run that happens and a run that doesn&apos;t.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <ButtonLink href="/placements" arrow>Become a patron</ButtonLink>
            <ButtonLink href="/list" variant="ghost">List an act</ButtonLink>
          </div>
          <div className="caps mt-auto flex items-end justify-between gap-4 pt-20 text-[14px] text-muted">
            <span>Acts. Patrons. Together.</span>
            <span aria-hidden="true" className="text-[22px] leading-none">&darr;</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <Section>
        <SectionHead eyebrow="How it works">What sponsorship does for a band</SectionHead>
        <div className="mt-12 grid gap-x-16 gap-y-12 md:grid-cols-2">
          <Steps
            audience="For bands"
            steps={[
              ["Musicians list their surfaces", "Kick head, case spots, straps, tip jar, posts. Musicians set the prices and keep the final say. Nothing goes up without their yes."],
              ["A patron backs the run", "A local business or a gear brand takes a surface and puts the money up before the first show."],
              ["The money reaches the musician", "Payment reaches the band as the run happens, every week. No invoices, no chasing, no waiting on a check."],
            ]}
          />
          <Steps
            audience="For patrons"
            steps={[
              ["Pick a band", "The Sunday band at the corner bar, a touring act coming through, or a whole neighborhood circuit of rooms."],
              ["Door Money holds the money", "Door Money charges nothing until the placement actually runs, at a real show, in front of a real crowd. A placement that never goes up never costs a patron a cent."],
              ["Patrons see where it went", "A record of the whole run: the shows the band played, the rooms, and how many people filled them. Support a patron can point at, not just spend."],
            ]}
          />
        </div>
      </Section>

      {/* What's for sale */}
      <Section className="pool">
        <SectionHead eyebrow="What's for sale">Small placements, priced flat</SectionHead>
        <div className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <div key={s.key} className="flex flex-col bg-ground p-7">
              <div className="heading text-[24px] leading-[1.1]">{s.name}</div>
              <div className="caps mt-2 text-[14px] text-accent-ink">
                from {formatMoney(s.defaultPriceCents)} a {s.period}
              </div>
              <p className="mt-4 max-w-none text-[15px] leading-[1.6] text-muted">{s.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mt-7 max-w-[62ch] text-[15px] text-muted">
          Each band sets its own prices, per tour or per month. Every placement needs the band&apos;s yes, and patrons
          put the money up before the first show.
        </p>
        <div className="mt-7">
          <ButtonLink href="/placements" variant="ghost" arrow>All placements and prices</ButtonLink>
        </div>
      </Section>

      {/* House rules */}
      <Section>
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
          <div>
            <SectionHead eyebrow="House rules">The rules everyone plays by</SectionHead>
            <p className="text-muted">Five lines, the same on every board. They keep bands safe and keep a placement worth buying.</p>
          </div>
          <ol className="glow bg-panel px-8 py-4 max-md:px-6">
            {HOUSE_RULES.map((r, i) => (
              <li key={r} className={`grid grid-cols-[48px_1fr] items-baseline gap-4 py-5 text-[clamp(15px,1.8vw,17px)] leading-[1.55] ${i ? "border-t border-line" : ""}`}>
                <span className="heading text-[24px] text-accent-ink">{String(i + 1).padStart(2, "0")}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* Waitlist */}
      <Section id="list" className="pool">
        <SectionHead eyebrow="Get on the list">First fifty bands, first fifty patrons</SectionHead>
        <p className="text-muted">
          {SITE.name} is opening in {SITE.city} first: the bands, the residencies, the corner bars, the neighborhood
          patrons. Musicians and patrons who leave a name here get an email when it opens.
        </p>
        <div className="mt-9 max-w-[560px]">
          <WaitlistForm />
        </div>
      </Section>

      </main>
      <Footer />
    </Theme>
  );
}

function Steps({ audience, steps }: { audience: string; steps: [string, string][] }) {
  return (
    <div>
      <div className="heading mb-2 text-[26px]">{audience}</div>
      {steps.map(([title, body], i) => (
        <div key={title} className="grid grid-cols-[52px_1fr] gap-4 border-t border-line py-5">
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
