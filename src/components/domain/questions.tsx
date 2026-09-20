import type { ReactNode } from "react";

/**
 * The three questions every sponsorship answers, each its own component so a redesign can place
 * them anywhere. They share one shape, and render nothing when the answer is not known: the
 * product contract is explicit that unknown stays unknown and is never a placeholder.
 *
 * `variant="block"` is a labelled block. `variant="inline"` is a run-in sentence, which is how the
 * fundraiser page sets them today.
 */
type Props = { children: string | null | undefined; variant?: "block" | "inline"; className?: string };

function Answer({ label, children, variant = "block", className = "" }: Props & { label: string }): ReactNode {
  const text = children?.trim();
  if (!text) return null;
  if (variant === "inline") return <span className={className}>{label}: {text} </span>;
  return (
    <div className={className}>
      <p className="caps mb-2 text-[14px] text-accent-ink">{label}</p>
      <p className="max-w-[60ch] text-[16px] leading-[1.55]">{text}</p>
    </div>
  );
}

/** What the money enables. */
export function FundingPurpose(props: Props) {
  return <Answer label="What the funding enables" {...props} />;
}

/** Who the sponsorship reaches. Described, never promised as a number. */
export function AudienceSummary(props: Props) {
  return <Answer label="Who it reaches" {...props} />;
}

/** What a sponsor receives. The organizer's own words, and nothing added to them. */
export function SponsorPromise(props: Props) {
  return <Answer label="What a sponsor receives" {...props} />;
}
