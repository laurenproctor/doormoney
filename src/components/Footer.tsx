import Link from "next/link";
import { LEGAL, NAV, SITE } from "@/lib/site";

export function Footer({ note }: { note?: string }) {
  return (
    <footer className="border-t-[3px] border-ink bg-ink py-14 pb-20 text-paper">
      <div className="mx-auto max-w-[1020px] px-7">
        <div className="poster text-[28px]">{SITE.name}</div>
        <p className="mt-2.5 text-[13px] leading-[1.7] text-[#9B968A]">
          {SITE.tagline}
          {note ? ` ${note}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-[18px]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="typewriter text-[13px] text-paper">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-x-[18px] gap-y-1.5 border-t-2 border-dashed border-gray pt-4">
          {LEGAL.map((n) => (
            <Link key={n.href} href={n.href} className="typewriter text-[12.5px] text-[#9B968A] hover:text-paper">
              {n.label}
            </Link>
          ))}
          <Link href="/login" className="typewriter text-[12.5px] text-[#9B968A] hover:text-paper">
            Act sign-in
          </Link>
        </div>
      </div>
    </footer>
  );
}
