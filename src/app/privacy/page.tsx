import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Contact, LegalPage, Term, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Door Money collects, why, who else sees it, and how long it stays.",
};

const UPDATED = "September 21, 2026";

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
            <Term key="newsletter" name="The new-fundraisers email">Email address, a first name where one is given, and the page it was entered on.</Term>,
            <Term key="accounts" name="Accounts">Email address and sign-in details, a first and last name, and an account photo where one is added.</Term>,
            <Term key="organizers" name="Organizers">The profile: a name, an address on the site, and optionally a description, a photo, a website, a social handle and a city, region and country. The fundraiser: its category, purpose, audience, dates, locations, goal, sponsorship options and prices. For music, the list of shows, and optionally a photo per show and a self-reported attendance figure. Evidence of delivery, which may be a photograph, a link, a document or a note. Stripe collects identity and bank details directly for payouts; {SITE.name} stores only the Stripe account reference.</Term>,
            <Term key="sponsors" name="Sponsors">Name or business name, email address, the materials sent for a placement (a name, a logo, a credit line or artwork), what they bought or bid on, and the payment status. Card numbers go straight to Stripe and never touch {SITE.name}. A bidder saves a card with Stripe when bidding; {SITE.name} stores Stripe&apos;s reference to the customer and the card, not the card.</Term>,
            <Term key="profiles" name="Public patron profiles">Optional, and off until the patron turns one on: a display name, a username, whether the profile is for a person or an organization, a description, a location, a website, interests, the categories supported, a tag in the patron&apos;s own words, a photo, a header image and the page&apos;s color.</Term>,
            <Term key="fans" name="Fans who back through the widget">Display name, email address and the tier chosen.</Term>,
            <Term key="auto" name="Automatically">Server logs with IP address, browser type and the pages requested, kept briefly for security and debugging. {SITE.name} counts page views with Vercel Web Analytics, which sets no cookies and stores no IP addresses. No tracking pixels.</Term>,
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
            "To run the marketplace: publish fundraisers, hold money, pay organizers, and send records.",
            "To show sponsors where the organizer and the sponsor agreed they would appear.",
            "To send email about a sponsorship: confirmations, approvals, reminders, payouts, and the record.",
            "To prevent fraud and meet legal duties, including the checks Stripe requires.",
            "To answer questions and fix problems.",
          ]}
        />
        <p>
          {SITE.name} does not sell personal information and does not use it for advertising. It sends marketing email only to
          people who asked for the new-fundraisers email, and only about fundraisers on {SITE.name}. Every such email has an unsubscribe link.
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
          A published fundraiser is a public page. It shows the organizer&apos;s name and profile, the fundraiser, each sponsorship
          option, its price, and the name of the sponsor who bought it or is bidding on it. A sponsor who bids anonymously is
          shown as an anonymous sponsor, and that bid can never be published on a profile. The organizer still sees who they
          are, since the organizer has to approve the materials. A draft is private, and so are its options and prices.
        </p>
        <p>
          A music fundraiser&apos;s widget shows how much has been backed and can show the display names of fans who backed it.
        </p>
        <p>
          A patron&apos;s public profile is off until the patron turns it on. Each sponsorship or backing on it is published one at a
          time, by the patron. The profile photo and the header image are kept in private storage and shown through links that expire.
        </p>
        <p>
          The record goes to the sponsor and the organizer. Its page is not listed anywhere and search engines are told not to
          index it, but anyone holding its link can open it. For music, the show photos on a record are stored publicly.
          Outside music, evidence is private: only the sponsor, the organizer and {SITE.name} can see an item unless the
          organizer publishes it. An item that shows a child is never published, and nothing from a youth team is.
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
            <Term key="stripe" name="Stripe">Processes payments and payouts and runs fraud checks. Stripe sees payment details and, for organizers, identity and bank details. Stripe&apos;s own privacy policy covers what it does with them.</Term>,
            <Term key="supabase" name="Supabase">Hosts the database, sign-in, and uploaded files such as logos, photos and evidence.</Term>,
            <Term key="resend" name="Resend">Delivers email on {SITE.name}&apos;s behalf.</Term>,
            <Term key="hosting" name="Vercel">Serves the site, counts page views without cookies, and keeps short-lived server logs.</Term>,
            <Term key="organizers" name="Organizers">See the name and email of each sponsor who buys from them and each fan who backs them, and the materials a sponsor sent, so they can approve the materials and thank them.</Term>,
            <Term key="sponsors" name="Sponsors">See the organizer&apos;s name, the fundraiser, and what the record shows, including the evidence for what they bought.</Term>,
          ]}
        />
        <p>
          {SITE.name} also shares information when the law requires it, or to protect someone&apos;s safety or {SITE.name}&apos;s rights.
          These providers store data in the United States. {SITE.name} never gives anyone else a list of its organizers, sponsors,
          patrons or fans.
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
          "New-fundraisers email addresses: until the person unsubscribes or asks to be removed.",
          "Account details: while the account is open, then 30 days.",
          "Transactions, records and payout history: seven years after the fundraiser ends, as financial records law requires.",
          "Photos and evidence: as long as the record they belong to.",
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
        Accounts are for adults. {SITE.name} does not knowingly collect information from anyone under 18 and deletes it on
        request when it finds out. A youth team&apos;s organizer is an adult, and evidence that shows a child stays private.
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
      eyebrow="House paper"
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
