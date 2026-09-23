/**
 * The dashboard's navigation rail, open or folded.
 *
 * On a wide screen the rail sits beside the page with an icon and a name for every destination.
 * A reader may fold it to the icons alone and have the page take the room. The choice is theirs,
 * kept in their own browser under one key, sent nowhere and attached to no account, the same way
 * the light room is (src/lib/mode.ts). Somebody who has never chosen gets the rail open.
 *
 * The state is one attribute on <html>. Absent means open, so the markup a reader is served needs
 * no attribute at all, and a browser with no script gets the rail as it was built. The CSS reads
 * the attribute (the `rail-collapsed` variant in globals.css), which is what lets a reader who
 * folded it land on every dashboard page with it already folded, rather than watching it fold.
 *
 * Pure: importable from a server component, a client component and the inline script below.
 */

export const RAIL_STATES = ["expanded", "collapsed"] as const;
export type RailState = (typeof RAIL_STATES)[number];

/** What a reader sees before they have chosen anything. */
export const DEFAULT_RAIL_STATE: RailState = "expanded";

/** The attribute on <html>, and the key the choice is kept under. Both used by the script below. */
export const RAIL_ATTRIBUTE = "data-rail";
export const RAIL_STORAGE_KEY = "doormoney:rail";

export function isRailState(value: unknown): value is RailState {
  return RAIL_STATES.includes(value as RailState);
}

/** The other one. The control has exactly two states. */
export function otherRailState(state: RailState): RailState {
  return state === "expanded" ? "collapsed" : "expanded";
}

/** What the control says it will do: the state it switches to, never the state it is in. */
export function railLabel(next: RailState): string {
  return next === "collapsed" ? "Collapse the navigation" : "Expand the navigation";
}

/**
 * The script that runs before the rail is painted.
 *
 * Without it a reader who folded the rail would be shown it open for a frame and then have the
 * page jump as it folded, on every dashboard page they opened. So this is inline, it runs as the
 * shell is parsed, and it does one thing. Everything in it is wrapped: a browser with storage
 * blocked, or a private window that throws on the read, simply gets the default rather than a
 * broken page.
 */
export const RAIL_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(RAIL_STORAGE_KEY)})==="collapsed")document.documentElement.setAttribute(${JSON.stringify(RAIL_ATTRIBUTE)},"collapsed");}catch(e){}`;
