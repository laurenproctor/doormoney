import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, AuthPoints } from "@/components/AuthShell";
import { TotpChallengeForm } from "@/components/TwoFactorForms";
import { signOut } from "@/app/actions/auth";
import { safeNext } from "@/lib/auth";
import { mfaPending, verifiedTotpFactors } from "@/lib/mfa";
import { supabaseServer } from "@/lib/supabase/server";

/*
  The half-step between a password and the site.

  A session arrives here at aal1: the password or the email link was right, and the account has an
  authenticator factor that has not been answered in this session. Until it is, requireUser and
  the proxy both send every page that needs an account straight back here, so there is nothing to
  reach by skipping it.

  This page cannot use requireUser itself, for the same reason: it is what requireUser redirects
  to. It asks who is signed in directly and decides the three cases here.
*/

export const metadata: Metadata = { title: "Two-factor authentication", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function VerifyPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);

  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user ?? null;
  // Nobody is signed in, so there is no code to ask for. Back to the start, carrying the address.
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  // No factor, or this session has already answered it. Either way there is nothing to do here.
  if (verifiedTotpFactors(user).length === 0) redirect(next);
  if (!(await mfaPending(sb, user))) redirect(next);

  return (
    <AuthShell
      eyebrow="One more step"
      title="Two-factor"
      accent="authentication"
      panelClass="bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))]"
      intro={<p>Your password was right. Enter the six-digit code from your authenticator app to finish signing in.</p>}
      aside={
        <AuthPoints
          heading="Why this is here"
          points={[
            "You turned this on for this account, so a password on its own no longer opens it.",
            "The code changes about every thirty seconds. Enter the one showing now.",
            "A backup authenticator's code works here too, and so does an unused recovery code.",
            "Nothing that needs an account opens until the code is entered.",
          ]}
        />
      }
    >
      <TotpChallengeForm next={next} />
      <div className="mt-6 grid gap-2 border-t border-line pt-5 text-[14.5px] text-muted">
        {/*
          Signing out rather than linking back to /login: the session is real, so the proxy would
          send it straight back here. Clearing it is what actually lets somebody start again.
        */}
        <form action={signOut}>
          Wrong account?{" "}
          <button type="submit" className="cursor-pointer text-accent-ink underline underline-offset-4">
            Sign out and start again
          </button>
          .
        </form>
        <p className="max-w-[42ch]">
          No app and no recovery code? Resetting the password does not remove this step, so{" "}
          <Link href="/contact" className="text-accent-ink underline underline-offset-4">
            tell Door Money
          </Link>{" "}
          and it will be taken off the account.
        </p>
      </div>
    </AuthShell>
  );
}
