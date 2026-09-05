/**
 * The account holder's name, in two parts.
 *
 * profiles.display_name was one free-text field whose sign-up hint said "a person or a business".
 * It is now first and last, because whoever holds an account is a person: a band's name lives on
 * acts.name and a business's name on patrons.name, and those are what a board and a receipt show.
 *
 * Pure on purpose, and kept out of src/lib/auth.ts, which imports next/navigation and so cannot be
 * loaded by the test runner.
 */

export type NameParts = { first_name: string | null; last_name: string | null };

/**
 * The whole name, for the places that want one string: a heading, a table cell, an address line.
 *
 * Rows written before the split can carry only a first name, so a missing half is normal rather
 * than an error. An account with no name at all gives null, not an empty string, so the caller
 * decides what to say in its own words.
 */
export function fullName(profile: NameParts | null | undefined): string | null {
  const whole = [profile?.first_name, profile?.last_name].map((n) => n?.trim()).filter(Boolean).join(" ");
  return whole || null;
}
