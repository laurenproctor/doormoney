"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Close, Code, Dashboard, Favorite, Menu, Microphone, Money, Settings, UserProfile, Wallet } from "@/components/dashboard/icons";
import { currentNavHref, type NavSection } from "@/lib/dashboardModel";

/**
 * The dashboard's navigation, as a rail on a wide screen and a drawer on a narrow one.
 *
 * One component for both so there is one list of destinations and one idea of which is current.
 * The rail is always in the document; the drawer is the same list moved into a dialog when there
 * is no room beside the content.
 */

const ICONS: Record<string, typeof Dashboard> = {
  "/dashboard": Dashboard,
  "/dashboard/runs": Money,
  "/dashboard/act": Microphone,
  "/dashboard/payouts": Wallet,
  "/widget": Code,
  "/patron": Favorite,
  "/dashboard/profile": UserProfile,
  "/dashboard/account": Settings,
};

function Items({ sections, current, onNavigate }: { sections: NavSection[]; current: string | null; onNavigate?: () => void }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="mb-7 last:mb-0">
          <h2 className="caps mb-2 px-4 text-[14px] text-muted">{section.title}</h2>
          <ul className="grid">
            {section.items.map((item) => {
              const Icon = ICONS[item.href] ?? Dashboard;
              const active = current === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-[44px] items-center gap-3 border-l-2 px-4 py-2.5 text-[14.5px] no-underline outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink ${
                      active
                        ? "border-accent bg-accent/12 font-medium text-ink"
                        : "border-transparent text-muted hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    <Icon size={16} aria-hidden="true" className="flex-none" />
                    <span>{item.label}</span>
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

/** The rail. Its own component so it can sit beside the content while the trigger sits in the bar. */
export function WorkspaceRail({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="hidden w-[248px] flex-none border-r border-line py-7 lg:block">
      <Items sections={sections} current={currentNavHref(pathname ?? "", sections)} />
    </nav>
  );
}

/**
 * The menu button and the drawer it opens, for widths with no room for the rail.
 *
 * Both live in the top bar: the button belongs where somebody looks for it, and the drawer is
 * fixed to the viewport so it does not matter which row it was declared in.
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
