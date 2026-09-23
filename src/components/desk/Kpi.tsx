import type { ReactNode } from "react";

/**
 * One number, named, on its own tile. The label says what it counts, the value is the number and
 * the sub line is what the number is made of.
 *
 * Nothing here is computed: every value arrives already worked out, so a tile cannot invent a
 * total the rows cannot back. `extra` is the slot between the value and the sub line, which is
 * where the money bar sits on the first tile.
 */
export function Kpi({
  label,
  value,
  extra,
  sub,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  extra?: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface px-[18px] py-4 shadow-1 ${className}`}>
      <span className="text-[14px] text-muted">{label}</span>
      <span className="heading text-[26px] leading-none tracking-[-0.02em] text-ink">{value}</span>
      {extra}
      {sub && <span className="text-[14px] text-muted">{sub}</span>}
    </div>
  );
}

/** A word riding along inside a value: "2 sold", "0 of 18". Quieter than the number beside it. */
export function KpiUnit({ children }: { children: ReactNode }) {
  return <span className="text-[16px] font-normal text-muted">{children}</span>;
}
