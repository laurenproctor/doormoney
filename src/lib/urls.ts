import { SITE } from "@/lib/site";
import { SLUG_RE } from "@/lib/slug";

/*
  Every public address on the site, built in one place.

  An act's page is the act's word at the root: /gutter-hymns. A run hangs off it, named by the
  musician and prefixed by us: /gutter-hymns/support-europe-tour. The musician names a fundraiser,
  Door Money builds the path, so "support" is on every run address whatever anyone types.

  Act words share one namespace with patron handles and with the site's own routes; RESERVED_SLUGS
  in src/lib/slug.ts and the reserved_handles table are what keep a musician off /login.
*/

/** The word in front of every run address. Ours, not the musician's. */
export const RUN_PREFIX = "support-";

/** An act's page. */
export const actPath = (actSlug: string) => `/${actSlug}`;

/** One run's board. */
export const runPath = (actSlug: string, runSlug: string) => `/${actSlug}/${RUN_PREFIX}${runSlug}`;

/**
 * The run word inside a path segment, or null when the segment is not a run address at all.
 * A segment that is missing the prefix, or that carries something other than a slug behind it,
 * is nothing this site serves.
 */
export function runSlugFromSegment(segment: string): string | null {
  if (!segment.startsWith(RUN_PREFIX)) return null;
  const slug = segment.slice(RUN_PREFIX.length);
  return SLUG_RE.test(slug) ? slug : null;
}

/** Absolute forms, for emails, metadata and anything leaving the site. */
export const actUrl = (actSlug: string) => `${SITE.url}${actPath(actSlug)}`;
export const runUrl = (actSlug: string, runSlug: string) => `${SITE.url}${runPath(actSlug, runSlug)}`;

/** The address a musician is shown for their own page, without the scheme. */
export const bareActUrl = (actSlug: string) => `${SITE.url.replace(/^https?:\/\//, "")}${actPath(actSlug)}`;

/**
 * Where somebody with no session is sent, and where they come back to.
 *
 * The whole address comes back, query string included. The proxy used to keep the path alone, so a
 * link to /dashboard/runs/new?template=fund_tour opened while signed out came back as the empty
 * form. The value is one encoded parameter, and safeNext in src/lib/auth.ts still decides whether
 * it is a path inside the site before anybody is redirected to it.
 */
export function signInPath(pathname: string, search: string = ""): string {
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
