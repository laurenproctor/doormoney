import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "poster inline-block cursor-pointer border-[3px] border-ink px-[30px] py-3.5 text-[19px] tracking-[0.03em] no-underline shadow-[5px_5px_0_var(--black)] transition-[transform,box-shadow] duration-[80ms] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_var(--black)]";
const styles = {
  solid: "bg-red-deep text-white",
  ghost: "bg-white text-ink",
} as const;

type Variant = keyof typeof styles;

export function Button({
  variant = "solid",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  href,
  variant = "solid",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </Link>
  );
}
