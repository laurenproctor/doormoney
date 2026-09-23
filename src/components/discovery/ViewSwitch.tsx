"use client";
import { useSyncExternalStore } from "react";
import {
  DISCOVERY_VIEW_ATTRIBUTE, DISCOVERY_VIEW_LABEL, DISCOVERY_VIEW_STORAGE_KEY, DISCOVERY_VIEWS,
  type DiscoveryView,
} from "@/lib/discovery-view";

/*
  The chosen layout is external state: it lives on the <html> element and in this browser's
  storage, both outside React and either of which can change without React being told. So it is
  read as external state rather than copied into a component, the way ModeToggle reads the room.
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

/** The layout this tab is in, read off the element the inline script already set. */
function readView(): DiscoveryView {
  return document.documentElement.getAttribute(DISCOVERY_VIEW_ATTRIBUTE) === "rows" ? "rows" : "tiles";
}

/**
 * Null on the server, because the server cannot know. React renders this snapshot while hydrating
 * and swaps to the real one immediately after, so the control never claims a state and corrects
 * itself in front of the reader, and a browser with no script never sees a control that cannot act.
 */
function serverView(): DiscoveryView | null {
  return null;
}

function setView(next: DiscoveryView) {
  const root = document.documentElement;
  if (next === "rows") root.setAttribute(DISCOVERY_VIEW_ATTRIBUTE, "rows");
  else root.removeAttribute(DISCOVERY_VIEW_ATTRIBUTE);
  // A browser with storage blocked still switches; it just will not remember next time.
  try { localStorage.setItem(DISCOVERY_VIEW_STORAGE_KEY, next); } catch { /* nothing to be done about it */ }
  for (const notify of listeners) notify();
}

/**
 * Tiles or rows.
 *
 * Two buttons, one pressed. Switching changes the attribute the CSS reads and nothing else: not the
 * address, not the filters, not the sort, not the page, and it asks the server for nothing. The
 * pressed state is carried by aria-pressed as well as by the edge and the fill, so it never rests
 * on colour alone. Each button is a comfortable target and takes the page's readable tint.
 */
export function ViewSwitch({ className = "" }: { className?: string }) {
  const view = useSyncExternalStore(subscribe, readView, serverView);

  // Before hydration there is no honest answer, so the space is held and nothing is claimed.
  if (!view) return <span aria-hidden="true" className={`inline-block h-11 w-[172px] ${className}`} />;

  return (
    <div role="group" aria-label="Results view" className={`inline-flex ${className}`}>
      {DISCOVERY_VIEWS.map((v) => {
        const pressed = view === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={pressed}
            onClick={() => { if (!pressed) setView(v); }}
            className={`caps inline-flex h-11 cursor-pointer items-center gap-2.5 border px-4 text-[14px] transition-colors first:border-r-0 ${
              pressed ? "border-accent-line bg-panel text-accent-ink" : "border-field-line text-muted hover:text-ink"
            }`}
          >
            {v === "tiles" ? <TilesIcon /> : <RowsIcon />}
            {DISCOVERY_VIEW_LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}

/*
  Drawn here rather than installed, the way the mode toggle's glyphs are: stroked in the current
  text colour at 1.5px, the thin line the design system uses everywhere, and hidden from readers
  because the word beside each one is the label.
*/
const SHARED = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** Four squares, two by two. */
function TilesIcon() {
  return (
    <svg {...SHARED}>
      <rect x="3.5" y="3.5" width="7" height="7" />
      <rect x="13.5" y="3.5" width="7" height="7" />
      <rect x="3.5" y="13.5" width="7" height="7" />
      <rect x="13.5" y="13.5" width="7" height="7" />
    </svg>
  );
}

/** Three lines, one under another. */
function RowsIcon() {
  return (
    <svg {...SHARED}>
      <path d="M3.5 6h17M3.5 12h17M3.5 18h17" />
    </svg>
  );
}
