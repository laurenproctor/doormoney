/**
 * The words the new-fundraisers email asks with, in one place so every surface says the same thing.
 *
 * Its own module, and nothing but strings in it: the band and the footer block are server
 * components, the form inside them is a client component, and all three need these. With the
 * constant living beside the band, the form had to import from the file that imports the form.
 *
 * Short on purpose. It is an ask, not a page. Third person, because the footer is on every page and
 * those pages talk to organizers and sponsors at once (voice rule 1).
 */
export const NEWSLETTER = {
  eyebrow: "By email",
  title: "Get new fundraisers by email.",
  body: "One short email when a new fundraiser opens. Unsubscribe anytime.",
  fine: "Door Money never shares an address.",
} as const;
