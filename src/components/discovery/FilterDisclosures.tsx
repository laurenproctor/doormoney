"use client";
import { useEffect } from "react";

/**
 * A little manners for the toolbar's disclosures, on a wide screen only.
 *
 * The disclosures are native <details>, which already open and close from the keyboard with no
 * script. What a browser does not do on its own is treat them as a row of menus: with this, opening
 * one closes the others, Escape closes the open one and puts focus back on its summary, and a click
 * elsewhere on the page closes it. On a phone they are stacked blocks, not menus, and are left as
 * the browser built them so several can be open at once while somebody fills them in.
 *
 * Renders nothing. Without JavaScript none of this runs and every disclosure still works.
 */
export function FilterDisclosures({ scope }: { scope: string }) {
  useEffect(() => {
    const root = document.getElementById(scope);
    if (!root) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const all = () => Array.from(root.querySelectorAll<HTMLDetailsElement>("details"));

    const onToggle = (e: Event) => {
      const opened = e.target;
      if (!wide.matches || !(opened instanceof HTMLDetailsElement) || !opened.open) return;
      for (const d of all()) if (d !== opened) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const open = all().find((d) => d.open && d.contains(document.activeElement));
      if (!open) return;
      open.open = false;
      open.querySelector<HTMLElement>("summary")?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!wide.matches || (e.target instanceof Node && root.contains(e.target))) return;
      for (const d of all()) d.open = false;
    };

    root.addEventListener("toggle", onToggle, true);
    root.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      root.removeEventListener("toggle", onToggle, true);
      root.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [scope]);
  return null;
}
