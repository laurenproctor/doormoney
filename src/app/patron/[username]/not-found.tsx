import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { Theme } from "@/components/Theme";
import { NAV, SITE } from "@/lib/site";

/*
  What a patron address answers when it has nothing to show.

  Every way a patron page can fail arrives here and they all look alike: a username nobody holds, a
  profile nobody published, and a word that moved to a profile nobody published. That sameness is
  the point. A page that said "this profile is private" would say somebody is there, and the list of
  who is on Door Money is not something an address bar should be able to ask for. So there is no
  name, no photograph, no handle, no reason, and no hint that an account exists at all.

  This renders for notFound() thrown inside /patron/[username] and nowhere else. The site's own
  404 (src/app/not-found.tsx) still answers every other missing page, with its struck-out program
  and its "not here" heading, which is a joke about a page and the wrong tone for a person.

  The status is a real 404: the page checks before it renders anything, there is no loading.js in
  this segment and nothing streams first, so Next serves the code rather than a soft 200.

  The metadata is this file's, not the page's. Once notFound() is thrown, the page's own
  generateMetadata is dropped and this boundary's is used, so the head is written here: a title and
  a description that name nobody, and no canonical, no openGraph and no twitter card, because a
  profile nobody published must not have a social preview. Next injects noindex for a 404 on its
  own; the robots entry below makes the intent visible in the file, as src/app/not-found.tsx does.
*/

export const metadata: Metadata = {
  // Absolute: the root layout's template would otherwise append the site name a second time.
  title: { absolute: `Profile unavailable. ${SITE.name}.` },
  description: "This profile isn’t available to view.",
  robots: { index: false, follow: false },
};

/** The nav's pages without the organizer invitation, plus the way in. The foot of the mockup. */
const WAYS_ON = [...NAV.filter((n) => n.href !== "/list"), { href: "/login", label: "Sign in" }];

export default function PatronProfileUnavailable() {
  return (
    <Theme name="red">
      <Nav />
      <main id="main" className="pool flex flex-1 items-center">
        <div className="hero-in mx-auto w-full max-w-[1120px] px-7 py-[clamp(72px,16vh,150px)] text-center">
          {/* mx-auto on every paragraph here: globals.css caps a <p> at 62ch, so one left in the
              middle of a centered column would sit against its left edge rather than under the
              headline. */}
          <p className="caps mx-auto text-[14px] text-muted">{SITE.name}</p>
          <h1 className="display mx-auto mt-7 max-w-[15ch] text-[clamp(38px,6.6vw,84px)] leading-[0.98]">
            Profile unavailable
          </h1>
          <p className="mx-auto mt-6 max-w-[40ch] text-[17px] text-muted">This profile isn’t available to view.</p>
          <div className="mt-10 flex justify-center">
            <ButtonLink href="/fundraisers" arrow>
              Browse projects
            </ButtonLink>
          </div>
        </div>
      </main>
      <QuietFooter />
    </Theme>
  );
}

/*
  A restrained foot, for this route only.

  The global Footer is most of a page: two ways in, the email sign-up, four columns of links and the
  fine print. Under a page whose whole content is one sentence saying there is nothing here, that
  reads as a sales pitch delivered to somebody who knocked on the wrong door. So this is the
  wordmark and the ways on, and the global Footer is untouched and still runs everywhere else.
*/
function QuietFooter() {
  return (
    <footer className="border-t border-line py-9">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-10 gap-y-6 px-7">
        <Link href="/" aria-label={`${SITE.name}, home`} className="text-ink no-underline">
          <Logo title="" className="h-[36px] w-auto max-md:h-[30px]" />
        </Link>
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-x-5 gap-y-3 max-sm:gap-x-4">
          {WAYS_ON.map((w, i) => (
            <span key={w.href} className="flex items-center gap-x-5 max-sm:gap-x-4">
              {i > 0 && <i aria-hidden="true" className="h-4 w-px bg-line max-sm:hidden" />}
              <Link href={w.href} className="caps text-[14px] text-muted no-underline transition-colors hover:text-ink">
                {w.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
