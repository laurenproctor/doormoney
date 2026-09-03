// One place for the strings that appear on every page.
// The tagline was settled on 2026-09-03; see docs/DECISIONS.md, decision 1.
// Both lines show in the home hero. Footer and email use the first line alone.

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
  tagline: "Put money behind the music.",
  taglineSecond: "Support the musicians you want to keep hearing.",
  strap: "Sponsorship for bands that actually gig",
  city: "New York",
  url: siteUrl(),
  feePercent: 15,
  /** Address on the legal pages. Placeholder domain until decision 5 is settled. */
  contact: "hello@doormoney.co",
} as const;

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/placements", label: "Placements" },
  { href: "/auctions", label: "Live auctions" },
  { href: "/widget", label: "Widget" },
  { href: "/list", label: "List an act" },
  { href: "/contact", label: "Contact" },
] as const;

/** The house paper: legal and policy pages, linked from the footer. */
export const LEGAL = [
  { href: "/terms", label: "Terms and conditions" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/cookies", label: "Cookie policy" },
  { href: "/accessibility", label: "Accessibility" },
] as const;

/** The house rules. Shown on Home and on Placements; keep one copy. */
export const HOUSE_RULES = [
  "Nothing goes up without the band's yes.",
  "Patrons put the money up before the first show.",
  "Bands get paid every Friday. No chasing.",
  "Patrons pay nothing for a placement that never runs.",
  "No placements at weddings or private events.",
] as const;
