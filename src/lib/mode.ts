/**
 * Dark room or light room.
 *
 * Door Money is a dark room with one color of light in it, and that is still what everybody lands
 * in: the dark is the default and the light is something a reader turns on. The choice is theirs
 * alone, kept in their own browser, sent nowhere and attached to no account.
 *
 * The mode is one attribute on <html>. Absent means dark, so the markup a visitor is served needs
 * no attribute at all and a browser with no script still gets the room as it was built.
 *
 * The color of light does not change with the mode. A page still picks a theme (blue, lime,
 * magenta and the rest) and the tokens under it answer differently in each room: the same accent,
 * a ground it can sit on, and an accent-ink dark enough to read against that ground. Every one of
 * those pairs is checked against the 4.5:1 rule the design system has always stated, in both rooms.
 *
 * Pure: importable from a server component, a client component and the inline script below.
 */

export const MODES = ["dark", "light"] as const;
export type Mode = (typeof MODES)[number];

/** What a reader sees before they have chosen anything. */
export const DEFAULT_MODE: Mode = "dark";

/** The attribute on <html>, and the key the choice is kept under. Both used by the script below. */
export const MODE_ATTRIBUTE = "data-mode";
export const MODE_STORAGE_KEY = "doormoney:mode";

export function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode);
}

/** The other one. The toggle has exactly two states and no third. */
export function otherMode(mode: Mode): Mode {
  return mode === "dark" ? "light" : "dark";
}

/** What the control says it will do, which is the room it switches to, never the room you are in. */
export function modeLabel(next: Mode): string {
  return next === "light" ? "Switch to the light room" : "Switch to the dark room";
}

/**
 * The script that runs before the page is painted.
 *
 * Without it a reader who chose the light room would be shown the dark one for a frame and then
 * have it swapped underneath them, which is worse than not offering the choice. So this is inline
 * and blocking, it is the only thing that runs that early, and it does one thing.
 *
 * Everything in it is wrapped: a browser with storage blocked, or a private window that throws on
 * the read, simply gets the default room rather than a broken page.
 */
export const MODE_SCRIPT = `try{var m=localStorage.getItem(${JSON.stringify(MODE_STORAGE_KEY)});if(m==="light")document.documentElement.setAttribute(${JSON.stringify(MODE_ATTRIBUTE)},"light");}catch(e){}`;
