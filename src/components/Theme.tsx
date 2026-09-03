import type { ReactNode } from "react";
import { ThemeSync } from "@/components/ThemeSync";

/** The colours of light a page can be lit with. Tokens for each live in globals.css. */
export const THEMES = ["blue", "lime", "magenta", "amber", "teal", "violet", "red", "mono"] as const;
export type ThemeName = (typeof THEMES)[number];

/** The coloured themes, for pages that get a colour by lot rather than by hand (each act's board). */
const COLOURS: ThemeName[] = ["blue", "lime", "magenta", "amber", "teal", "violet", "red"];

/** A stable colour for a string: the same slug always lands on the same light. */
export function themeFor(seed: string): ThemeName {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}

/**
 * Lights a page. Wraps the whole page so every token below it reads the right colour,
 * and mirrors the theme onto <html> so fixed elements outside the page (the cookie notice) match.
 */
export function Theme({ name, children }: { name: ThemeName; children: ReactNode }) {
  return (
    <div data-theme={name} className="flex min-h-full flex-1 flex-col bg-ground text-ink">
      <ThemeSync name={name} />
      {children}
    </div>
  );
}
