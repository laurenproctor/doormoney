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
