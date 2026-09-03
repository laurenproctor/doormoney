import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

/** Comma-separated emails in ADMIN_EMAILS. Anyone else gets a 404, not a hint. */
export function adminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAdmin() {
  const user = await requireUser("/admin");
  const email = user.email?.toLowerCase() ?? "";
  if (!email || !adminEmails().has(email)) notFound();
  return user;
}
