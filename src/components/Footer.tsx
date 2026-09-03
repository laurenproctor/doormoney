import Link from "next/link";
import { LEGAL, NAV, SITE } from "@/lib/site";
import { Logo } from "@/components/Logo";
import { NewsletterStrip } from "@/components/Newsletter";

export function Footer({ note }: { note?: string }) {
  return (
    <footer className="border-t border-line pb-12 pt-16">
      <div className="mx-auto max-w-[1120px] px-7">
        <NewsletterStrip source="footer" />
        <div className="grid gap-12 pt-12 md:grid-cols-[1fr_auto_auto] md:gap-20">
          <div>
            <Logo className="h-[64px] w-auto text-ink max-md:h-[52px]" />
            <p className="mt-4 max-w-[44ch] text-[14.5px] leading-[1.7] text-muted">
              {SITE.tagline}
              {note ? ` ${note}` : ""}
            </p>
          </div>
          <nav aria-label="Pages" className="grid content-start gap-2.5">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
                {n.label}
              </Link>
            ))}
            <Link href="/login" className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
              Musician sign-in
            </Link>
          </nav>
          <nav aria-label="Legal" className="grid content-start gap-2.5">
            {LEGAL.map((n) => (
              <Link key={n.href} href={n.href} className="caps text-[14px] text-muted no-underline hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="caps mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[14px] text-muted">
          <span>
            Made with{" "}
            <span role="img" aria-label="love">
              ❤️
            </span>{" "}
            in NYC
          </span>
          <span>
            &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}
