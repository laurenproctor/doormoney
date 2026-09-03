import Link from "next/link";
import { NAV } from "@/lib/site";

export function Nav({ current }: { current?: string }) {
  return (
    <div className="border-b-[3px] border-ink py-3.5">
      <div className="mx-auto flex max-w-[1020px] flex-wrap items-center justify-between gap-3.5 px-7">
        <Link href="/" className="poster text-[20px] no-underline">
          Door <span className="text-red">Money</span>
        </Link>
        <nav className="flex flex-wrap gap-[18px]">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`poster border-b-[3px] pb-0.5 text-[14px] tracking-[0.04em] no-underline hover:border-red ${
                current === n.href ? "border-ink" : "border-transparent"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
