import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "group caps inline-flex cursor-pointer items-center justify-center gap-3 border px-7 py-4 text-[14px] tracking-[0.16em] no-underline transition-[color,background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-px disabled:cursor-default disabled:opacity-60 disabled:hover:translate-y-0";
const styles = {
  /** Filled with the page's light. One per view. A glint on its top edge, its own light pooling beneath. */
  solid:
    "border-accent bg-accent text-on-accent [box-shadow:inset_0_1px_0_rgba(255,255,255,0.28),0_18px_36px_-18px_var(--accent)] hover:border-accent-ink hover:bg-accent-ink hover:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.28),0_22px_40px_-16px_var(--accent)]",
  /** Outlined, for the second choice. */
  ghost: "border-ink/40 bg-transparent text-ink hover:border-ink",
} as const;

type Variant = keyof typeof styles;

/** Trailing arrow, as on the reference heroes. */
function Arrow() {
  return (
    <span aria-hidden="true" className="text-[16px] leading-none transition-transform duration-200 group-hover:translate-x-1">
      &rarr;
    </span>
  );
}

export function Button({
  variant = "solid",
  arrow = false,
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; arrow?: boolean }) {
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "solid",
  arrow = false,
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${styles[variant]} ${className}`}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}
