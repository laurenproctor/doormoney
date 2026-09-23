/**
 * Tiles or rows: how the discovery results are laid out.
 *
 * The results are one list, fetched once and ranked once, whichever way a reader looks at them.
 * Tiles are what everybody lands on. Rows are the same results in a different shape, and the
 * choice is the reader's alone: kept in their own browser under one key, sent nowhere, attached to
 * no account, and never part of the address, so switching views changes nothing about the search,
 * the filters, the sort or the page.
 *
 * The state is one attribute on <html>. Absent means tiles, so the markup a visitor is served needs
 * no attribute at all, and a browser with no script gets the tiles as they were built. The CSS
 * reads the attribute (the `discovery-rows` variant in globals.css), which is what lets a reader
 * who chose rows land on the page already in rows rather than watching it change.
 *
 * Modeled on src/lib/mode.ts and src/lib/rail.ts and coupled to neither: its own key, its own
 * attribute, its own script.
 *
 * Pure: importable from a server component, a client component and the inline script below.
 */

export const DISCOVERY_VIEWS = ["tiles", "rows"] as const;
export type DiscoveryView = (typeof DISCOVERY_VIEWS)[number];

/** What a reader sees before they have chosen anything. */
export const DEFAULT_DISCOVERY_VIEW: DiscoveryView = "tiles";

/** The attribute on <html>, and the key the choice is kept under. Both used by the script below. */
export const DISCOVERY_VIEW_ATTRIBUTE = "data-discovery-view";
export const DISCOVERY_VIEW_STORAGE_KEY = "doormoney:discovery-view";

export function isDiscoveryView(value: unknown): value is DiscoveryView {
  return DISCOVERY_VIEWS.includes(value as DiscoveryView);
}

/** The visible word on each button, and what it says it does. */
export const DISCOVERY_VIEW_LABEL: Record<DiscoveryView, string> = { tiles: "Tiles", rows: "Rows" };

/**
 * The script that runs before the results are painted.
 *
 * Without it a reader who chose rows would be shown tiles for a frame and then watch the list
 * re-lay itself, on every visit. So this is inline, it runs as the shell is parsed, and it does one
 * thing: reads one key and, only for the one value that is not the default, sets one attribute.
 * Everything in it is wrapped: a browser with storage blocked, a private window that throws on the
 * read, or a stored value that is not a view simply gets the default rather than a broken page.
 */
export const DISCOVERY_VIEW_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(DISCOVERY_VIEW_STORAGE_KEY)})==="rows")document.documentElement.setAttribute(${JSON.stringify(DISCOVERY_VIEW_ATTRIBUTE)},"rows");}catch(e){}`;
