"use client";
import { useSyncExternalStore } from "react";
import { MODE_ATTRIBUTE, MODE_STORAGE_KEY, modeLabel, otherMode, type Mode } from "@/lib/mode";

/*
  The chosen room is external state: it lives on the <html> element and in this browser's storage,
  both of which are outside React and either of which can change without React being told. So it is
  read as external state rather than copied into a component, which also means two tabs of the site
  stay in step with each other for free.
*/
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab switching rooms. Same browser, same storage, so this tab follows.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The room this tab is standing in, read off the element the inline script already set. */
function readMode(): Mode {
  return document.documentElement.getAttribute(MODE_ATTRIBUTE) === "light" ? "light" : "dark";
}

/**
 * Null on the server, because the server cannot know. React renders this snapshot while hydrating
 * and swaps to the real one immediately after, which is why the button holds its space rather than
 * guessing a label and correcting itself in front of the reader.
 */
function serverMode(): Mode | null {
  return null;
}

function setMode(next: Mode) {
  const root = document.documentElement;
  if (next === "light") root.setAttribute(MODE_ATTRIBUTE, "light");
  else root.removeAttribute(MODE_ATTRIBUTE);
  // A browser with storage blocked still switches rooms; it just will not remember next time.
  try { localStorage.setItem(MODE_STORAGE_KEY, next); } catch { /* nothing to be done about it */ }
  for (const notify of listeners) notify();
}

/**
 * Turns the house lights up, and back down.
 *
 * Two states and no third. The dark room is the default and this is how somebody leaves it; the
 * choice is kept in their own browser under one key, goes nowhere near an account or a cookie, and
 * is read back before the page is painted by the inline script in the root layout.
 *
 * The label names the room it switches to, never the room you are in, because a control that names
 * its own current state is the oldest ambiguity in this kind of button. `aria-pressed` carries the
 * state properly for anybody who is listening rather than looking.
 */
export function ModeToggle({ className = "" }: { className?: string }) {
  const mode = useSyncExternalStore(subscribe, readMode, serverMode);

  // Before hydration there is no honest answer, so the space is held and nothing is claimed.
  if (!mode) return <span aria-hidden="true" className={`inline-block h-[22px] w-[22px] ${className}`} />;

  const next = otherMode(mode);
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-pressed={mode === "light"}
      title={modeLabel(next)}
      className={`cursor-pointer text-muted transition-colors hover:text-accent-ink ${className}`}
    >
      <span className="sr-only">{modeLabel(next)}</span>
      {next === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/*
  Drawn here rather than installed, the way the workspace glyphs are: 22 by 22, stroked in the
  current text colour at 1.5px, which is the thin line the rest of the design system uses.
*/
const SHARED = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** Offered when the next room is the light one. */
function SunIcon() {
  return (
    <svg {...SHARED}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** Offered when the next room is the dark one. */
function MoonIcon() {
  return (
    <svg {...SHARED}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}
