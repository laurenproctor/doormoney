import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "caps inline-flex cursor-pointer items-center justify-center gap-3 border px-7 py-4 text-[14px] tracking-[0.16em] no-underline transition-colors duration-150 disabled:cursor-default disabled:opacity-60";
const styles = {
  /** Filled with the page's light. One per view. */
  solid: "border-accent bg-accent text-on-accent hover:border-accent-ink hover:bg-accent-ink",
  /** Outlined, for the second choice. */
  ghost: "border-ink/40 bg-transparent text-ink hover:border-ink",
} as const;

type Variant = keyof typeof styles;

/** Trailing arrow, as on the reference heroes. */
function Arrow() {
  return (
    <span aria-hidden="true" className="text-[16px] leading-none">
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
