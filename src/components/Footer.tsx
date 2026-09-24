import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { signedInAccount } from "@/lib/auth";
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
/*
  The two ways in. The first is the one most readers want, so it is the filled control and the
  second is the outline beside it; two ghosts side by side made the reader pick between two
  equals at the end of every page.
*/
const WAYS = [
  { href: "/fundraisers", label: "Find a sponsorship", line: "Browse what organizers are offering." },
  { href: "/list", label: "Create a fundraiser", line: "Raise money for work of your own." },
] as const;

/**
 * @param note  A line under the wordmark, for a page that owes the reader one.
 * @param ways  False leaves the two ways in out. A page whose whole subject is one person closes
 *   on that person, not on two links somewhere else; the patron profile is the one that asks for
 *   it. Everything below, the email ask, the links and the fine print, stays exactly as it is.
 */
export async function Footer({ note, ways = true }: { note?: string; ways?: boolean }) {
  // Who is signed in, if anybody, so the foot of the page offers the dashboard rather than the way in.
  const account = await signedInAccount();
  return (
    <footer className="border-t border-line pb-12 pt-16">
      <div className="mx-auto max-w-[1120px] px-7">
        {ways && (
          <div className="grid gap-8 pb-14 lg:grid-cols-[minmax(0,22ch)_1fr] lg:items-start lg:gap-16">
            <p className="heading text-[clamp(22px,2.8vw,30px)] leading-[1.15]">
              Find a sponsorship, or create a fundraiser.
            </p>
            {/* One card each, so the two ways read as two choices rather than two buttons. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {WAYS.map((w, i) => (
                <div key={w.href} className="edge flex flex-col items-start gap-4 bg-panel p-6 max-sm:p-5">
                  <p className="text-[15px] leading-[1.6] text-muted">{w.line}</p>
                  <ButtonLink href={w.href} variant={i === 0 ? "solid" : "ghost"} arrow className="mt-auto max-sm:w-full">
                    {w.label}
                  </ButtonLink>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The rule belongs to the block above it, so with no block above there is no rule. */}
        <div className={ways ? "border-t border-line pt-14" : ""}>
          <NewsletterStrip source="footer" />
        </div>

        <div className="mt-14 grid gap-12 border-t border-line pt-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-14">
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
              {account ? (
                <>
                  <Link href="/dashboard" className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
                    Dashboard
                  </Link>
                  <form action={signOut}>
                    <button type="submit" className="caps cursor-pointer text-[14px] text-ink hover:text-accent-ink">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
                    Sign in
                  </Link>
                  <Link href="/signup" className="caps text-[14px] text-ink no-underline hover:text-accent-ink">
                    Create an account
                  </Link>
                </>
              )}
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
