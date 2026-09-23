import Link from "next/link";
import type { ReactNode } from "react";
import { Launch } from "@/components/dashboard/icons";
import { Card as DeskCard } from "@/components/desk/Card";
import { ModeToggle } from "@/components/ModeToggle";
import { Theme, type ThemeName } from "@/components/Theme";
import { WorkspaceMenu, WorkspaceRail } from "@/components/dashboard/WorkspaceNav";
import { currentNavHref, dashboardNav, type NavSection } from "@/lib/dashboardModel";
import { actPath } from "@/lib/urls";

/**
 * The signed-in workspace, on the Desk register (docs/DESK_REGISTER.md, decision 20).
 *
 * Same room and same light as the public site, scanned rather than read: the stage rig holds
 * still, one pool of the accent sits at the top of the page, and everything below is a surface
 * with a hairline around it. The register is `data-register="desk"` on the wrapper, which is what
 * the block of CSS at the top of globals.css is scoped to.
 *
 * Three pieces: the rail down the left (wordmark, destinations, the account block at its foot),
 * a top bar (where the reader is, the room switch, the organizer's public page, and the page's
 * one primary action), and the page beside them. No marketing nav and no public footer, because
 * somebody signed in is working rather than being sold to.
 *
 * The props are the ones every dashboard page already passed, so no call site had to move. `theme`
 * is the new one and defaults to blue: a page hands down `themeFor(act.slug)` for an organizer,
 * the patron's own choice on /patron, and mono on /admin, so the workspace is lit the same colour
 * as the pages it is about. `nav` is a page's own list of destinations; a page that does not pass
 * it gets the organizer's, and a page still passing the old flat `links` gets them in one group.
 *
 * `identity` is passed in rather than looked up here. This file also exports the field classes
 * every dashboard form uses, so it is imported by client components: one import of src/lib/auth
 * would pull the service-role client into the browser bundle, and the build says so.
 */
export function DashboardShell({
  current,
  actName,
  actSlug,
  identity,
  theme = "blue",
  eyebrow,
  title,
  accent,
  titleAside,
  intro,
  action,
  note,
  nav,
  links,
  children,
}: {
  current: string;
  actName?: string | null;
  /** The organizer's own address, so the bar can offer the page a sponsor would see. */
  actSlug?: string | null;
  /** The account holder's own name, from the page that already read the profile. */
  identity?: string | null;
  /** The colour of light this page works under. Blue until a page says otherwise. */
  theme?: ThemeName;
  /** The line above the H1. A string on most pages, a breadcrumb where a page is a step in one. */
  eyebrow: ReactNode;
  title: string;
  accent: string;
  /** What sits beside the H1: a state, said in a badge, and nothing longer. */
  titleAside?: ReactNode;
  intro?: ReactNode;
  /** The page's one primary action, at the right of the top bar. */
  action?: ReactNode;
  /** A line above the account block: a clock the page is watching, and nothing else. */
  note?: ReactNode;
  nav?: NavSection[];
  /** The flat list the shell used to take. Kept so older call sites keep working. */
  links?: readonly { href: string; label: string }[];
  children: ReactNode;
}) {
  const sections: NavSection[] =
    nav ?? (links ? [{ title: "Dashboard", items: [...links] }] : dashboardNav({ hasAct: true, roles: [] }));
  const account = { identity, actName };

  // Where the reader is, in the words of the rail. A page outside the rail (admin, the widget
  // snippet) falls back to its own H1, both halves of it, because the accent word is half the
  // sentence: "On your" and "site" are one name.
  const here =
    sections.flatMap((s) => s.items).find((i) => i.href === currentNavHref(current, sections))?.label ??
    [title, accent].filter(Boolean).join(" ");

  return (
    <Theme name={theme} lights={false}>
      <div data-register="desk" className="flex min-h-0 flex-1 items-stretch">
        <a
          href="#main"
          className="sr-only rounded-control bg-accent px-4 py-2 text-[14px] text-on-accent no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
        >
          Skip to content
        </a>

        <WorkspaceRail sections={sections} account={account} note={note} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex min-h-[56px] items-center gap-3 border-b border-line bg-ground px-4 sm:px-6">
            <WorkspaceMenu sections={sections} account={account} note={note} />
            <nav aria-label="Breadcrumb" className="min-w-0 text-[14px] text-muted">
              <ol className="flex min-w-0 items-center gap-1.5">
                {(actName || identity) && (
                  <li className="hidden min-w-0 items-center gap-1.5 sm:flex">
                    <span className="truncate">{actName || identity}</span>
                    <span aria-hidden="true">/</span>
                  </li>
                )}
                <li className="min-w-0 truncate font-medium text-ink" aria-current="page">{here}</li>
              </ol>
            </nav>
            <div className="ml-auto flex flex-none items-center gap-2">
              <ModeToggle className="mr-1" />
              {actSlug && (
                <Link
                  href={actPath(actSlug)}
                  className="hidden min-h-[36px] items-center gap-1.5 rounded-control border border-field-line px-3.5 text-[14px] font-medium text-ink no-underline transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink sm:inline-flex"
                >
                  Public page
                  <Launch size={14} aria-hidden="true" />
                </Link>
              )}
              {action}
            </div>
          </header>

          <main id="main" className="relative min-w-0 flex-1">
            {/* The rig holds still on this register: one pool of the page's light, and no lamps. */}
            <div aria-hidden="true" className="pool-static pointer-events-none absolute inset-x-0 top-0 h-[360px]" />
            <div className="relative mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-7">
              <div className="mb-6 flex flex-col gap-2.5">
                {eyebrow && <p className="text-[14px] text-muted">{eyebrow}</p>}
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                  <h1 className="display">
                    {title} {accent && <em className="text-accent-ink">{accent}</em>}
                  </h1>
                  {titleAside}
                </div>
                {intro && <div className="max-w-[62ch] text-[15px] leading-[1.6] text-muted">{intro}</div>}
              </div>
              {children}
            </div>
          </main>
        </div>
      </div>
    </Theme>
  );
}

/**
 * A panel for every dashboard block: the Desk register's `Card` under the signature the pages
 * already call it with. One card, one surface, one 8px corner. The pages that pass a `title` to
 * the new one are being written in PRs 3 and 4; until then they head themselves with `CardHead`
 * and this passes their markup straight through.
 */
export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <DeskCard id={id} className={`scroll-mt-20 ${className}`}>
      {children}
    </DeskCard>
  );
}

/**
 * A card's heading. `level` is for a page that groups its cards under headings of their own: the
 * card then sits a level down, so a screen reader reads the sections and their cards in order
 * rather than a flat row of equals.
 *
 * The eyebrow above it is plain and muted on this register, not tracked caps: caps on the Desk
 * belong to a status word inside a badge and nothing else.
 */
export function CardHead({ eyebrow, children, level = 2 }: { eyebrow: string; children: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[14px] text-muted">{eyebrow}</span>
      <Heading className="heading text-[18px] leading-tight text-ink">{children}</Heading>
    </div>
  );
}

/**
 * Shared input styling for dashboard forms. A 6px corner, because on this register a control has
 * one, and a label in sentence case, because caps here belong to a status word inside a badge.
 */
export const inputClass = "field w-full rounded-control bg-transparent px-3.5 py-3 text-[15px]";
export const labelClass = "mb-2 block text-[14px] text-muted";
