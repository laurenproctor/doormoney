/**
 * Who is paying, when the visitor is signed in.
 *
 * The bid form and the checkout form both take a name and an email, because nobody has to sign in
 * to sponsor. A visitor who is signed in already has an email: the account's. Asking for it again
 * invites a typo that splits the record from the account, since a purchase is tied to the profile
 * only when the two match (payingProfileId in src/lib/patrons.ts). So the account's email is used
 * and shown, never typed, and the name stays editable because a sponsor may want a business name
 * on the page rather than their own.
 *
 * Pure on purpose: the read that finds the visitor lives in src/lib/auth.ts.
 */

export type SignedInSponsor = {
  /** The account holder's name, or null for an account with none. */
  name: string | null;
  /** The account's email. Every record and receipt goes here. */
  email: string;
};

export type SponsorFields = {
  /** What the name field starts with. Always editable. */
  name: string;
  /** What the email is. Typed when there is no account behind the visit. */
  email: string;
  /** True when the email is the account's and the form has no field for it. */
  emailIsAccount: boolean;
};

/** The starting state of a sponsor form: prefilled from the account, or empty for a visitor. */
export function sponsorFields(viewer: SignedInSponsor | null | undefined): SponsorFields {
  const email = viewer?.email.trim().toLowerCase() ?? "";
  if (!email) return { name: "", email: "", emailIsAccount: false };
  return { name: viewer?.name?.trim() ?? "", email, emailIsAccount: true };
}
