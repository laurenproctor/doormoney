import type { CSSProperties } from "react";
import { Section, SectionHead } from "@/components/Brand";
import { AVAILABILITY_NOTE, CATEGORY_TEST, STARTING_CATEGORIES, STARTING_CATEGORIES_NOTE } from "@/lib/starting-categories";

/**
 * The four starting categories, as cards, with the two sentences that keep them honest: the set is
 * a start and not a limit, and not all four are open to sponsors yet.
 *
 * `labels` is the registry's name for each key (getCategoryLabels). A card falls back to its own
 * label, so the section still renders before a database is connected.
 */
export function StartingCategories({ labels = {}, heading = "Four categories to start", className = "" }: { labels?: Record<string, string>; heading?: string; className?: string }) {
  return (
    <Section className={className}>
      <SectionHead eyebrow="Starting categories">{heading}</SectionHead>
      <p className="max-w-[62ch] text-muted">{STARTING_CATEGORIES_NOTE}</p>
      <div className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STARTING_CATEGORIES.map((c, i) => (
          <div key={c.key} data-reveal style={{ "--i": i } as CSSProperties} className="lift flex flex-col bg-ground p-7">
            <h3 className="heading text-[24px] leading-[1.1]">{labels[c.key] ?? c.label}</h3>
            <p className="mt-4 max-w-none text-[15px] leading-[1.6]">{c.funds}</p>
            <p className="mt-3 max-w-none text-[15px] leading-[1.6] text-muted">{c.placements}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-20">
        <div>
          <p className="caps text-[14px] text-accent-ink">A start, not a limit</p>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.7] text-muted">A new category fits when its organizers can state four things:</p>
          <ul className="mt-3 grid gap-1.5 text-[15px] leading-[1.7]">
            {CATEGORY_TEST.map((line) => (
              <li key={line}>
                <span aria-hidden="true" className="text-accent-ink">&#9642;</span> {line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="caps text-[14px] text-accent-ink">What is open today</p>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.7] text-muted">{AVAILABILITY_NOTE}</p>
        </div>
      </div>
    </Section>
  );
}
