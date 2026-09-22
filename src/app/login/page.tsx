import type { Metadata } from "next";
import { AuthShell, AuthPoints } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";
import { safeNext } from "@/lib/auth";
import { homeForIntent, parseIntent } from "@/lib/intent";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  /*
    An explicit destination wins. Without one, everybody lands on the same dashboard, carrying
    whatever intent brought them here so that page can lead with the right action. Both forms
    below post this, so a one-time email link, which opens an account when there is none, keeps
    it through the callback too.
  */
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, homeForIntent(parseIntent(sp.intent)));
  const linkError = sp.error === "link";

  return (
    <AuthShell
      eyebrow="One account, both sides"
      title="Sign"
      accent="in"
      intro={<p>One Door Money account for creating fundraisers, supporting work, or doing both. Sign in with the email address on the account, or with a username where one was claimed.</p>}
      aside={
        <AuthPoints
          heading="What is waiting inside"
          points={[
            "Any fundraisers you run: sponsorship options, prices, what has sold, and the sponsor materials waiting on your answer.",
            "Every sponsorship and backing, with the record behind it.",
            "Bids in progress, and the ones that won.",
            "Payouts: what has been sent, and what is still to come.",
          ]}
        />
      }
    >
      <LoginForm next={next} linkError={linkError} />
    </AuthShell>
  );
}
