import Link from "next/link";
import { NAV } from "@/lib/site";

export function Nav({ current }: { current?: string }) {
  return (
    <header className="border-b-[3px] border-ink py-3.5">
      <a
        href="#main"
        className="poster sr-only bg-tape px-4 py-2 text-[15px] text-ink no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border-[3px] focus:border-ink"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-[1020px] flex-wrap items-center justify-between gap-3.5 px-7">
        <Link href="/" className="poster text-[20px] no-underline">
          Door <span className="text-red-deep">Money</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-[18px]">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`poster border-b-[3px] pb-0.5 text-[15px] tracking-[0.04em] no-underline hover:border-red ${
                current === n.href ? "border-ink" : "border-transparent"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
