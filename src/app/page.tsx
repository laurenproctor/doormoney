import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Section, SectionHead, Stamp, Tape } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { WaitlistForm } from "@/components/WaitlistForm";
import { CATALOG } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { HOUSE_RULES, SITE } from "@/lib/site";

const HOME_SURFACES = ["kick_head", "case_sticker", "strap", "tip_jar_card", "merch_runner", "posts_email"];

export default function HomePage() {
  const featured = HOME_SURFACES.map((k) => CATALOG.find((s) => s.key === k)!);

  return (
    <>
      <Nav current="/" />

      {/* Hero */}
      <div className="relative mx-auto max-w-[1020px] px-7 pb-[84px] pt-[92px]">
        <Tape className="mb-8">{SITE.strap}</Tape>
        <div className="poster text-[clamp(76px,15vw,196px)] leading-[0.86]">
          <span className="block">Door</span>
          <span className="block text-red">Money</span>
        </div>
        <p className="typewriter mt-6 text-[clamp(19px,2.6vw,26px)]">{SITE.tagline}</p>
        <p className="mt-5 max-w-[54ch] text-[17px]">
          Local businesses and gear brands put money behind working musicians. A name on the kick drum, the road
          cases, the tip jar, or a post. Small sums, but they cover the gas, the rooms, and the difference between a
          run that happens and a run that doesn&apos;t.
        </p>
        <div className="mt-[38px] flex flex-wrap gap-[22px]">
          <ButtonLink href="/list">List an act</ButtonLink>
          <ButtonLink href="/placements" variant="ghost">Become a patron</ButtonLink>
        </div>
        <Stamp className="absolute right-7 top-[92px] max-[860px]:hidden">
          DOOR MONEY<br />PAID<br />AT THE DOOR
        </Stamp>
      </div>

      {/* How it works */}
      <Section>
        <SectionHead eyebrow="How it works">What sponsorship does for a band</SectionHead>
        <div className="mt-9 grid gap-[30px] md:grid-cols-2">
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
      <Section>
        <SectionHead eyebrow="What's for sale">Small placements, priced flat</SectionHead>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <div key={s.key} className="hard-border hard-shadow-sm bg-white p-5">
              <div className="poster text-[22px] leading-tight">{s.name}</div>
              <div className="typewriter mt-1 text-[13px] text-red">
                from {formatMoney(s.defaultPriceCents)} a {s.period}
              </div>
              <p className="mt-2.5 max-w-none text-[14px] leading-[1.6] text-gray">{s.blurb}</p>
            </div>
          ))}
        </div>
        <p className="typewriter mt-6 text-[14px] text-gray">
          Each band sets its own prices, per tour or per month. Every placement needs the band&apos;s yes, and patrons
          put the money up before the first show.
        </p>
        <div className="mt-6">
          <ButtonLink href="/placements" variant="ghost">All placements and prices</ButtonLink>
        </div>
      </Section>

      {/* House rules */}
      <Section>
        <SectionHead eyebrow="House rules">The rules everyone plays by</SectionHead>
        <ol className="hard-border relative mt-8 max-w-[720px] bg-cream px-[42px] py-[46px] shadow-[9px_9px_0_var(--black)] max-md:px-[22px] max-md:py-8">
          {HOUSE_RULES.map((r, i) => (
            <li
              key={r}
              className={`typewriter flex items-baseline gap-4 py-[11px] text-[clamp(15px,2vw,18px)] leading-[1.5] ${
                i ? "border-t-2 border-dashed border-[#A79D8A]" : ""
              }`}
            >
              <span className="poster text-[14px] text-red">x</span>
              {r}
            </li>
          ))}
        </ol>
      </Section>

      {/* Waitlist */}
      <Section id="list">
        <SectionHead eyebrow="Get on the list">First fifty bands, first fifty patrons</SectionHead>
        <p className="text-gray">
          {SITE.name} is opening in {SITE.city} first: the bands, the residencies, the corner bars, the neighborhood
          patrons. Musicians and patrons who leave a name here get an email when it opens.
        </p>
        <div className="mt-8 max-w-[560px]">
          <WaitlistForm />
        </div>
      </Section>

      <Footer />
    </>
  );
}

function Steps({ audience, steps }: { audience: string; steps: [string, string][] }) {
  return (
    <div>
      <div className="poster mb-[18px] text-[24px]">{audience}</div>
      {steps.map(([title, body], i) => (
        <div key={title} className="grid grid-cols-[44px_1fr] gap-4 border-t-2 border-dashed border-gray py-4">
          <div className="poster text-[26px] text-red">{i + 1}</div>
          <div>
            <b className="block text-[16px]">{title}</b>
            <p className="max-w-none text-[14.5px] leading-[1.6] text-gray">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
