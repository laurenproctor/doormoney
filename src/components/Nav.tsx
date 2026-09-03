import Link from "next/link";
import { NAV } from "@/lib/site";

/** The top bar: wordmark, the site's pages in the middle, sign in and the act call to action on the right. */
export function Nav({ current }: { current?: string }) {
  const links = NAV.filter((n) => n.href !== "/list");
  return (
    <header className="relative z-10 border-b border-line">
      <a
        href="#main"
        className="caps sr-only bg-accent px-4 py-2 text-[14px] text-on-accent no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-3 px-7 py-5 max-md:gap-x-4">
        <Link href="/" className="caps text-[16px] tracking-[0.34em] text-ink no-underline max-md:tracking-[0.22em]">
          Door Money
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-7 gap-y-2 max-md:order-last max-md:basis-full md:mx-auto">
          {links.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current === n.href ? "page" : undefined}
              className={`caps border-b pb-1 text-[14px] no-underline transition-colors hover:text-ink ${
                current === n.href ? "border-accent text-ink" : "border-transparent text-muted"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-6">
          <Link
            href="/login"
            aria-current={current === "/login" ? "page" : undefined}
            className={`caps text-[14px] no-underline transition-colors hover:text-ink max-md:hidden ${current === "/login" ? "text-ink" : "text-muted"}`}
          >
            Sign in
          </Link>
          <Link
            href="/list"
            aria-current={current === "/list" ? "page" : undefined}
            className={`caps border px-5 py-2.5 text-[14px] text-ink no-underline transition-colors hover:border-ink max-md:px-3.5 ${
              current === "/list" ? "border-accent" : "border-ink/40"
            }`}
          >
            List an act
          </Link>
        </div>
      </div>
    </header>
  );
}
