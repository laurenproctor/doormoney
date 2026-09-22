import type { Metadata } from "next";
import { AuthShell, AuthPoints } from "@/components/AuthShell";
import { SignUpForm } from "@/components/SignUpForm";
import { safeNext } from "@/lib/auth";
import { homeForIntent, parseIntent, type Intent } from "@/lib/intent";
import { AVAILABILITY_NOTE, STARTING_CATEGORIES_NOTE } from "@/lib/starting-categories";

export const metadata: Metadata = { title: "Sign up" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The one way in.
 *
 * Every account that opens here can create fundraisers and support them, so the form asks for
 * nothing that would settle which of those somebody is. The intent in the address changes the
 * opening line and the order of the reasons, and nothing else: it is where this person came from,
 * not what their account is allowed to do.
 */
const INTENT_LEAD: Record<Intent, string> = {
  creator: "Create fundraisers, sponsor work you care about, or do both. One free account does all of it, and creating one is the first step to your own fundraiser.",
  patron: "Sponsor work you care about, create fundraisers of your own, or do both. One free account does all of it, and nothing has to be decided now.",
  explore: "One Door Money account for creating fundraisers, supporting work, or doing both. Look around first and decide later.",
};

const DEFAULT_LEAD = "One Door Money account for creating fundraisers, supporting work, or doing both.";

const CREATOR_POINTS = [
  "Start a fundraiser with a clear purpose and a clear promise to sponsors.",
  "Turn sponsorship opportunities into meaningful income, without chasing agreements, payments or updates across email.",
  "See what your support helps make possible and what you can count on receiving.",
];

const PATRON_POINTS = [
  "See what your support helps make possible and what you can count on receiving.",
  "Keep every sponsorship, backing and record in one place, with an optional page that is private until you publish it.",
  "Start a fundraiser of your own whenever you want one. The same account already does it.",
];

export default async function SignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const intent = parseIntent(sp.intent);
  // An explicit destination wins; without one the intent decides which action the dashboard
  // leads with. safeNext refuses anything that is not a path inside the site.
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, homeForIntent(intent));

  const points = intent === "patron" ? PATRON_POINTS : CREATOR_POINTS;

  return (
    <AuthShell
      eyebrow="One account, both sides"
      title="Create your"
      accent="account"
      // A beam crossing behind the form would otherwise change what its labels sit on.
      panelClass="bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))]"
      intro={<p>{intent ? INTENT_LEAD[intent] : DEFAULT_LEAD}</p>}
      aside={
        <AuthPoints
          heading="One account. Two things it can do."
          points={[
            ...points,
            "Keep every fundraiser, sponsorship, payment and backing organized in one place.",
            STARTING_CATEGORIES_NOTE,
            `Join free. ${AVAILABILITY_NOTE}`,
          ]}
        />
      }
    >
      <SignUpForm next={next} intent={intent} />
    </AuthShell>
  );
}
