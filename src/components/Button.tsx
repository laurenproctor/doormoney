import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/*
  One button, two registers.

  Stage is the public site: a tracked-caps control with wide padding, a glint on its top edge and
  its own light pooling beneath it. Desk is the workspace (docs/DESK_REGISTER.md, decision 20):
  sentence case, 36px tall, a 6px corner, no glow, because a page with nine of them on it should
  read as nine controls rather than nine announcements.

  Both take their color from the same tokens. `accent-line` is the edge on every filled control,
  never `border-accent`: in the light room the raw accent is not visible against its own ground.
*/

const stageBase =
  "group caps inline-flex cursor-pointer items-center justify-center gap-3 border px-7 py-4 text-[14px] tracking-[0.16em] no-underline transition-[color,background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-px disabled:cursor-default disabled:opacity-60 disabled:hover:translate-y-0";
const stageStyles = {
  /** Filled with the page's light. One per view. A glint on its top edge, its own light pooling beneath. */
  solid:
    "border-accent-line bg-accent text-on-accent [box-shadow:inset_0_1px_0_rgba(255,255,255,0.28),0_18px_36px_-18px_var(--accent)] hover:border-accent-ink hover:bg-accent-ink hover:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.28),0_22px_40px_-16px_var(--accent)]",
  /** Outlined, for the second choice. */
  ghost: "border-field-line bg-transparent text-ink hover:border-ink",
} as const;

const deskBase =
  "group inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-control border font-medium no-underline transition-[color,background-color,border-color] duration-150 disabled:cursor-default disabled:opacity-60";
const deskSizes = {
  /** The height every control in the top bar and every card head shares. */
  md: "min-h-[36px] px-3.5 text-[14px]",
  /** A row's own action, inside a table or a task row. */
  sm: "min-h-[32px] px-3 text-[14px]",
} as const;
const deskStyles = {
  /** The one thing on the screen that is the page's color. */
  solid: "border-accent-line bg-accent text-on-accent hover:border-accent-ink hover:bg-accent-ink",
  /** The ordinary control: an edge somebody can find, and nothing else. */
  outline: "border-field-line bg-transparent text-ink hover:border-ink",
  /** No edge until it is under the pointer. For an action that repeats down a column. */
  quiet: "border-transparent bg-transparent text-ink hover:bg-neutral-wash",
} as const;

type StageVariant = keyof typeof stageStyles;
type DeskVariant = keyof typeof deskStyles;
type DeskSize = keyof typeof deskSizes;

/** Which register a control belongs to, and what it may be called there. */
type Register =
  | { register?: "stage"; variant?: StageVariant; size?: never }
  | { register: "desk"; variant?: DeskVariant; size?: DeskSize };

function chrome(register: "stage" | "desk" = "stage", variant = "solid", size: DeskSize = "md"): string {
  if (register === "desk") {
    const styles: Record<string, string> = deskStyles;
    return `${deskBase} ${deskSizes[size]} ${styles[variant] ?? deskStyles.solid}`;
  }
  const styles: Record<string, string> = stageStyles;
  return `${stageBase} ${styles[variant] ?? stageStyles.solid}`;
}

/** Trailing arrow, as on the reference heroes. */
function Arrow() {
  return (
    <span aria-hidden="true" className="text-[16px] leading-none transition-transform duration-200 group-hover:translate-x-1">
      &rarr;
    </span>
  );
}

export function Button({
  register,
  variant,
  size,
  arrow = false,
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & Register & { arrow?: boolean }) {
  return (
    <button className={`${chrome(register, variant, size)} ${className}`} {...props}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

export function ButtonLink({
  href,
  register,
  variant,
  size,
  arrow = false,
  className = "",
  children,
}: {
  href: string;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
} & Register) {
  return (
    <Link href={href} className={`${chrome(register, variant, size)} ${className}`}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}
