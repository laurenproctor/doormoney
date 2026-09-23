"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  Close,
  Code,
  Dashboard,
  Favorite,
  Menu,
  Microphone,
  Money,
  Settings,
  SidePanelClose,
  SidePanelOpen,
  UserProfile,
  Wallet,
} from "@/components/dashboard/icons";
import { currentNavHref, type NavSection } from "@/lib/dashboardModel";
import { RAIL_ATTRIBUTE, RAIL_STORAGE_KEY, otherRailState, railLabel, type RailState } from "@/lib/rail";

/**
 * The dashboard's navigation, as a rail on a wide screen and a drawer on a narrow one.
 *
 * One component for both so there is one list of destinations and one idea of which is current.
 * The rail is always in the document; the drawer is the same list moved into a dialog when there
 * is no room beside the content.
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
  "/dashboard/widget": Code,
  "/widget": Code,
  "/patron": Favorite,
  "/dashboard/profile": UserProfile,
  "/dashboard/account": Settings,
};

/** The id the toggle names as what it opens and closes. One rail per page, so one id. */
const RAIL_LIST_ID = "workspace-rail-list";

/**
 * A name shown beside an icon when the rail is folded. Hidden from assistive technology because
 * the real name is still in the link; this is only the sighted reader's copy of it.
 */
function Tip({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="edge pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden -translate-y-1/2 whitespace-nowrap bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))] px-3 py-1.5 text-[14px] text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rail-collapsed:block"
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
        <div key={section.title} className={`mb-7 last:mb-0 ${f("rail-collapsed:mb-4")}`}>
          {index > 0 && <div aria-hidden="true" className={`mx-4 mb-4 hidden border-t border-line ${f("rail-collapsed:block")}`} />}
          <h2 className={`caps mb-2 px-4 text-[14px] text-muted ${f("rail-collapsed:sr-only")}`}>{section.title}</h2>
          <ul className="grid">
            {section.items.map((item) => {
              const Icon = ICONS[item.href] ?? Dashboard;
              const active = current === item.href;
              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex min-h-[44px] items-center gap-3 border-l-2 px-4 py-2.5 text-[14.5px] no-underline outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink ${
                      active
                        ? "border-accent bg-accent/12 font-medium text-ink"
                        : "border-transparent text-muted hover:bg-ink/5 hover:text-ink"
                    } ${f("rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:border-r-2 rail-collapsed:border-r-transparent rail-collapsed:px-0")}`}
                  >
                    <Icon size={18} aria-hidden="true" className={`flex-none ${f("rail-collapsed:h-5 rail-collapsed:w-5")}`} />
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
  if (!state) return <div aria-hidden="true" className="mb-4 min-h-[44px]" />;

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
      className="group caps relative mb-4 flex min-h-[44px] w-full cursor-pointer items-center gap-3 border-l-2 border-transparent px-4 text-[14px] text-muted outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:border-r-2 rail-collapsed:border-r-transparent rail-collapsed:px-0"
    >
      <Icon size={18} aria-hidden="true" className="flex-none rail-collapsed:h-5 rail-collapsed:w-5" />
      {/* One word in view, the whole phrase to a screen reader: the caps label wraps at the rail's width otherwise. */}
      <span className="rail-collapsed:sr-only">
        {next === "collapsed" ? "Collapse" : "Expand"}
        <span className="sr-only"> the navigation</span>
      </span>
      <Tip>{label}</Tip>
    </button>
  );
}

/** The rail. Its own component so it can sit beside the content while the trigger sits in the bar. */
export function WorkspaceRail({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Dashboard"
      // `relative z-10` so a name shown beside a folded rail is drawn over the page, not under it.
      className="relative z-10 hidden w-[248px] flex-none border-r border-line py-4 transition-[width] duration-200 ease-out lg:block rail-collapsed:w-[68px]"
    >
      <RailToggle />
      <div id={RAIL_LIST_ID}>
        <Items sections={sections} current={currentNavHref(pathname ?? "", sections)} foldable />
      </div>
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
export function WorkspaceMenu({ sections }: { sections: NavSection[] }) {
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
        className="caps flex min-h-[44px] items-center gap-2 px-2 text-[14px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
        Menu
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close the menu" onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-ground/80" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-line bg-ground"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 id={titleId} className="caps text-[14px] text-muted">Dashboard</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="flex h-[44px] w-[44px] items-center justify-center text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
              >
                <Close size={20} aria-hidden="true" />
                <span className="sr-only">Close the menu</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-6">
              <Items sections={sections} current={current} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
