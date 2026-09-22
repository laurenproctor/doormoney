import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ButtonLink } from "@/components/Button";
import { NewPasswordForm } from "@/components/PasswordForms";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

/**
 * Where the reset link lands, once the callback has turned it into a session.
 *
 * No session means the link was used already or has run out, and there is nothing to set. That is
 * the whole of the second state: one sentence and the way to ask for another link.
 */
export default async function ResetPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="This link has"
        accent="expired"
        intro={<p>A reset link works once and runs out after an hour. Asking for another takes a minute.</p>}
      >
        <ButtonLink href="/forgot" className="w-full">Send a new reset link</ButtonLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Choose a new"
      accent="password"
      intro={<p>Use a new password for your account.</p>}
    >
      <NewPasswordForm />
    </AuthShell>
  );
}
