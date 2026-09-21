import type { Metadata } from "next";
import { AuthShell, AuthPoints } from "@/components/AuthShell";
import { SignUpForm } from "@/components/SignUpForm";
import { safeNext } from "@/lib/auth";
import { AVAILABILITY_NOTE, STARTING_CATEGORIES_NOTE } from "@/lib/starting-categories";

export const metadata: Metadata = { title: "Sign up" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);

  return (
    <AuthShell
      eyebrow="Organizers and sponsors"
      title="Create your"
      accent="account"
      // A beam crossing behind the form would otherwise change what its labels sit on.
      panelClass="bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))]"
      intro={
        <p>
          Create fundraisers, sponsor work you care about, or do both from one free
          account.
        </p>
      }
      aside={
        <AuthPoints
          heading="One account. More ways to support work."
          points={[
            "Start a fundraiser with a clear purpose and a clear promise to sponsors.",
            "Turn sponsorship opportunities into meaningful income, without chasing agreements, payments or updates across email.",
            "See what your support helps make possible and what you can count on receiving.",
            "Keep every fundraiser, sponsorship, payment and backing organized in one place.",
            STARTING_CATEGORIES_NOTE,
            `Join free. ${AVAILABILITY_NOTE}`,
          ]}
        />
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  );
}

