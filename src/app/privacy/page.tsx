import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Contact, LegalPage, Term, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Door Money collects, why, who else sees it, and how long it stays.",
};

const UPDATED = "September 3, 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    heading: "Who is responsible",
    body: (
      <p>
        {SITE.name}, based in {SITE.city}, decides what personal information the site collects and why. Questions and requests
        go to <Contact />.
      </p>
    ),
  },
  {
    id: "collected",
    heading: "What Door Money collects",
    body: (
      <>
        <p>Only what the marketplace needs to run. By where it comes from:</p>
        <Bullets
          items={[
            <Term key="waitlist" name="The waitlist">Name, email address, whether the person is an act or a patron, and optionally their city and the kind of act.</Term>,
            <Term key="accounts" name="Accounts">Email address and sign-in details. A name for the account.</Term>,
            <Term key="acts" name="Acts">Act name, the run&apos;s dates and venues, the show list, prices, and optionally a photo per show and a self-reported attendance figure. Stripe collects identity and bank details directly for payouts; {SITE.name} stores only the Stripe account reference.</Term>,
            <Term key="patrons" name="Patrons">Name or business name, email address, the mark (a name or a logo), what they bought or bid on, and the payment status. Card numbers go straight to Stripe and never touch {SITE.name}.</Term>,
            <Term key="fans" name="Fans who back through the widget">Display name, email address and the tier chosen.</Term>,
            <Term key="auto" name="Automatically">Server logs with IP address, browser type and the pages requested, kept briefly for security and debugging. {SITE.name} runs no analytics scripts and no tracking pixels.</Term>,
          ]}
        />
      </>
    ),
  },
  {
    id: "why",
    heading: "Why",
    body: (
      <>
        <Bullets
          items={[
            "To run the marketplace: list runs, hold money, pay acts, and send records.",
            "To show patron names on boards and marks on surfaces, as the act and the patron agreed.",
            "To send email about the run: confirmations, approvals, payouts, and the end-of-run record.",
            "To prevent fraud and meet legal duties, including the checks Stripe requires.",
            "To answer questions and fix problems.",
          ]}
        />
        <p>
          {SITE.name} does not sell personal information and does not use it for advertising. It sends marketing email only to
          people who joined the waitlist, and only about {SITE.name} opening. Every such email has an unsubscribe link.
        </p>
      </>
    ),
  },
  {
    id: "public",
    heading: "What appears in public",
    body: (
      <>
        <p>
          Boards are public pages. A board shows the act&apos;s name, the run, each lot, its price, and the name of the patron who
          bought or is bidding on it. A patron who bids anonymously in an auction is shown as an anonymous patron on the board;
          the act still sees who they are, since the act has to approve the mark.
        </p>
        <p>
          The widget shows how much of a run is backed and can show the display names of fans who backed it. The end-of-run
          record goes to the patron and to the act, not to the public.
        </p>
      </>
    ),
  },
  {
    id: "shared",
    heading: "Who else sees it",
    body: (
      <>
        <Bullets
          items={[
            <Term key="stripe" name="Stripe">Processes payments and payouts and runs fraud checks. Stripe sees payment details and, for acts, identity and bank details. Stripe&apos;s own privacy policy covers what it does with them.</Term>,
            <Term key="supabase" name="Supabase">Hosts the database, sign-in, and uploaded files such as logos and photos.</Term>,
            <Term key="resend" name="Resend">Delivers email on {SITE.name}&apos;s behalf.</Term>,
            <Term key="hosting" name="The hosting provider">Serves the site and keeps short-lived server logs.</Term>,
            <Term key="acts" name="Acts">See the name and email of each patron who buys their lots or backs them, so they can approve the mark and thank them.</Term>,
            <Term key="patrons" name="Patrons">See the act&apos;s name, the run, and what the record shows.</Term>,
          ]}
        />
        <p>
          {SITE.name} also shares information when the law requires it, or to protect someone&apos;s safety or {SITE.name}&apos;s rights.
          These providers store data in the United States. {SITE.name} never gives anyone else a list of its acts, patrons or
          fans.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "How long it stays",
    body: (
      <Bullets
        items={[
          "Waitlist entries: until Door Money opens and the person has been told, or until they ask to be removed.",
          "Account details: while the account is open, then 30 days.",
          "Transactions, records and payout history: seven years after the run ends, as financial records law requires.",
          "Photos from a run: as long as the record they belong to.",
          "Server logs: 30 days.",
        ]}
      />
    ),
  },
  {
    id: "rights",
    heading: "What anyone can ask for",
    body: (
      <>
        <p>Anyone whose information {SITE.name} holds can ask, by email, for any of these:</p>
        <Bullets
          items={[
            "A copy of the information Door Money holds about them.",
            "A correction, where something is wrong.",
            "Deletion, except where the law requires Door Money to keep a record of a payment.",
            "No more marketing email.",
            "A stop to any use they object to, with an explanation of why.",
          ]}
        />
        <p>
          {SITE.name} answers within 30 days and does not charge for it. People in places with stronger privacy laws, such as
          California, the European Union and the United Kingdom, have these rights by law and {SITE.name} honours them in full.
          Anyone unhappy with an answer can complain to their local data protection authority.
        </p>
      </>
    ),
  },
  {
    id: "security",
    heading: "Security",
    body: (
      <>
        <p>
          The site runs over HTTPS only. Stripe handles cards, so {SITE.name} never holds card numbers. Database access is limited
          to the server, and the keys that bypass access rules never reach a browser. Sign-in sessions use secure cookies (see the{" "}
          <Link href="/cookies">cookie policy</Link>).
        </p>
        <p>
          No system is perfect. If a breach puts anyone at risk, {SITE.name} tells the people affected and any regulator the law
          names, without undue delay.
        </p>
      </>
    ),
  },
  {
    id: "children",
    heading: "Children",
    body: (
      <p>
        The site is for adults. {SITE.name} does not knowingly collect information from anyone under 18 and deletes it on
        request when it finds out.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        {SITE.name} posts changes here and updates the date at the top. For changes that affect how information is used,{" "}
        {SITE.name} emails account holders before the change takes effect.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <p>
        Requests and questions about privacy go to <Contact />.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      path="/privacy"
      tape="House paper"
      title="Privacy"
      accent="policy"
      intro={
        <p>
          What {SITE.name} collects, why, who else sees it, and how long it stays. Short, because the list is short. No
          advertising, no tracking, nothing sold.
        </p>
      }
      stamp={
        <>
          NO ADS<br />NO<br />TRACKING
        </>
      }
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
