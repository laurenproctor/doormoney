import Link from "next/link";
import { LEGAL, NAV, SITE } from "@/lib/site";
import { Logo } from "@/components/Logo";
import { NewsletterStrip } from "@/components/Newsletter";
import { ButtonLink } from "@/components/Button";

/** The two ways in, repeated at the foot of every page. */
const WAYS = [
  { href: "/auctions", label: "Back a musician", blurb: "Pick a board, take a placement, put the money behind a run." },
  { href: "/list", label: "List an act", blurb: "Open a board in an afternoon. Weekly payouts through the run." },
] as const;

export function Footer({ note }: { note?: string }) {
  return (
    <footer className="border-t border-line pb-12 pt-16">
      <div className="mx-auto max-w-[1120px] px-7">
        {/* The two calls to action, side by side. */}
        <div className="grid gap-px bg-line md:grid-cols-2">
          {WAYS.map((w) => (
            <div key={w.href} className="flex flex-wrap items-center justify-between gap-6 bg-ground py-7 pr-7 md:pr-10">
              <div className="min-w-[220px] flex-1">
                <div className="heading text-[22px] leading-tight">{w.label}</div>
                <p className="mt-1.5 max-w-none text-[14.5px] leading-[1.6] text-muted">{w.blurb}</p>
              </div>
              <ButtonLink href={w.href} variant="ghost" arrow>
                {w.label}
              </ButtonLink>
            </div>
          ))}
        </div>

        <div className="border-t border-line pt-10">
          <NewsletterStrip source="footer" />
        </div>

        <div className="grid gap-12 border-t border-line pt-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-14">
          <div>
            <Logo className="h-[64px] w-auto text-ink max-lg:max-w-full max-md:h-[52px]" />
            <p className="mt-5 max-w-[40ch] text-[15px] leading-[1.7]">{SITE.tagline}</p>
            <p className="mt-3 max-w-[44ch] text-[14.5px] leading-[1.7] text-muted">
              A patronage market for working musicians. Local businesses, brands and fans put money behind a run; Door
              Money holds it and pays the musician every Friday through the run.
              {note ? ` ${note}` : ""}
            </p>
          </div>
          <div>
            <div className="caps mb-4 text-[14px] text-accent-ink">Door Money</div>
            <nav aria-label="Pages" className="grid content-start gap-2.5">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
                  {n.label}
                </Link>
              ))}
              <Link href="/login" className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
                Sign in
              </Link>
              <Link href="/signup" className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
                Sign up
              </Link>
            </nav>
          </div>
          <div>
            <div className="caps mb-4 text-[14px] text-accent-ink">The fine print</div>
            <nav aria-label="Legal" className="grid content-start gap-2.5">
              {LEGAL.map((n) => (
                <Link key={n.href} href={n.href} className="caps text-[14px] text-muted no-underline hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div>
            <div className="caps mb-4 text-[14px] text-accent-ink">Get in touch</div>
            <div className="grid content-start gap-2.5">
              <a href={`mailto:${SITE.contact}`} className="caps break-all text-[14px] text-ink no-underline hover:text-accent-ink">
                {SITE.contact}
              </a>
              <Link href="/contact" className="caps text-[14px] text-muted no-underline hover:text-ink">
                Send a note
              </Link>
              <span className="caps text-[14px] text-muted">{SITE.city}</span>
            </div>
          </div>
        </div>

        <div className="caps mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[14px] text-muted">
          <span>Musicians. Patrons. Together.</span>
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
