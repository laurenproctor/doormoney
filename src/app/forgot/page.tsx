import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

/*
  Password recovery.

  On the shared auth shell, the same one sign-up, sign-in and the two-factor check use, rather than
  the marketing Page shell. That shell brings the nav, a hero with a strap line and a scroll arrow,
  and a footer carrying the newsletter, all of which sat in front of somebody who is locked out and
  wants one field. This route used to carry a local header and footer for the same reason; the
  shared shell now does that job for every account door, so there is one of them instead of two.
*/

export const metadata: Metadata = {
  title: { absolute: "Reset your password | Door Money" },
  description: "Request a secure link to reset your Door Money password.",
  // The convention on the other account pages: /reset carries the same.
  robots: { index: false },
};

export default function ForgotPage() {
  return (
    <AuthShell
      eyebrow="Password reset"
      title="Reset your"
      accent="password"
      intro={<p>Enter your email or username and we&rsquo;ll send a reset link.</p>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
