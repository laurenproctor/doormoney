import Link from "next/link";
import { LEGAL, NAV, SITE } from "@/lib/site";
import { Logo } from "@/components/Logo";
import { NewsletterStrip } from "@/components/Newsletter";
import { ButtonLink } from "@/components/Button";

/*
  The foot of every page: the two ways in, the email ask, the links, the fine print.

  It is navigation with one call to action, not a second marketing page. The two ways in used to
  carry a paragraph each and the block below the wordmark restated the product; both were the
  homepage again, at the bottom of every page, including the pages that had just said it.
*/
const WAYS = [
  { href: "/fundraisers", label: "Find a sponsorship" },
  { href: "/list", label: "Create a fundraiser" },
] as const;

/**
 * @param note  A line under the wordmark, for a page that owes the reader one.
 * @param ways  False leaves the two ways in out. A page whose whole subject is one person closes
 *   on that person, not on two links somewhere else; the patron profile is the one that asks for
 *   it. Everything below, the email ask, the links and the fine print, stays exactly as it is.
 */
export function Footer({ note, ways = true }: { note?: string; ways?: boolean }) {
  return (
    <footer className="border-t border-line pb-12 pt-16">
      <div className="mx-auto max-w-[1120px] px-7">
        {ways && (
          /* The two ways in, on one line. */
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-6 pb-12">
            <p className="heading max-w-[20ch] text-[clamp(22px,2.8vw,30px)] leading-[1.15]">
              Find a sponsorship, or create a fundraiser.
            </p>
            <div className="flex flex-wrap gap-4">
              {WAYS.map((w) => (
                <ButtonLink key={w.href} href={w.href} variant="ghost" arrow>
                  {w.label}
                </ButtonLink>
              ))}
            </div>
          </div>
        )}

        {/* The rule belongs to the block above it, so with no block above there is no rule. */}
        <div className={ways ? "border-t border-line pt-10" : ""}>
          <NewsletterStrip source="footer" />
        </div>

        <div className="grid gap-12 border-t border-line pt-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-14">
          <div>
            <Logo className="h-[64px] w-auto text-ink max-lg:max-w-full max-md:h-[52px]" />
            <p className="mt-5 max-w-[40ch] text-[15px] leading-[1.7]">{SITE.tagline}</p>
            {note && <p className="mt-3 max-w-[44ch] text-[14.5px] leading-[1.7] text-muted">{note}</p>}
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
                Create an account
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
            </div>
          </div>
        </div>

        <div className="caps mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[14px] text-muted">
          <span>{SITE.signoff}</span>
          <span>{SITE.origin}</span>
          <span>
            &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}
