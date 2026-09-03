import type { ReactNode } from "react";
import { Page } from "@/components/Page";
import { Section } from "@/components/Brand";
import { SITE } from "@/lib/site";

export type LegalSection = { id: string; heading: string; body: ReactNode };

/**
 * Shell for the house paper: terms, privacy, cookies, accessibility.
 * Numbered sections behind dashed rules, a contents list up top, and the date it last changed.
 */
export function LegalPage({
  path,
  tape,
  title,
  accent,
  intro,
  stamp,
  updated,
  sections,
}: {
  path: string;
  tape: string;
  title: string;
  accent: string;
  intro: ReactNode;
  stamp?: ReactNode;
  /** Plain date, e.g. "September 3, 2026". */
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <Page
      current={path}
      tape={tape}
      title={title}
      accent={accent}
      intro={
        <>
          {intro}
          <p className="typewriter mt-5 text-[13.5px] text-gray">Last updated {updated}.</p>
        </>
      }
      stamp={stamp}
      footerNote={`Questions about this page go to ${SITE.contact}.`}
    >
      <Section>
        <nav aria-label="Contents" className="hard-border hard-shadow-sm mb-14 max-w-[560px] bg-cream p-6">
          <h2 className="typewriter mb-3 text-[15px] text-red">Contents</h2>
          <ol className="typewriter grid gap-1 text-[14.5px] leading-[1.7] sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <span className="text-red">{i + 1}.</span>{" "}
                <a href={`#${s.id}`} className="underline decoration-1 underline-offset-4 hover:text-red">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <article
            key={s.id}
            id={s.id}
            className="grid min-w-0 scroll-mt-6 gap-x-6 border-t-2 border-dashed border-gray py-9 md:grid-cols-[72px_1fr]"
          >
            <div className="poster text-[36px] leading-none text-red md:text-[44px]">{i + 1}</div>
            <div className="min-w-0">
              <h2 className="poster mb-4 text-[clamp(26px,3.6vw,38px)] leading-none">{s.heading}</h2>
              <div className="grid gap-4 text-[16px] leading-[1.7]">{s.body}</div>
            </div>
          </article>
        ))}
      </Section>
    </Page>
  );
}

/** Bulleted list in the body of a section. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="grid max-w-[62ch] gap-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[22px_1fr]">
          <span aria-hidden="true" className="typewriter text-red">
            x
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A named term with its definition, for the vocabulary blocks. */
export function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <b>{name}.</b> {children}
    </>
  );
}

/** Mailto link to the house address. */
export function Contact() {
  return (
    <a href={`mailto:${SITE.contact}`} className="underline decoration-2 underline-offset-4 hover:text-red">
      {SITE.contact}
    </a>
  );
}
