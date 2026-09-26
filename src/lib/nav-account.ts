/**
 * What the top bar calls the signed-in account.
 *
 * The bar names the person, so that a page a visitor is signed in on never asks them to sign in.
 * The name is the account holder's own where they gave one, then the handle they sign in with,
 * then the local part of the email, which every account has. Never an empty label, so a visitor
 * with no name and no handle is still shown as somebody.
 *
 * Pure on purpose: the read that finds the account lives in src/lib/auth.ts.
 */

export type NavAccountParts = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
};

export function navAccountName(parts: NavAccountParts): string {
  const name = parts.name?.trim();
  if (name) return name;
  const username = parts.username?.trim();
  if (username) return username;
  return parts.email?.split("@")[0]?.trim() || "Your account";
}
