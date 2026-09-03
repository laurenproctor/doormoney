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
  eyebrow,
  title,
  accent,
  intro,
  stamp,
  updated,
  sections,
}: {
  path: string;
  eyebrow: string;
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
      theme="mono"
      current={path}
      eyebrow={eyebrow}
      title={title}
      accent={accent}
      intro={
        <>
          {intro}
          <p className="caps mt-5 text-[14.5px] text-muted">Last updated {updated}.</p>
        </>
      }
      stamp={stamp}
      footerNote={`Questions about this page go to ${SITE.contact}.`}
    >
      <Section>
        <nav aria-label="Contents" className="edge glow mb-14 max-w-[560px] bg-panel p-6">
          <h2 className="caps mb-3 text-[15px] text-accent-ink">Contents</h2>
          <ol className="grid gap-1 text-[15px] leading-[1.7] sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <span className="text-accent-ink">{i + 1}.</span>{" "}
                <a href={`#${s.id}`} className="underline decoration-1 underline-offset-4 hover:text-accent-ink">
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
            data-reveal
            className="grid min-w-0 scroll-mt-6 gap-x-6 border-t border-line py-9 md:grid-cols-[72px_1fr]"
          >
            <div className="heading text-[36px] leading-none text-accent-ink md:text-[44px]">{i + 1}</div>
            <div className="min-w-0">
              <h2 className="heading mb-4 text-[clamp(26px,3.6vw,38px)] leading-none">{s.heading}</h2>
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
          <span aria-hidden="true" className="text-accent-ink">&#9642;</span>
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
    <a href={`mailto:${SITE.contact}`} className="underline decoration-1 underline-offset-4 hover:text-accent-ink">
      {SITE.contact}
    </a>
  );
}
