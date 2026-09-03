import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow, Stamp } from "@/components/Brand";
import { HeroArt } from "@/components/HeroArt";
import { Theme, type ThemeName } from "@/components/Theme";

/** Subpage shell: the page's light, nav, eyebrow, big serif heading with an italic accent word, intro, then content. */
export function Page({
  theme,
  current,
  eyebrow,
  title,
  accent,
  intro,
  stamp,
  strap = "Acts. Patrons. Together.",
  children,
  footerNote,
}: {
  theme: ThemeName;
  current: string;
  eyebrow: string;
  title: string;
  accent: string;
  intro: ReactNode;
  /** Optional circular seal pinned top-right of the hero, hidden under 860px. */
  stamp?: ReactNode;
  /** The short line in the bottom-left corner of the hero. */
  strap?: string;
  children: ReactNode;
  footerNote?: string;
}) {
  return (
    <Theme name={theme}>
      <Nav current={current} />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden border-b border-line">
          <HeroArt theme={theme} />
          <div className="hero-in relative mx-auto w-full max-w-[1120px] px-7 pb-[72px] pt-[88px]">
            <Eyebrow className="mb-8">{eyebrow}</Eyebrow>
            <h1 className="display max-w-[12ch] text-[clamp(44px,7.4vw,96px)] leading-[0.98]">
              {title} {accent && <em className="text-accent-ink">{accent}</em>}
            </h1>
            <div className="mt-8 max-w-[56ch] text-[17px]">{intro}</div>
            {stamp && <Stamp className="absolute right-7 top-[88px] max-[860px]:hidden">{stamp}</Stamp>}
            <div className="caps mt-20 flex items-end justify-between gap-4 text-[14px] text-muted">
              <span>{strap}</span>
              <span aria-hidden="true" className="text-[22px] leading-none">
                &darr;
              </span>
            </div>
          </div>
        </section>
        {children}
      </main>
      <Footer note={footerNote} />
    </Theme>
  );
}

/** Marker for pages still to be ported. Renders a visible note in dev, nothing in production. */
export function PortNote({ mockup }: { mockup: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="mx-auto mb-10 w-full max-w-[1120px] px-7">
      <div className="edge bg-panel p-4 text-[14.5px] text-muted">
        Not yet ported. The layout and copy are in <code>docs/mockups/{mockup}</code>. Read CLAUDE.md, then port section by section.
      </div>
    </div>
  );
}
