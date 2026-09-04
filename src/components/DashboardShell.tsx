import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow } from "@/components/Brand";
import { Theme } from "@/components/Theme";
import { signOut } from "@/app/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/act", label: "The act" },
  { href: "/dashboard/payouts", label: "Payouts" },
  { href: "/dashboard/account", label: "Account" },
] as const;

/** The signed-in shell: public nav on top, a thin act bar under it, page content, footer. Always lit blue. */
export function DashboardShell({
  current,
  actName,
  eyebrow,
  title,
  accent,
  intro,
  children,
}: {
  current: string;
  actName?: string | null;
  eyebrow: string;
  title: string;
  accent: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Theme name="blue">
      <Nav />
      <div className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-7 py-3">
          <div className="caps text-[14px] text-accent-ink">{actName ? actName : "New act"}</div>
          <div className="flex flex-wrap items-center gap-[22px]">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                className={`caps border-b pb-0.5 text-[14px] no-underline hover:text-ink ${current === l.href ? "border-accent text-ink" : "border-transparent text-muted"}`}
              >
                {l.label}
              </Link>
            ))}
            <form action={signOut}>
              <button type="submit" className="caps cursor-pointer border-b border-transparent pb-0.5 text-[14px] text-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
      <main id="main" className="flex-1">
        <div className="pool">
          <div className="hero-in mx-auto w-full max-w-[1120px] px-7 pb-[40px] pt-[64px]">
            <Eyebrow className="mb-7">{eyebrow}</Eyebrow>
            <h1 className="display text-[clamp(40px,7vw,88px)] leading-[0.98]">
              {title} {accent && <em className="text-accent-ink">{accent}</em>}
            </h1>
            {intro && <div className="mt-5 max-w-[56ch] text-[17px]">{intro}</div>}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1120px] px-7 pb-[90px]">{children}</div>
      </main>
      <Footer />
    </Theme>
  );
}

/** A lifted panel with one thin line around it, used for every dashboard block. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`edge min-w-0 bg-panel p-6 ${className}`}>{children}</div>;
}

export function CardHead({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <>
      <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
      <h2 className="heading mb-4 text-[clamp(24px,3.4vw,34px)] leading-none">{children}</h2>
    </>
  );
}

/** Shared input styling for dashboard forms. */
export const inputClass = "edge w-full bg-transparent px-3.5 py-3 text-[15px]";
export const labelClass = "caps mb-2 block text-[14px] text-muted";
