import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "@/components/SignUpForm";
import { safeNext } from "@/lib/auth";
import { homeForIntent, parseIntent } from "@/lib/intent";

export const metadata: Metadata = { title: "Sign up" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The one way in.
 *
 * Every account that opens here can create fundraisers and support them, so the form asks for
 * nothing that would settle which of those somebody is. The intent in the address decides where a
 * new account lands and nothing else: it is where this person came from, not what their account is
 * allowed to do, so it no longer changes a word on the page.
 */
export default async function SignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const intent = parseIntent(sp.intent);
  // An explicit destination wins; without one the intent decides which action the dashboard
  // leads with. safeNext refuses anything that is not a path inside the site.
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, homeForIntent(intent));

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Create your"
      accent="account"
      intro={<p>Create fundraisers, sponsor work, or do both.</p>}
      support="One account gives you access to both."
    >
      <SignUpForm next={next} intent={intent} />
    </AuthShell>
  );
}
