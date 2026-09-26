// One place for the strings that appear on every page.
// Decision 17 made the shared site category-neutral: these lines describe the exchange (an organizer,
// a sponsor, specified visibility), never one category's work. Decision 21 gave the site its thesis:
// Door Money turns ambition into a sponsor-ready project. Decision 1's music tagline stays available
// for music-specific surfaces as `musicTagline`.
// The tagline is the home headline. Footer and email use it alone; the second line explains both sides.

/**
 * Public site URL. Prefer NEXT_PUBLIC_SITE_URL; fall back to the URL Vercel
 * assigns the deployment, then to localhost. Empty strings count as unset,
 * since `new URL("")` throws at build time.
 */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE = {
  name: "Door Money",
  tagline: "Turn ambition into a sponsor-ready project.",
  taglineSecond: "Organizers explain what they are making, who it reaches and what a sponsor receives. Sponsors see what their money makes possible before they pay.",
  strap: "Ideas with an audience. Sponsorships with a point.",
  /** The idea behind the company, for pages that need to say it in one line. Decision 21. */
  thesis: "Door Money turns ambition into a sponsor-ready project.",
  /** Decision 1's line. For a surface that is about music and nothing else. */
  musicTagline: "Put money behind the music.",
  /** The sequence the product explains, for the foot of the hero and the footer. */
  signoff: "Ambition. Project. Sponsorship. Delivery. Record.",
  /** Where the company is. Never where an organizer, a sponsor or an audience has to be. */
  city: "New York",
  /** "Designed for", not "open to": payments run in USD through the countries Stripe supports, and the line must not say otherwise. */
  origin: "Built in New York. Designed for organizers anywhere.",
  url: siteUrl(),
  feePercent: 15,
  /** Address on the legal pages. Placeholder domain until decision 5 is settled. */
  contact: "hello@doormoney.co",
} as const;

/*
  The top bar, and the footer's column of the same links.

  "Widget" is not here on purpose. It is a word for the person building the thing rather than the
  musician installing it, and the page it points at is only useful to somebody who already has a
  fundraiser, so it lives in the dashboard instead (MUSICIAN_LINKS in src/lib/roles.ts).
  See docs/DECISIONS.md, decision 14.

  The index is at /fundraisers. Its label is "Browse projects" (2026-09-23, with the discovery
  redesign): a display word for the one page where a sponsor looks at the work, and nothing more.
  The address, the tables and every other page keep the word fundraiser. /auctions was the index's
  first address and is in sent email and pasted snippets, so it redirects there and always will
  (next.config.ts). /list stays where it is for the same reason.
*/
export const NAV = [
  { href: "/fundraisers", label: "Browse projects" },
  { href: "/how-sponsorship-works", label: "How it works" },
  { href: "/list", label: "For organizers" },
  { href: "/contact", label: "Contact" },
] as const;

/** The house paper: legal and policy pages, linked from the footer. */
export const LEGAL = [
  { href: "/terms", label: "Terms and conditions" },
  { href: "/refunds", label: "Refunds and disputes" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/cookies", label: "Cookie policy" },
  { href: "/accessibility", label: "Accessibility" },
] as const;

/**
 * The house rules. Shown on Home; keep one copy.
 *
 * These hold for every category, so none of them names a payout day, a refund term or a kind of
 * materials: those belong to a fundraiser's own terms (docs/DELIVERY_POLICY_MATRIX.md).
 */
export const HOUSE_RULES = [
  "The organizer decides what to offer, and at what price.",
  "A sponsor sees what a sponsorship includes before paying.",
  "No sponsor's materials appear without the organizer's approval.",
  "Every sponsorship states what the organizer will deliver, and how it will be documented.",
  "Door Money promises no sales, reach or results it cannot substantiate.",
] as const;
