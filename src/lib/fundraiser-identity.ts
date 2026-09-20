/**
 * Which fundraiser a widget, a payment or a notice belongs to. Exactly one, by id.
 *
 * An organizer can run more than one fundraiser. Until this file, the widget, the backing checkout
 * and both "you paid" notices identified a fundraiser by its organizer's address and then took
 * "whichever one is running", which is a different question. Asked at render time and again at
 * payment time, it can have two answers, and the money follows the second one.
 *
 * The identifier is `runs.id`. It never changes: a fundraiser's word is frozen once published
 * (migration 0025) but an organizer's address can move once a year (decision 12), so the id is
 * the only part of a fundraiser's address that is permanent. It is already public: every lot a
 * visitor can read carries its `run_id`.
 *
 * The rule everywhere: a fundraiser named exactly is never swapped for another one. If it has
 * closed, the answer is "closed", not "here is a different fundraiser by the same organizer".
 *
 * Pure, and importable from a client component: nothing here reads the database or Stripe.
 */

/** Seeded ids are not RFC 4122 UUIDs, so the shape is checked and the version bits are not. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The query parameter an exact widget carries: /embed/<organizer>?fundraiser=<id>. */
export const FUNDRAISER_PARAM = "fundraiser";

/** The attribute an exact snippet carries: <script src=".../embed.js" data-act="…" data-fundraiser="…">. */
export const FUNDRAISER_ATTRIBUTE = "data-fundraiser";

/** A fundraiser id in the right shape, lower-cased, or null. Never a guess at what was meant. */
export function parseFundraiserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return ID_RE.test(id) ? id : null;
}

/**
 * What a request said about which fundraiser it wants.
 *
 *   exact    it named one, in the right shape
 *   invalid  it tried to name one and the value is not an id. Refused: a widget that asked for a
 *            particular fundraiser must never quietly get a different one
 *   legacy   it named none. The documented compatibility path for snippets pasted before exact
 *            widgets existed: the organizer's current fundraiser
 */
export type FundraiserRequest = { kind: "exact"; id: string } | { kind: "invalid" } | { kind: "legacy" };

export function fundraiserRequest(value: string | string[] | undefined | null): FundraiserRequest {
  if (value === undefined || value === null) return { kind: "legacy" };
  if (Array.isArray(value)) return { kind: "invalid" };
  const id = parseFundraiserId(value);
  return id ? { kind: "exact", id } : { kind: "invalid" };
}

/** The widget's address. With an id it is exact; without one it is the legacy, profile-based address. */
export function embedPath(actSlug: string, fundraiserId?: string | null, extra?: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  const id = parseFundraiserId(fundraiserId);
  if (id) query.set(FUNDRAISER_PARAM, id);
  for (const [key, value] of Object.entries(extra ?? {})) if (value) query.set(key, value);
  const qs = query.toString();
  return `/embed/${encodeURIComponent(actSlug)}${qs ? `?${qs}` : ""}`;
}

/** The line an organizer pastes into their own site. Always exact: new snippets name one fundraiser. */
export function embedSnippet(siteUrl: string, actSlug: string, fundraiserId: string): string {
  const id = parseFundraiserId(fundraiserId);
  if (!id) throw new Error("an embed snippet names one exact fundraiser");
  return `<script src="${siteUrl}/embed.js" data-act="${actSlug}" ${FUNDRAISER_ATTRIBUTE}="${id}"></script>`;
}

/**
 * Does this Stripe object belong to this fundraiser?
 *
 *   match     its metadata names this fundraiser
 *   mismatch  its metadata names a different one. Never shown, never fulfilled here
 *   unnamed   its metadata names none. Only a lot checkout started before this shipped can be in
 *             this state (a backing has always carried run_id), and the caller settles it from the
 *             database row instead of from the organizer's address
 */
export type FundraiserMatch = "match" | "mismatch" | "unnamed";

export function metadataFundraiser(metadata: Record<string, string> | null | undefined, fundraiserId: string | null | undefined): FundraiserMatch {
  const named = parseFundraiserId(metadata?.run_id);
  if (!named) return "unnamed";
  const expected = parseFundraiserId(fundraiserId);
  return expected !== null && named === expected ? "match" : "mismatch";
}

/**
 * Whether the fundraiser a payment's metadata names is the one its database row belongs to.
 *
 * The row decides where money goes; this is the cross-check that the two still agree. Metadata
 * that names nothing passes, because the row is then the only claim there is. Metadata that names
 * another fundraiser does not, whatever else about the payment looks right.
 */
export function paymentBelongsToRow(metadata: Record<string, string> | null | undefined, rowFundraiserId: string): boolean {
  return metadataFundraiser(metadata, rowFundraiserId) !== "mismatch";
}
