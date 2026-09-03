import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Stamp, Tape } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { SITE } from "@/lib/site";

// The root not-found handles every unmatched URL as well as notFound() calls.
// Next returns a 404 status for it and adds a noindex robots tag on its own;
// the explicit robots entry below makes the intent visible in the file.
export const metadata: Metadata = {
  title: { absolute: `Page Not Found | ${SITE.name}` },
  description: "The page moved, changed, or left the lineup.",
  robots: { index: false, follow: false },
};

// Tonight's set list, with one entry cut. Decorative: the heading carries the message.
const SET = ["", "", "This page", "", ""];

export default function NotFound() {
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto w-full max-w-[1020px] flex-1 px-7 pb-[90px] pt-[88px]">
        <div className="grid items-start gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div>
            <Tape className="mb-[30px]">404: Track not found</Tape>
            <h1 className="poster text-[clamp(52px,9vw,110px)] leading-[0.9]">
              This page missed <span className="text-red">the set.</span>
            </h1>
            <p className="mt-6 max-w-[44ch] text-[17px]">The page may have moved, changed, or left the lineup.</p>
            <div className="mt-[34px] flex flex-wrap gap-[22px]">
              <ButtonLink href="/">Back to Door Money</ButtonLink>
              <ButtonLink href="/auctions" variant="ghost">
                Discover musicians
              </ButtonLink>
            </div>
          </div>

          <div aria-hidden="true" className="relative mt-2 w-full max-w-[300px] md:mt-3 md:w-[280px]">
            <div className="hard-border hard-shadow bg-white px-6 pb-7 pt-5">
              <div className="poster text-[22px] leading-tight">Set list</div>
              <div className="typewriter mt-0.5 text-[14px] text-gray">Tonight, one night only</div>
              <ol className="typewriter mt-4 text-[15px] leading-none">
                {SET.map((song, i) => (
                  <li key={i} className="flex min-h-[42px] items-baseline gap-3 border-b-2 border-dashed border-gray py-3">
                    <span className="poster w-5 text-[18px] text-red-deep">{i + 1}</span>
                    {song && <span className="text-gray line-through decoration-red decoration-[3px]">{song}</span>}
                  </li>
                ))}
              </ol>
            </div>
            <Stamp className="absolute -right-6 -top-8">
              CUT<br />FROM<br />THE SET
            </Stamp>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
