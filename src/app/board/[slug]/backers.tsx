// Who backs a soloist. Sample copy for Rosie's board: buyer types for the solo tier, with real
// companies named as illustrations only, kept behind a disclosure so the categories carry the point.
// Until musicians can write their own backer notes, it shows on Rosie's board alone.

const BACKERS: { title: string; body: string; who: string; fits: string }[] = [
  {
    title: "Double-reed makers",
    body: "Rosie's audience contains working bassoonists and serious students: the people who regularly buy reeds, cane and specialist tools.",
    who: "Forrests Music, Hodge Products, Advantage Double Reeds, Rigotti cane, Marcus Bonna, Fox Products",
    fits: "the thank-you post, practice sessions, case lid spots",
  },
  {
    title: "Repair shops and dealers",
    body: "Her case opens in rehearsal rooms and pits full of working woodwind players. A regional shop is buying proximity, not reach.",
    who: "Charles Double Reed Company, RDG Woodwinds, Nielsen Woodwinds, Midwest Musical Imports",
    fits: "case lid spots, music stand",
  },
  {
    title: "Schools and festivals",
    body: "Program and stand placements reach students, teachers and families already investing in music.",
    who: "Third Street Music School Settlement, Brooklyn Conservatory of Music, Mannes, Interlochen",
    fits: "music stand, recital program credit",
  },
  {
    title: "Neighborhood businesses",
    body: "The shop on the block that wants its local musician to keep playing. No targeting logic. The purest version of the whole idea.",
    who: "Sahadi's, Devoción, McNally Jackson, Talea Beer Co.",
    fits: "any open placement, usually the cheapest one",
  },
];

export const BACKERS_DISCLAIMER =
  "Companies named as example buyers are illustrations of buyer type only and have no involvement with Door Money.";

export function RosieBackers() {
  return (
    <div className="border-t border-line py-14">
      <div className="mx-auto max-w-[1120px] px-7">
        <p className="caps mb-3 text-[15px] text-accent-ink">Who backs a bassoonist</p>
        <h2 className="heading mb-6 text-[clamp(28px,4vw,44px)] leading-none">Small patrons with perfect aim</h2>
        <p>
          A musician doesn&apos;t need a huge audience when they have the exact audience. A soloist&apos;s following
          is small, but it is made of working players, serious students and the rooms she gigs in. For the right
          patron, that is their whole market gathered in one place.
        </p>
        <div className="mt-[26px] grid gap-[18px] min-[681px]:grid-cols-2">
          {BACKERS.map((b) => (
            <div key={b.title} className="edge bg-panel px-[18px] py-4">
              <b className="block text-[17px]">{b.title}</b>
              <span className="mt-1 block text-[14.5px] leading-[1.55] text-muted">{b.body}</span>
              <span className="mt-2 block text-[14px] text-accent-ink">Fits: {b.fits}</span>
              <details className="mt-2 border-t border-line pt-2 text-[14px] leading-[1.6]">
                <summary className="caps cursor-pointer text-[14px] text-muted">Examples</summary>
                <span className="mt-1.5 block text-ink">{b.who}</span>
              </details>
            </div>
          ))}
        </div>
        <p className="mt-[22px] max-w-[70ch] text-[14px] text-muted">
          Companies named here are examples of who each placement is built for. None of them are involved with Door
          Money, and none have bought anything.
        </p>
      </div>
    </div>
  );
}
