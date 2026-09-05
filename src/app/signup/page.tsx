import type { Metadata } from "next";
import { AuthShell, AuthPoints } from "@/components/AuthShell";
import { SignUpForm } from "@/components/SignUpForm";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign up" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);

  return (
    <AuthShell
      eyebrow="Musicians and patrons"
      title="Create your"
      accent="account"
      // A beam crossing behind the form would otherwise change what its labels sit on.
      panelClass="bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))]"
      intro={
        <p>
          Raise money for your music, support musicians you care about, or do both from one free
          account.
        </p>
      }
      aside={
        <AuthPoints
          heading="One account. More ways to move music forward."
          points={[
            "Raise money for upcoming shows, tours, releases and creative work already in motion.",
            "Turn sponsorship opportunities into meaningful income, without chasing agreements, payments or updates across email.",
            "Support musicians directly and see what your money is helping make possible.",
            "Keep every fundraiser, sponsorship, payment and backing organized in one place.",
            "Join free. Start raising or giving support whenever you are ready.",
          ]}
        />
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  );
}
