import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Stamp, Tape } from "@/components/Brand";

/** Subpage shell: nav, tilted label, big two-tone heading, intro, then content. */
export function Page({
  current,
  tape,
  title,
  accent,
  intro,
  stamp,
  children,
  footerNote,
}: {
  current: string;
  tape: string;
  title: string;
  accent: string;
  intro: ReactNode;
  /** Optional circular stamp pinned top-right of the hero, hidden under 860px. */
  stamp?: ReactNode;
  children: ReactNode;
  footerNote?: string;
}) {
  return (
    <>
      <Nav current={current} />
      <div className="relative mx-auto max-w-[1020px] px-7 pb-[76px] pt-[88px]">
        <Tape className="mb-[30px]">{tape}</Tape>
        <h1 className="poster text-[clamp(52px,9vw,110px)] leading-[0.9]">
          {title} <span className="text-red">{accent}</span>
        </h1>
        <div className="mt-6 max-w-[56ch] text-[17px]">{intro}</div>
        {stamp && <Stamp className="absolute right-7 top-[88px] max-[860px]:hidden">{stamp}</Stamp>}
      </div>
      {children}
      <Footer note={footerNote} />
    </>
  );
}

/** Marker for pages still to be ported. Renders a visible note in dev, nothing in production. */
export function PortNote({ mockup }: { mockup: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="mx-auto mb-10 max-w-[1020px] px-7">
      <div className="typewriter hard-border bg-tape p-4 text-[13px]">
        Not yet ported. The spec is <code>docs/mockups/{mockup}</code>. Read CLAUDE.md, then port section by section.
      </div>
    </div>
  );
}
