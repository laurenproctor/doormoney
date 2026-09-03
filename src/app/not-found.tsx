import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Stamp } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { HeroArt } from "@/components/HeroArt";
import { Theme } from "@/components/Theme";
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
    <Theme name="red">
      <Nav />
      <main id="main" className="relative flex-1 overflow-hidden">
        <HeroArt theme="red" photo="marquee" />
        <div className="relative mx-auto w-full max-w-[1120px] px-7 pb-[90px] pt-[88px]">
          <div className="grid items-start gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
            <div>
              <Eyebrow className="mb-8">404: Track not found</Eyebrow>
              <h1 className="display max-w-[12ch] text-[clamp(44px,7.4vw,96px)] leading-[0.98]">
                This page missed <em className="text-accent-ink">the set.</em>
              </h1>
              <p className="mt-7 max-w-[44ch] text-[17px] text-muted">The page may have moved, changed, or left the lineup.</p>
              <div className="mt-9 flex flex-wrap gap-4">
                <ButtonLink href="/" arrow>Back to Door Money</ButtonLink>
                <ButtonLink href="/auctions" variant="ghost">
                  See the live boards
                </ButtonLink>
              </div>
            </div>

            <div aria-hidden="true" className="relative mt-2 w-full max-w-[300px] md:mt-3 md:w-[280px]">
              <div className="glow bg-ground px-6 pb-7 pt-5">
                <div className="heading text-[24px] leading-tight">Set list</div>
                <div className="caps mt-1 text-[14px] text-muted">Tonight, one night only</div>
                <ol className="mt-4 text-[15px] leading-none">
                  {SET.map((song, i) => (
                    <li key={i} className="flex min-h-[42px] items-baseline gap-3 border-b border-line py-3">
                      <span className="heading w-6 text-[18px] text-accent-ink">{i + 1}</span>
                      {song && <span className="caps text-[14px] text-muted line-through decoration-accent decoration-2">{song}</span>}
                    </li>
                  ))}
                </ol>
              </div>
              <Stamp className="absolute -bottom-10 -right-8 bg-ground">
                CUT<br />FROM<br />THE SET
              </Stamp>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </Theme>
  );
}
