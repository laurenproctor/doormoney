/**
 * Organizer setup: the short step between an account and its first sponsorship.
 *
 * Who is behind a fundraiser is one question with two answers, the person signed in or something
 * they run, and this file holds the parts of that question that are arithmetic: what to call the
 * account holder, what address to suggest, what an organization may say it is. No database, no
 * server action, so the form and the action can both run it and agree.
 *
 * What is deliberately not here: whether a word is free. That is one question that has to be
 * asked and answered in the same transaction, so it lives in `claim_act_slug` (migration 0058).
 */

import { ENTITY_KINDS, ENTITY_KIND_LABELS, type EntityKind } from "@/lib/participation";
import { slugify } from "@/lib/slug";

/** Which of the two answers the setup screen is on. */
export type OrganizerChoice = "self" | "organization";

export function isOrganizerChoice(value: string): value is OrganizerChoice {
  return value === "self" || value === "organization";
}

/**
 * What to call the account holder.
 *
 * Their own name first, because that is what they typed. A patron page's display name is the next
 * best, then the part of the email address in front of the @. Null when an account has given
 * nothing at all: the caller says what to put there in its own words, rather than a placeholder
 * name leaking into the organizer's public name.
 */
export function accountDisplayName(parts: {
  fullName?: string | null;
  patronDisplayName?: string | null;
  email?: string | null;
}): string | null {
  const own = parts.fullName?.trim();
  if (own) return own;
  const patron = parts.patronDisplayName?.trim();
  if (patron) return patron;
  const local = parts.email?.split("@")[0]?.trim();
  return local || null;
}

/** Up to two letters for a preview with no photograph in it. Never a guess at a name. */
export function initialsFor(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = (words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]])
    .map((w) => [...w].find((c) => /\p{L}|\p{N}/u.test(c)) ?? "")
    .join("");
  return letters.toUpperCase().slice(0, 2);
}

/**
 * The address to suggest for a name.
 *
 * A suggestion and nothing more: whether it is free is the database's answer, and the person can
 * edit it before they ever ask. A name with nothing a URL can carry gives an empty string, and the
 * form then has nothing to suggest, which is the honest state rather than "untitled".
 */
export function suggestSlug(name: string): string {
  return slugify(name);
}

/**
 * Words to try when a suggestion is taken, in the order to try them.
 *
 * Numbers rather than invented adjectives: `harbor-house-2` is plainly the same name again, where
 * `the-harbor-house` reads as a different organization. Each one is trimmed to the 40 characters
 * the slug rule allows, from the front, so the tail that distinguishes them survives.
 */
export function slugAlternatives(base: string, count = 6): string[] {
  const root = slugify(base);
  if (!root) return [];
  const out: string[] = [];
  for (let n = 2; out.length < count; n += 1) {
    const suffix = `-${n}`;
    out.push(`${root.slice(0, 40 - suffix.length).replace(/-+$/, "")}${suffix}`);
  }
  return out;
}

/**
 * What an organization may say it is.
 *
 * The entity kinds already stored on `acts.entity_kind` (migration 0043), minus the one that
 * describes a person: somebody who chose Myself has answered that question by choosing it. It is
 * what the organizer *is*, never what it raises money for, and a fundraiser's category is chosen
 * on the fundraiser.
 */
export const ORGANIZATION_KINDS: { value: EntityKind; label: string }[] = ENTITY_KINDS
  .filter((k) => k !== "person")
  .map((k) => ({ value: k, label: ENTITY_KIND_LABELS[k] }));

/** The kind stored for the account holder's own organizer record. */
export const SELF_ENTITY_KIND: EntityKind = "person";
