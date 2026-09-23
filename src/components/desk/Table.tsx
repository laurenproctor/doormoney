import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Overflow } from "@/components/dashboard/icons";

/**
 * A table drawn as a CSS grid, so a cell can hold a badge or a control without a nested layout.
 *
 * The header is sentence case and muted: caps belong to a status word inside a badge and nowhere
 * else on this register. Rows are 44px at their shortest, which is the smallest thing a finger can
 * reliably hit, and the last column is kept for whatever the row can do to itself.
 *
 * A row can be a link. The link covers the row rather than wrapping it, so a control in the last
 * column is still a control and not something nested inside an anchor.
 */
export type DeskColumn = {
  key: string;
  label: string;
  /** A grid track. Defaults to an equal share. */
  width?: string;
};

export type DeskRow = {
  key: string;
  cells: ReactNode[];
  /** Where the whole row goes when somebody presses it. */
  href?: string;
  /** What the row's own label is, when the first cell is not a sentence. */
  label?: string;
  /** The last column: the rest of what this row can do. */
  menu?: ReactNode;
};

export function Table({
  columns,
  rows,
  className = "",
}: {
  columns: DeskColumn[];
  rows: DeskRow[];
  className?: string;
}) {
  const template = [...columns.map((c) => c.width ?? "minmax(0,1fr)"), "40px"].join(" ");
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <div className="grid gap-3 border-b border-line py-1.5 text-[14px] font-medium text-muted" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
        <span />
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="relative grid min-h-[44px] items-center gap-3 border-b border-line py-2.5 text-[14px] last:border-b-0"
          style={{ gridTemplateColumns: template }}
        >
          {row.cells.map((cell, i) => (
            <span key={columns[i]?.key ?? i} className="min-w-0">
              {i === 0 && row.href ? (
                <Link
                  href={row.href}
                  aria-label={row.label}
                  className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
                >
                  {cell}
                </Link>
              ) : (
                cell
              )}
            </span>
          ))}
          <span className="relative z-10 justify-self-end">{row.menu}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The control that sits in that last column. It draws the kebab and names itself; what opening it
 * does belongs to the page, which is why this takes the rest of a button's props and adds nothing.
 */
export function RowMenuButton({ label = "More", ref, ...props }: ComponentProps<"button"> & { label?: string }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-transparent text-muted hover:bg-neutral-wash hover:text-ink"
      {...props}
    >
      <Overflow size={16} aria-hidden="true" />
    </button>
  );
}
