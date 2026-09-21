import type { Metadata } from "next";
import Link from "next/link";
import { AuthPoints, AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "@/components/SignUpForm";
import { safeNext } from "@/lib/auth";
import { STARTING_CATEGORIES_LIST } from "@/lib/starting-categories";

/*
  The patron's door.

  The same account, the same auth, the same server action as /signup. What changes is the question
  it does not ask: a patron who came here to support work has already said so by walking through
  this door, so the roles are settled and no organizer address is wanted. They land on the profile
  page, which is optional and private, rather than in the middle of creating a fundraiser they never
  had. It names no category: a patron may support any of them.
*/

export const metadata: Metadata = { title: "Open a patron account" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PatronSignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, "/dashboard/profile");

  return (
    <AuthShell
      eyebrow="Patrons"
      title="Support the"
      accent="work"
      intro={
        <p>
          An account for anyone who puts money behind work they care about: a local business, a brand, or one
          person. The starting categories are {STARTING_CATEGORIES_LIST}, and the set is growing.
        </p>
      }
      aside={
        <AuthPoints
          heading="What a patron account is for"
          points={[
            "Every sponsorship and backing in one place, with the record behind it.",
            "Bids in progress, and how each one ended.",
            "An optional public page, private until it is published, with no amounts on it ever.",
            "Door Money holds the money and releases it to the organizer under the fundraiser's terms.",
            "Opening an account costs nothing and commits to nothing.",
          ]}
        />
      }
    >
      <SignUpForm next={next} fixedRoles={["patron"]} submitLabel="Open the account" />
      <p className="mt-5 border-t border-line pt-5 text-[14.5px] text-muted">
        Organizers start from{" "}
        <Link href="/list" className="text-accent-ink underline underline-offset-4">
          Create a fundraiser
        </Link>
        . One account can do both.
      </p>
    </AuthShell>
  );
}
