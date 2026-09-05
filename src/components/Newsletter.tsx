import type { ReactNode } from "react";
import { Section, SectionHead } from "@/components/Brand";
import { NewsletterForm } from "@/components/NewsletterForm";

/** The pitch, in one place so every page says the same thing. */
export const NEWSLETTER = {
  eyebrow: "New fundraisers by email",
  title: "The next musician, before the sponsorships go.",
  body: "New musicians open fundraisers on Door Money every week: a band about to tour, a house act starting a residency, a soloist booking a season. One short email says who they are, where they play and what is still open to back. Never more than once a week, nothing else in it.",
  fine: "Every email has an unsubscribe link. Door Money never shares an address.",
} as const;

/**
 * The full band: eyebrow, heading and pitch on the left, the form on the right. Drop it on any page
 * a patron might be reading. `source` names the page so the list shows where an address came from.
 */
export function NewsletterCTA({
  source,
  eyebrow = NEWSLETTER.eyebrow,
  title = NEWSLETTER.title,
  body = NEWSLETTER.body,
  className = "",
}: {
  source: string;
  eyebrow?: string;
  title?: ReactNode;
  body?: ReactNode;
  className?: string;
}) {
  return (
    <Section className={`pool ${className}`}>
      <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-20">
        <div>
          <SectionHead eyebrow={eyebrow}>{title}</SectionHead>
          <p className="text-muted">{body}</p>
        </div>
        <div className="glow bg-panel p-7 max-md:p-6">
          <NewsletterForm source={source} />
          <p className="mt-4 text-[14px] leading-[1.6] text-muted">{NEWSLETTER.fine}</p>
        </div>
      </div>
    </Section>
  );
}

/** The compact strip in the footer, so the ask is on every page without a band on every page. */
export function NewsletterStrip({ source }: { source: string }) {
  return (
    <div className="grid gap-6 border-b border-line pb-12 lg:grid-cols-[1fr_minmax(0,560px)] lg:items-center lg:gap-16">
      <div>
        <p className="caps text-[14px] text-accent-ink">New musicians, by email</p>
        <p className="mt-2 max-w-[48ch] text-[14.5px] leading-[1.7] text-muted">
          One short email the week a new fundraiser opens: who they are, where they play, what is open to back.
        </p>
      </div>
      {/* Never wider than the column it sits in above lg, so the field does not stretch when the strip stacks. */}
      <div className="max-w-[560px]">
        <NewsletterForm source={source} compact />
      </div>
    </div>
  );
}
