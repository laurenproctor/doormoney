import type { ReactNode } from "react";
import { Eyebrow, Section, SectionHead } from "@/components/Brand";
import { NewsletterForm } from "@/components/NewsletterForm";
import { NEWSLETTER } from "@/lib/newsletter-copy";


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
        {/* The panel is the same one the footer draws, so the ask looks the same wherever it is met. */}
        <NewsletterPanel source={source} />
      </div>
    </Section>
  );
}

/**
 * The block in the footer, so the ask is on every page.
 *
 * It used to be a strip: two fields and a button crushed onto one row beside a line of text, with
 * the labels hidden in placeholders because there was no room for them. It is the same band as the
 * one on the marketing pages now, at the foot of the page instead of in the middle of it, which is
 * what let the home page stop carrying its own copy of it.
 */
export function NewsletterStrip({ source }: { source: string }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,480px)] lg:items-center lg:gap-16">
      <div>
        <Eyebrow className="mb-5">{NEWSLETTER.eyebrow}</Eyebrow>
        <p className="heading max-w-[18ch] text-[clamp(24px,3.2vw,34px)] leading-[1.1] text-ink">{NEWSLETTER.title}</p>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.7] text-muted">{NEWSLETTER.body}</p>
      </div>
      <NewsletterPanel source={source} />
    </div>
  );
}

/**
 * The lifted block the form sits in.
 *
 * Opaque rather than translucent, the way the sign-up panel is: three stage lights swing behind
 * these pages, and a field's boundary should not change contrast as one passes. The fields inside
 * take the ground, so each reads as a well cut into the panel in both rooms.
 */
function NewsletterPanel({ source }: { source: string }) {
  return (
    <div className="edge glow bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))] p-7 max-sm:p-5">
      <NewsletterForm source={source} />
    </div>
  );
}
