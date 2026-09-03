import Link from "next/link";
import { NAV, SITE } from "@/lib/site";
import { Logo } from "@/components/Logo";

/** The top bar: wordmark, the site's pages in the middle, sign in and the act call to action on the right. */
export function Nav({ current }: { current?: string }) {
  const links = NAV.filter((n) => n.href !== "/list");
  return (
    <header className="relative z-10 border-b border-line bg-ground shadow-[0_24px_48px_-30px_rgba(0,0,0,0.9)]">
      <a
        href="#main"
        className="caps sr-only bg-accent px-4 py-2 text-[14px] text-on-accent no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-3 px-7 py-5 max-md:gap-x-4">
        <Link href="/" aria-label={`${SITE.name}, home`} className="text-ink no-underline">
          <Logo title="" className="h-[40px] w-auto max-md:h-[32px]" />
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
