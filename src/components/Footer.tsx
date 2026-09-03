import Link from "next/link";
import { NAV, SITE } from "@/lib/site";

export function Footer({ note }: { note?: string }) {
  return (
    <footer className="border-t-[3px] border-ink bg-ink py-14 pb-20 text-paper">
      <div className="mx-auto max-w-[1020px] px-7">
        <div className="poster text-[28px]">{SITE.name}</div>
        <p className="mt-2.5 text-[13px] leading-[1.7] text-[#9B968A]">
          {SITE.tagline} Preview site.{" "}
          {note ?? `Placements, prices and sample records here illustrate the idea only, until ${SITE.name} opens.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-[18px]">
          {NAV.filter((n) => n.href !== "/").map((n) => (
            <Link key={n.href} href={n.href} className="typewriter text-[13px] text-paper">
              {n.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
