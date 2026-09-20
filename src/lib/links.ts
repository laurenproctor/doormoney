/**
 * The two links a musician can put on a public board: a website and an Instagram handle.
 *
 * Both are typed by the musician, so both are untrusted on the way back out. Everything here runs
 * on the server before the markup is built: a value that does not survive these checks is not
 * rendered at all, rather than rendered as a broken or dangerous link.
 */

/** Only these two schemes ever reach an href. `javascript:`, `data:` and the rest never do. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * A website address safe to put in an href, or null. Adds https:// when the musician left the
 * scheme off, refuses anything that is not a plain web address, and returns the parsed form so
 * what renders is what the URL parser understood rather than the raw string.
 */
export function safeWebsite(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
  // A host with no dot is not a public website, and neither is a bare userinfo trick.
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  return url.toString();
}

/** "doormoney.co/how-it-works" from "https://doormoney.co/how-it-works/". The link's own words. */
export function websiteLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return url;
  }
}

/** Instagram allows letters, digits, dots and underscores, up to 30 characters. */
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

/**
 * The bare handle, or null. Accepts what musicians actually type: "@rosie", "rosie",
 * "instagram.com/rosie/", a full profile URL with a query string on the end.
 */
export function instagramHandle(raw: string | null | undefined): string | null {
  let value = raw?.trim();
  if (!value) return null;
  if (/instagram\.com/i.test(value)) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(withScheme);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
      value = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  value = value.replace(/^@/, "").replace(/\/+$/, "");
  if (!HANDLE_RE.test(value)) return null;
  return value;
}

/** The profile address for a handle that has already been through instagramHandle. */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

/**
 * The other links a profile may carry, organizer or patron: up to six, each a label and an address.
 *
 * https only, the rule a patron's website has always been held to. The database repeats every limit
 * here in profile_links_ok (migration 0043), because a form is a courtesy and a constraint is the
 * rule.
 */
export type ProfileLink = { label: string; url: string };

export const PROFILE_LINKS_MAX = 6;
export const LINK_LABEL_MAX = 40;
export const LINK_URL_MAX = 200;

export type ProfileLinksResult = { links: ProfileLink[]; error?: string };

/**
 * The rows of a links editor, as typed. A row with no address is dropped, so an empty form saves an
 * empty list. A row with an address that does not survive is refused rather than quietly dropped,
 * so nobody saves a list that is not the list they typed.
 */
export function parseProfileLinks(rows: { label?: string | null; url?: string | null }[]): ProfileLinksResult {
  const links: ProfileLink[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row.url?.trim() ?? "";
    const label = (row.label ?? "").replace(/\s+/g, " ").trim();
    if (!raw) {
      if (label) return { links, error: `"${label}" needs an address.` };
      continue;
    }
    if (label.length > LINK_LABEL_MAX) return { links, error: `Keep each label under ${LINK_LABEL_MAX} characters.` };
    const url = safeWebsite(raw);
    if (!url || !url.startsWith("https://") || url.length > LINK_URL_MAX) {
      return { links, error: `"${raw.slice(0, 40)}" is not a full address starting with https://.` };
    }
    if (seen.has(url)) return { links, error: `${websiteLabel(url)} is on the list twice.` };
    seen.add(url);
    links.push({ label, url });
  }
  if (links.length > PROFILE_LINKS_MAX) return { links, error: `Up to ${PROFILE_LINKS_MAX} links. That is ${links.length}.` };
  return { links };
}

/**
 * Stored links on the way back out. The column is jsonb, so what comes back is checked again
 * before it reaches an href: anything that is not a label and an https address is left out.
 */
export function readProfileLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { label, url } = item as { label?: unknown; url?: unknown };
    if (typeof url !== "string") continue;
    const safe = safeWebsite(url);
    if (!safe || !safe.startsWith("https://")) continue;
    out.push({ label: typeof label === "string" ? label : "", url: safe });
  }
  return out.slice(0, PROFILE_LINKS_MAX);
}

/** What a link is called on the page: its label, or the address's own words when it has none. */
export function linkText(link: ProfileLink): string {
  return link.label || websiteLabel(link.url);
}
