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
      title="Sign"
      accent="up"
      intro={
        <p>
          One account for both sides of the room. Play, back the musicians playing, or do both from
          the same place.
        </p>
      }
      aside={
        <AuthPoints
          heading="What an account is for"
          points={[
            "Musicians open a board, set their own prices, and keep the final say on every mark.",
            "Door Money holds the money and pays the act every Friday through the run.",
            "Patrons keep a record of every placement and backing: the shows, the rooms, the money.",
            "Bids, wins and near misses all sit in one place, so nothing has to be chased by email.",
            "Signing up costs nothing and commits to nothing.",
          ]}
        />
      }
    >
      <SignUpForm next={next} />
    </AuthShell>
  );
}
