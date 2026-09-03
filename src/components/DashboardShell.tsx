import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Tape } from "@/components/Brand";
import { signOut } from "@/app/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/act", label: "The act" },
  { href: "/dashboard/payouts", label: "Payouts" },
] as const;

/** The signed-in shell: public nav on top, a thin act bar under it, page content, footer. */
export function DashboardShell({
  current,
  actName,
  tape,
  title,
  accent,
  intro,
  children,
}: {
  current: string;
  actName?: string | null;
  tape: string;
  title: string;
  accent: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Nav />
      <div className="border-b-[3px] border-ink bg-white">
        <div className="mx-auto flex max-w-[1020px] flex-wrap items-center justify-between gap-3 px-7 py-2.5">
          <div className="typewriter text-[13.5px]">{actName ? actName : "New act"}</div>
          <div className="flex flex-wrap items-center gap-[18px]">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`poster border-b-[3px] pb-0.5 text-[13px] tracking-[0.04em] no-underline hover:border-red ${current === l.href ? "border-ink" : "border-transparent"}`}
              >
                {l.label}
              </Link>
            ))}
            <form action={signOut}>
              <button type="submit" className="poster cursor-pointer border-b-[3px] border-transparent pb-0.5 text-[13px] tracking-[0.04em] text-gray hover:border-red">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1020px] px-7 pb-[40px] pt-[64px]">
        <Tape className="mb-[26px]">{tape}</Tape>
        <h1 className="poster text-[clamp(44px,8vw,96px)] leading-[0.9]">
          {title} <span className="text-red">{accent}</span>
        </h1>
        {intro && <div className="mt-5 max-w-[56ch] text-[17px]">{intro}</div>}
      </div>
      <div className="mx-auto w-full max-w-[1020px] px-7 pb-[90px]">{children}</div>
      <Footer />
    </>
  );
}

/** A white card with the hard border and shadow, used for every dashboard block. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hard-border min-w-0 bg-white p-6 shadow-[7px_7px_0_var(--black)] ${className}`}>{children}</div>;
}

export function CardHead({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <>
      <h3 className="typewriter mb-2 text-[14px] text-red">{eyebrow}</h3>
      <h2 className="poster mb-4 text-[clamp(24px,3.4vw,34px)] leading-none">{children}</h2>
    </>
  );
}

/** Shared input styling for dashboard forms. */
export const inputClass = "typewriter hard-border w-full bg-paper px-3.5 py-3 text-[15px]";
export const labelClass = "poster mb-1.5 block text-[15px] tracking-[0.04em]";
