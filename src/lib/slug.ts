/** URL slugs for acts: lowercase, letters, digits and single hyphens. */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** Paths that already exist on the site, plus a few that should never be an act. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "auth", "board", "contact", "dashboard", "embed", "list", "login", "new", "placements",
  "privacy", "terms", "cookies", "accessibility", "auctions", "widget", "doormoney", "door-money", "test",
]);

/** What the slug field does while someone is still typing: keep hyphens they just typed, drop everything else. */
export function slugWhileTyping(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);
}
