import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Page } from "@/components/Page";
import { Lines, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { CATALOG, GROUPS, type Surface, type SurfaceGroup } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { HOUSE_RULES } from "@/lib/site";
import { DIAGRAMS, StageSchematic } from "./diagrams";

export const metadata: Metadata = { title: "The placements" };

// The page is the standard card for bands and house acts, as in the mockup. Soloist-only surfaces stay off it.
const SURFACES = CATALOG.filter((s) => s.appliesTo.includes("touring_band") || s.appliesTo.includes("house_act"));
const byGroup = (g: SurfaceGroup) => SURFACES.filter((s) => s.group === g);

/** The full-width black card at the top of a group. */
const HERO_KEYS = new Set(["kick_head", "tip_jar_card"]);

const INTROS: Record<SurfaceGroup, string> = {
  onstage:
    "A name on these surfaces rides along in every fan photo, every phone video and every review shot, night after night, for the price of one print run. Each format matches the band's own artwork, and every one needs the band's yes before it ships.",
  room:
    "The merch table and the tip jar hold a fan's attention longer than anything on the stage. People stop, read, and reach for a wallet, so a name in these spots earns more attention per dollar than any other surface a band owns. Residency placements live here too, priced monthly for house bands and resident acts.",
  online:
    "These placements carry their own numbers: post reach, email opens, video views. They travel past the room, and they make the easiest first buy for anyone who has never sponsored a band before.",
};

export default function PlacementsPage() {
  const groups = Object.keys(GROUPS) as SurfaceGroup[];
  return (
    <Page
      current="/placements"
      tape="For patrons and brands"
      title="The"
      accent="placements"
      intro={
        <>
          <p>
            Every surface a band can offer, what it costs, and who sees it. Each band sets its own prices; the figures
            here are the standard card. Door Money holds the funds until the placement runs at a real show.
          </p>
          <Lines
            className="mt-[30px]"
            lines={[
              "A patron picks a surface and puts the money up.",
              "The band plays the run.",
              "The money reaches the band as it happens.",
              "The patron gets a record of where it went.",
            ]}
          />
        </>
      }
      stamp={
        <>
          DOOR MONEY<br />PAID<br />AT THE DOOR
        </>
      }
      footerNote="Standard-card prices shown; each band sets its own."
    >
      {groups.map((g) => (
        <Section key={g}>
          <SectionHead eyebrow={GROUPS[g].eyebrow}>{GROUPS[g].heading}</SectionHead>
          <p>{INTROS[g]}</p>
          {g === "onstage" && <StageKey surfaces={byGroup(g)} />}
          <div className="mt-9 grid gap-[26px] md:grid-cols-2">
            {byGroup(g).map((s) => (
              <Card key={s.key} surface={s} hero={HERO_KEYS.has(s.key)} diagram={DIAGRAMS[s.key]} />
            ))}
          </div>
          {g === "online" && (
            <p className="typewriter mt-6 text-[13.5px] text-gray">
              Bands price touring placements per tour, typically 15 to 25 shows, and residency placements per month.
              Longer runs and bigger venues scale per date, so nobody renegotiates.
            </p>
          )}
        </Section>
      ))}

      <Section>
        <SectionHead eyebrow="One name only">Exclusivity is for sale too</SectionHead>
        <div className="hard-border hard-shadow mt-9 max-w-[760px] bg-tape px-7 py-[30px]">
          <div className="poster text-[24px]">Category exclusivity</div>
          <p className="mt-2 text-[14.5px]">
            By default a band can carry more than one patron. Being the only name in a category on a run, or the only
            patron on a whole tour, is a premium the band can choose to offer. Priced by the band, like everything else
            here.
          </p>
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Before signing">The rules that keep it worth buying</SectionHead>
        <p>
          The rules that keep bands safe are the same ones that keep a placement worth having. A stage that
          doesn&apos;t look bought is the only kind worth being on.
        </p>
        <ul className="typewriter hard-border hard-shadow mt-[30px] max-w-[560px] bg-cream px-7 py-[26px] text-[15px] leading-[2.1]">
          {HOUSE_RULES.map((r) => (
            <li key={r}>
              <span className="text-red">x</span> {r}
            </li>
          ))}
        </ul>
      </Section>

      <Section className="pb-24">
        <SectionHead eyebrow="Opening soon">Back a band that&apos;s already working</SectionHead>
        <p>
          Door Money opens in New York first. Patrons on the list see the first bands, rooms and circuits before
          anyone else.
        </p>
        <div className="mt-[30px] flex flex-wrap gap-5">
          <ButtonLink href="/#list">Become a patron</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}

/** Head-on stage drawing with the onstage surfaces numbered, plus the key underneath. */
function StageKey({ surfaces }: { surfaces: Surface[] }) {
  return (
    <div className="hard-border hard-shadow mt-[34px] bg-white px-[22px] pb-[18px] pt-[22px]">
      <StageSchematic />
      <div className="typewriter mt-4 grid grid-cols-2 gap-x-[18px] gap-y-1.5 border-t-2 border-dashed border-[#A79D8A] pt-3 text-[12.5px] text-gray min-[701px]:grid-cols-3">
        {surfaces.map((s, i) => (
          <div key={s.key}>
            <b className="mr-1.5 font-sans font-bold text-red">{i + 1}</b>
            {s.name}
          </div>
        ))}
        <div>Red marks the sold surface.</div>
      </div>
    </div>
  );
}

function Card({ surface: s, hero, diagram }: { surface: Surface; hero: boolean; diagram?: ReactNode }) {
  return (
    <div className={`hard-border hard-shadow px-6 py-[26px] ${hero ? "col-span-full bg-ink text-paper" : "bg-white"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3.5">
        <div className={`poster leading-[1.05] ${hero ? "text-[clamp(26px,3.6vw,36px)]" : "text-[24px]"}`}>{s.name}</div>
        <div className={`typewriter whitespace-nowrap text-[15px] ${hero ? "text-tape" : "text-red"}`}>
          from {formatMoney(s.defaultPriceCents)} a {s.period}
        </div>
      </div>
      <p className={`mt-2.5 max-w-none text-[14.5px] leading-[1.65] ${hero ? "text-[#C9C4B8]" : "text-gray"}`}>{s.blurb}</p>
      <div
        className={`typewriter mt-3.5 border-t-2 border-dashed pt-2.5 text-[12.5px] leading-[1.9] ${
          hero ? "border-[#4A473F]" : "border-[#A79D8A]"
        }`}
      >
        <b className={`font-normal ${hero ? "text-tape" : "text-red"}`}>Seen by:</b> {s.seenBy}.
      </div>
      {diagram && (
        <div className="mt-[18px]">
          <div className="hard-border bg-white p-1.5">{diagram}</div>
        </div>
      )}
    </div>
  );
}
