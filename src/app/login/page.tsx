import type { Metadata } from "next";
import { AuthShell, AuthPoints } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const linkError = sp.error === "link";

  return (
    <AuthShell
      eyebrow="Organizers and sponsors"
      title="Sign"
      accent="in"
      intro={<p>One account to create fundraisers, sponsor work, or do both. Organizers land on their fundraisers, sponsors on what they have supported.</p>}
      aside={
        <AuthPoints
          heading="What is waiting inside"
          points={[
            "Your fundraisers: sponsorship options, prices, what has sold, and the sponsor materials waiting on your answer.",
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
