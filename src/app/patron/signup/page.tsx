import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { signupPath } from "@/lib/intent";

/*
  The patron door, kept open and pointed at the one sign-up form.

  There was a second form here, asking a person to settle at the start that they were a patron and
  nothing else. That was never true to the market: the bassoonist who backs the band down the
  street is one person, and the account has always been able to do both. So the address stays,
  because it is in sent email and on pages already printed, and it now carries what it always
  meant as an intent rather than as a role. Nothing about the account is decided here.

  A destination is carried through where one was given, and only where safeNext says it is a path
  inside the site.
*/

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PatronSignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const asked = typeof sp.next === "string" ? sp.next : null;
  // "" rather than a fallback: nothing is added to the address unless it was asked for and safe.
  const next = safeNext(asked, "");
  redirect(signupPath("patron", next || null));
}
