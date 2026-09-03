// Sample copy from docs/mockups/board-rosie.html. It describes buyer types for the solo tier and names
// real companies as illustrations only. Until acts can write their own backer notes, it shows on Rosie's board alone.

const BACKERS: { title: string; body: string; who: string; fits: string; wide?: boolean }[] = [
  {
    title: "Reed and cane sellers",
    body: "Her feed is watched almost entirely by people who buy reeds, cane and tools. That is the entire customer list, gathered in one place, reachable nowhere else this cheaply.",
    who: "Forrests Music, Hodge Products, Advantage Double Reeds, Otter Creek Double Reeds, Rigotti cane",
    fits: "the thank-you post, practice sessions",
  },
  {
    title: "Case and instrument makers",
    body: "The case lid is the one surface a case maker would actually want. It opens at every rehearsal, service and pit call, in front of other working players deciding what to buy next.",
    who: "Marcus Bonna, Wilhelm Heckel, Püchner, Fox Products, Moosmann",
    fits: "case lid spots 1 to 3",
  },
  {
    title: "Repair shops and dealers",
    body: "A freelancer's case gets opened in front of the exact people who need an overhaul and have been putting it off. Regional shops buy proximity, not reach.",
    who: "Charles Double Reed Company (Kingston, NY), RDG Woodwinds, Nielsen Woodwinds, Midwest Musical Imports, Chuck Levin's",
    fits: "case lid spots, music stand front",
  },
  {
    title: "Schools, studios and festivals",
    body: "The stand banner and the program credit put a name in front of serious students and the parents sitting with them. Recruitment spend that lands in the room instead of a feed.",
    who: "Third Street Music School Settlement, Brooklyn Conservatory of Music, Bloomingdale School of Music, Mannes, Interlochen, Aspen Music Festival",
    fits: "music stand front, recital program credit",
  },
  {
    title: "Neighborhood businesses",
    body: "The shop on the block that just wants its local musician to keep playing. No targeting logic, no reach argument. The purest version of the whole idea.",
    who: "Sahadi's, Devoción, McNally Jackson, Talea Beer Co., Russ & Daughters",
    fits: "any open spot, usually the cheapest one",
    wide: true,
  },
];

export const BACKERS_DISCLAIMER =
  "Companies named as example buyers are illustrations of buyer type only and have no involvement with Door Money.";

export function RosieBackers() {
  return (
    <div className="border-t-[3px] border-ink py-14">
      <div className="mx-auto max-w-[1020px] px-7">
        <h3 className="typewriter mb-3 text-[15px] text-red">Who backs a bassoonist</h3>
        <h2 className="poster mb-6 text-[clamp(28px,4vw,44px)] leading-none">Small patrons with perfect aim</h2>
        <p>
          The pitch here isn&apos;t reach. A solo player&apos;s following is small, but it&apos;s made of working
          players, serious students, and the rooms she gigs in, and for the right buyer that&apos;s their whole target
          market gathered in one place, reachable nowhere else this directly. These are the kinds of buyers each spot
          is built for, with real examples of who that means:
        </p>
        <div className="mt-[26px] grid gap-[18px] min-[681px]:grid-cols-2">
          {BACKERS.map((b) => (
            <div key={b.title} className={`hard-border px-[18px] py-4 shadow-[5px_5px_0_var(--black)] ${b.wide ? "bg-tape min-[681px]:col-span-2" : "bg-white"}`}>
              <b className="poster block text-[17px]">{b.title}</b>
              <span className="mt-1 block text-[13.5px] leading-[1.55] text-gray">{b.body}</span>
              <span className="typewriter mt-2 block border-t-2 border-dashed border-[#A79D8A] pt-2 text-[12.5px] leading-[1.6] text-ink">{b.who}</span>
              <span className="typewriter mt-1.5 block text-[12.5px] text-red">Fits: {b.fits}</span>
            </div>
          ))}
        </div>
        <p className="typewriter mt-[22px] max-w-[70ch] text-[12.5px] text-gray">
          Companies named here are examples of who each spot is built for. None of them are involved with Door Money,
          and none have bought anything.
        </p>
      </div>
    </div>
  );
}
