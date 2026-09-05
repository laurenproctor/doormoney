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
      eyebrow="Musicians and patrons"
      title="Sign"
      accent="in"
      intro={<p>One account, both sides of the room. Musicians land on their fundraiser, patrons on what they have backed.</p>}
      aside={
        <AuthPoints
          heading="What is waiting inside"
          points={[
            "The fundraiser: spots, prices, what has sold, and the logos waiting on a yes.",
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
