"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions/auth";
import {
  Close,
  Dashboard,
  Favorite,
  Logout,
  Menu,
  Microphone,
  Money,
  Settings,
  SidePanelClose,
  SidePanelOpen,
  UserProfile,
  Wallet,
} from "@/components/dashboard/icons";
import { Logo } from "@/components/Logo";
import { currentNavHref, type NavSection } from "@/lib/dashboardModel";
import { RAIL_ATTRIBUTE, RAIL_STORAGE_KEY, otherRailState, railLabel, type RailState } from "@/lib/rail";

/**
 * The workspace's navigation, as a rail down the left on a wide screen and a drawer on a narrow one.
 *
 * One component for both so there is one list of destinations and one idea of which is current.
 * The rail is always in the document; the drawer is the same list moved into a dialog when there
 * is no room beside the content.
 *
 * On the Desk register (docs/DESK_REGISTER.md) the rail holds the whole left edge: the wordmark at
 * the top, the destinations under it, and the account block at the foot, with whatever the page
 * hands down as `note` above it. The section names are read rather than shown, because caps on
 * this register belong to a status word inside a badge and nothing else; a hairline between the
 * groups is what a sighted reader gets instead.
 *
 * The rail can be folded to its icons. The fold is an attribute on <html> (src/lib/rail.ts) that
 * the `rail-collapsed` variant reads, so the list below does not know whether it is folded: its
 * classes say what each piece does in either state, and the drawer, which never folds, simply
 * has no such attribute above it while it is open on a narrow screen. Every name stays in the
 * document when folded, for a screen reader, and comes back into view beside its icon on hover
 * and on keyboard focus.
 */

const ICONS: Record<string, typeof Dashboard> = {
  "/dashboard": Dashboard,
  "/dashboard/runs": Money,
  "/dashboard/act": Microphone,
  "/dashboard/payouts": Wallet,
  "/patron": Favorite,
  "/dashboard/profile": UserProfile,
  "/dashboard/account": Settings,
};

/** The id the toggle names as what it opens and closes. One rail per page, so one id. */
const RAIL_LIST_ID = "workspace-rail-list";

/** What the account block shows, and what the drawer shows at its foot. */
export type WorkspaceAccount = {
  /** The account holder's own name. */
  identity?: string | null;
  /** The organizer they are working on, beneath it. */
  actName?: string | null;
};

/**
 * Two letters for the avatar, taken from whichever name the page knows. Initials are not an
 * identity, so the circle is decoration and the name beside it is what is read aloud.
 */
function initials(account: WorkspaceAccount): string {
  const name = (account.identity || account.actName || "").trim();
  if (!name) return "";
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : words[0].slice(0, 2);
  return letters.toUpperCase();
}

/**
 * A name shown beside an icon when the rail is folded. Hidden from assistive technology because
 * the real name is still in the link; this is only the sighted reader's copy of it.
 */
function Tip({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-control border border-line bg-surface px-3 py-1.5 text-[14px] text-ink opacity-0 shadow-1 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rail-collapsed:block"
    >
      {children}
    </span>
  );
}

function Items({
  sections,
  current,
  onNavigate,
  foldable = false,
}: {
  sections: NavSection[];
  current: string | null;
  onNavigate?: () => void;
  /** True for the rail, which may be folded. The drawer passes nothing and never folds. */
  foldable?: boolean;
}) {
  // The folded classes are written only into the rail, so the drawer cannot inherit a fold from the
  // attribute on <html> while it is open on a narrow screen.
  const f = (classes: string) => (foldable ? classes : "");
  return (
    <>
      {sections.map((section, index) => (
        <div key={section.title} className="mb-1.5 last:mb-0">
          {index > 0 && <div aria-hidden="true" className="mx-4 my-2.5 border-t border-line" />}
          {/* Read, not shown: the grouping is a hairline to the eye and a heading to a reader. */}
          <h2 className="sr-only">{section.title}</h2>
          <ul className="grid gap-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.href] ?? Dashboard;
              const active = current === item.href;
              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative mx-3 flex items-center gap-2.5 rounded-control px-2.5 text-[14px] no-underline outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink ${
                      foldable ? "min-h-[40px]" : "min-h-[44px]"
                    } ${
                      active
                        ? "bg-ok-wash font-medium text-ink"
                        : "text-muted hover:bg-neutral-wash hover:text-ink"
                    } ${f("rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:px-0")}`}
                  >
                    {/* The page's light, on the rail's own edge rather than on the pill. */}
                    {active && (
                      <span aria-hidden="true" className="absolute -left-3 top-2 bottom-2 w-[2px] rounded-full bg-accent-line" />
                    )}
                    <Icon size={18} aria-hidden="true" className="flex-none" />
                    <span className={`truncate ${f("rail-collapsed:sr-only")}`}>{item.label}</span>
                    {foldable && <Tip>{item.label}</Tip>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * The foot of the rail and of the drawer: whatever the page had to say about a clock, the account
 * holder and the organizer they are working on, and the way out.
 *
 * `note` is a slot rather than a sentence, because the shell knows nothing about bidding. A page
 * with no open fundraiser passes nothing and nothing is drawn.
 */
function AccountBlock({
  account,
  note,
  foldable = false,
}: {
  account: WorkspaceAccount;
  note?: ReactNode;
  foldable?: boolean;
}) {
  const f = (classes: string) => (foldable ? classes : "");
  const letters = initials(account);
  return (
    <div className="mt-auto pt-3">
      {note && (
        <div className={`mx-3 mb-2 rounded-control border border-line px-3 py-2.5 text-[14px] text-muted ${f("rail-collapsed:hidden")}`}>
          {note}
        </div>
      )}
      {(account.identity || account.actName) && (
        <div className={`mx-3 flex items-center gap-2.5 px-2.5 py-1.5 ${f("rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:px-0")}`}>
          {letters && (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-neutral-wash text-[14px] font-medium text-ink"
            >
              {letters}
            </span>
          )}
          <span className={`flex min-w-0 flex-col leading-tight ${f("rail-collapsed:sr-only")}`}>
            {account.identity && <span className="truncate text-[14px] font-medium text-ink">{account.identity}</span>}
            {account.actName && <span className="truncate text-[14px] text-muted">{account.actName}</span>}
          </span>
        </div>
      )}
      <form action={signOut}>
        <button
          type="submit"
          className={`group relative mx-3 flex min-h-[40px] w-[calc(100%-1.5rem)] cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-[14px] text-muted outline-none transition-colors hover:bg-neutral-wash hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink ${f("rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:px-0")}`}
        >
          <Logout size={18} aria-hidden="true" className="flex-none" />
          <span className={f("rail-collapsed:sr-only")}>Sign out</span>
          {foldable && <Tip>Sign out</Tip>}
        </button>
      </form>
    </div>
  );
}

/*
  The fold is external state: it lives on the <html> element and in this browser's storage, both
  outside React and either of which can change without React being told. So it is read as external
  state rather than copied into a component, the way the room is (ModeToggle), and two tabs of the
  dashboard stay in step with each other for free.
*/
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The state this tab is in, read off the element the inline script already set. */
function readRail(): RailState {
  return document.documentElement.getAttribute(RAIL_ATTRIBUTE) === "collapsed" ? "collapsed" : "expanded";
}

/** Null on the server, because the server cannot know. */
function serverRail(): RailState | null {
  return null;
}

function setRail(next: RailState) {
  const root = document.documentElement;
  if (next === "collapsed") root.setAttribute(RAIL_ATTRIBUTE, "collapsed");
  else root.removeAttribute(RAIL_ATTRIBUTE);
  // A browser with storage blocked still folds the rail; it just will not remember next time.
  try { localStorage.setItem(RAIL_STORAGE_KEY, next); } catch { /* nothing to be done about it */ }
  for (const notify of listeners) notify();
}

/**
 * Folds the rail to its icons, and opens it back out.
 *
 * The label names what pressing it does, never the state it is in. `aria-expanded` carries the
 * state for anybody listening rather than looking, and `aria-controls` names the list it acts on.
 * Before hydration there is no honest answer, so the row holds its height and claims nothing; the
 * CSS has already drawn the rail in the right state by then, so nothing moves when the button
 * arrives.
 */
function RailToggle() {
  const state = useSyncExternalStore(subscribe, readRail, serverRail);
  if (!state) return <div aria-hidden="true" className="mx-3 mb-1 min-h-[36px]" />;

  const next = otherRailState(state);
  const label = railLabel(next);
  const Icon = next === "collapsed" ? SidePanelClose : SidePanelOpen;
  return (
    <button
      type="button"
      onClick={() => setRail(next)}
      aria-expanded={state === "expanded"}
      aria-controls={RAIL_LIST_ID}
      title={label}
      className="group relative mx-3 mb-1 flex min-h-[36px] w-[calc(100%-1.5rem)] cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-[14px] text-muted outline-none transition-colors hover:bg-neutral-wash hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:px-0"
    >
      <Icon size={18} aria-hidden="true" className="flex-none" />
      <span className="rail-collapsed:sr-only">
        {next === "collapsed" ? "Collapse" : "Expand"}
        <span className="sr-only"> the navigation</span>
      </span>
      <Tip>{label}</Tip>
    </button>
  );
}

/** The wordmark at the top of the rail, cut to the monogram when the rail is folded. */
function RailBrand() {
  return (
    <Link
      href="/"
      aria-label="Door Money, home"
      className="mx-3 mb-3 flex min-h-[40px] items-center rounded-control px-2.5 text-ink no-underline outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink rail-collapsed:justify-center rail-collapsed:px-0"
    >
      <Logo title="" className="h-[22px] w-auto rail-collapsed:hidden" />
      <Logo title="" variant="mark" className="hidden h-[22px] w-auto rail-collapsed:block" />
    </Link>
  );
}

/** The rail. Its own component so it can hold the left edge while the page scrolls beside it. */
export function WorkspaceRail({
  sections,
  account,
  note,
}: {
  sections: NavSection[];
  account: WorkspaceAccount;
  note?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Workspace"
      // `relative z-10` so a name shown beside a folded rail is drawn over the page, not under it.
      className="sticky top-0 z-10 hidden h-dvh w-[232px] flex-none flex-col overflow-y-auto border-r border-line bg-surface py-3.5 transition-[width] duration-200 ease-out lg:flex rail-collapsed:w-[68px]"
    >
      <RailBrand />
      <RailToggle />
      <div id={RAIL_LIST_ID}>
        <Items sections={sections} current={currentNavHref(pathname ?? "", sections)} foldable />
      </div>
      <AccountBlock account={account} note={note} foldable />
    </nav>
  );
}

/**
 * The menu button and the drawer it opens, for widths with no room for the rail.
 *
 * Both live in the top bar: the button belongs where somebody looks for it, and the drawer is
 * fixed to the viewport so it does not matter which row it was declared in. The drawer never
 * folds: on a narrow screen it is open or closed, and open means names beside icons.
 */
export function WorkspaceMenu({
  sections,
  account,
  note,
}: {
  sections: NavSection[];
  account: WorkspaceAccount;
  note?: ReactNode;
}) {
  const pathname = usePathname();
  const current = currentNavHref(pathname ?? "", sections);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Escape closes it, and the cursor goes back to the button that opened it rather than to the top
  // of the document. Focus moves into the drawer so the next Tab is inside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="-ml-1.5 flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-control text-ink outline-none transition-colors hover:bg-neutral-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
        <span className="sr-only">Menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close the menu" onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-ground/80" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 id={titleId} className="text-[14px] text-muted">Workspace</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="flex h-[44px] w-[44px] items-center justify-center rounded-control text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
              >
                <Close size={20} aria-hidden="true" />
                <span className="sr-only">Close the menu</span>
              </button>
            </div>
            <div className="flex flex-1 flex-col py-4">
              <Items sections={sections} current={current} onNavigate={() => setOpen(false)} />
              <AccountBlock account={account} note={note} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
