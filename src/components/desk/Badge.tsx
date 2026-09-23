import type { ReactNode } from "react";

/**
 * A state, said in a word, with a dot beside it.
 *
 * Three kinds and no more. **ok** is the organizer's own light, so an open fundraiser under a blue
 * organizer is blue and under a lime one is lime. **attention** is amber in every room and under
 * every light, which is what lets it mean the same thing everywhere. **neutral** is the ink at low
 * strength, for a state that is neither: a draft, a count of nothing.
 *
 * The word is what a screen reader is given. The dot is decoration and says so, so the state is
 * never carried by color alone.
 */
export type BadgeKind = "ok" | "attention" | "neutral";

const chrome: Record<BadgeKind, string> = {
  ok: "bg-ok-wash text-ok-ink",
  attention: "bg-attention-wash text-attention-ink",
  neutral: "bg-neutral-wash text-muted",
};

const dot: Record<BadgeKind, string> = {
  ok: "bg-ok",
  attention: "bg-attention-ink",
  // Hollow: the one state drawn as an outline, so a draft reads as an outline of a thing.
  neutral: "border-[1.5px] border-current",
};

export function Badge({ kind = "neutral", children, className = "" }: { kind?: BadgeKind; children: ReactNode; className?: string }) {
  return (
    <span
      data-badge={kind}
      className={`inline-flex min-h-[24px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[14px] font-medium ${chrome[kind]} ${className}`}
    >
      <span aria-hidden="true" className={`h-[7px] w-[7px] flex-none rounded-full ${dot[kind]}`} />
      {children}
    </span>
  );
}
