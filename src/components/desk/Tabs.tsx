import Link from "next/link";

/**
 * The sections of one page, as links.
 *
 * Every tab is an address (`?tab=…`), so the page stays a server component, a section can be sent
 * to somebody, and the back button works. Nothing here holds state.
 *
 * A count can ask for attention, which is the only thing on this row that is ever colored: two
 * sponsorships waiting on the organizer is a different fact from nine options existing.
 */
export type DeskTab = {
  key: string;
  href: string;
  label: string;
  count?: number | null;
  /** "attention" when the count is something waiting on somebody. */
  tone?: "neutral" | "attention";
};

export function Tabs({ label, tabs, current, className = "" }: { label: string; tabs: DeskTab[]; current: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={`flex flex-wrap border-b border-line ${className}`}>
      {tabs.map((tab) => {
        const here = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={here}
            className={`-mb-px mr-[22px] inline-flex min-h-[38px] items-center gap-2 border-b-2 px-1 text-[14px] font-medium no-underline ${
              here ? "border-accent-line text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={`min-w-[18px] rounded-full px-1.5 text-center text-[14px] ${
                  tab.tone === "attention" ? "bg-attention-wash text-attention-ink" : "bg-neutral-wash text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
