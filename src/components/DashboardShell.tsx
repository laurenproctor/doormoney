import Link from "next/link";
import type { ReactNode } from "react";
import { Logout } from "@/components/dashboard/icons";
import { Logo } from "@/components/Logo";
import { Eyebrow } from "@/components/Brand";
import { Theme } from "@/components/Theme";
import { WorkspaceMenu, WorkspaceRail } from "@/components/dashboard/WorkspaceNav";
import { signOut } from "@/app/actions/auth";
import { dashboardNav, type NavSection } from "@/lib/dashboardModel";

/**
 * The signed-in workspace: a utility bar across the top, navigation down the left, and the page
 * beside it. No marketing nav and no public footer, because somebody signed in is working rather
 * than being sold to, and the newsletter has no business over a payout total.
 *
 * The props are the ones every dashboard page already passed, so the call sites did not have to
 * move. `nav` is the new one; a page that does not pass it gets the musician's sections, and a
 * page still passing the old flat `links` gets them in one unnamed group.
 *
 * The bar names the person, then the organizer beside them. It used to name only the organizer,
 * which made the workspace read as the band's rather than as the account holder's, and left an
 * account with no organizer profile with nothing up there at all. The person is the account; the
 * organizer is context.
 *
 * `identity` is passed in rather than looked up here. This file also exports the field classes
 * every dashboard form uses, so it is imported by client components: one import of src/lib/auth
 * would pull the service-role client into the browser bundle, and the build says so.
 */
export function DashboardShell({
  current,
  actName,
  identity,
  eyebrow,
  title,
  accent,
  intro,
  nav,
  links,
  children,
}: {
  current: string;
  actName?: string | null;
  /** The account holder's own name, from the page that already read the profile. */
  identity?: string | null;
  /** The line above the H1. A string on most pages, a breadcrumb where a page is a step in one. */
  eyebrow: ReactNode;
  title: string;
  accent: string;
  intro?: ReactNode;
  nav?: NavSection[];
  /** The flat list the shell used to take. Kept so older call sites keep working. */
  links?: readonly { href: string; label: string }[];
  children: ReactNode;
}) {
  void current;
  const sections: NavSection[] =
    nav ?? (links ? [{ title: "Dashboard", items: [...links] }] : dashboardNav({ hasAct: true, roles: [] }));

  return (
    <Theme name="blue">
      <a
        href="#main"
        className="caps sr-only bg-accent px-4 py-2 text-[14px] text-on-accent no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-ground px-3 py-2.5 sm:px-4">
        <WorkspaceMenu sections={sections} />
        <Link
          href="/"
          aria-label="Door Money, home"
          className="inline-flex min-h-[44px] items-center text-ink no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <Logo title="" className="h-[26px] w-auto" />
        </Link>
        {(identity || actName) && (
          <span className="caps hidden min-w-0 items-center gap-2 text-[14px] text-muted sm:flex" title={[identity, actName].filter(Boolean).join(", ")}>
            {identity && <span className="truncate text-ink">{identity}</span>}
            {identity && actName && <span aria-hidden="true" className="flex-none">&middot;</span>}
            {actName && <span className="truncate">{actName}</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <form action={signOut}>
            <button
              type="submit"
              className="caps flex min-h-[44px] cursor-pointer items-center gap-2 px-3 text-[14px] text-muted outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
            >
              <Logout size={16} aria-hidden="true" />
              {/* The words are the label on a screen with room, and the icon carries it when not. */}
              <span className="max-[420px]:sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-stretch">
        <WorkspaceRail sections={sections} />
        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 lg:px-8">
            <div className="mb-7">
              <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
              <h1 className="display text-[clamp(28px,4.4vw,44px)] leading-[1.02]">
                {title} {accent && <em className="text-accent-ink">{accent}</em>}
              </h1>
              {intro && <div className="mt-4 max-w-[62ch] text-[15px] leading-[1.6] text-muted">{intro}</div>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </Theme>
  );
}

/**
 * A panel for every dashboard block.
 *
 * Opaque rather than translucent: three stage lights swing behind this page, and a table of
 * figures should not change contrast as they pass. Same colour the sign-up panel uses, mixed from
 * the existing tokens rather than added to them.
 */
export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`edge min-w-0 scroll-mt-20 bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))] p-6 ${className}`}>
      {children}
    </div>
  );
}

/**
 * A card's heading. `level` is for a page that groups its cards under headings of their own: the
 * card then sits a level down, so a screen reader reads the sections and their cards in order
 * rather than a flat row of equals.
 */
export function CardHead({ eyebrow, children, level = 2 }: { eyebrow: string; children: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <>
      <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
      <Heading className="heading mb-4 text-[clamp(20px,2.6vw,26px)] leading-tight">{children}</Heading>
    </>
  );
}

/** Shared input styling for dashboard forms. */
export const inputClass = "field w-full bg-transparent px-3.5 py-3 text-[15px]";
export const labelClass = "caps mb-2 block text-[14px] text-muted";
