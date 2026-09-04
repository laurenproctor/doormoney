import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Contact, LegalPage, Term, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "The rules for listing an act, buying a lot and backing a run on Door Money.",
};

const UPDATED = "September 3, 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    heading: "Who these terms cover",
    body: (
      <>
        <p>
          These terms are an agreement between {SITE.name} and everyone who uses the site: people who visit, acts that list a
          run, patrons that buy a lot or back an act, and anyone acting for a business that does either. Using the site means
          accepting the terms. Anyone who does not accept them should not use the site.
        </p>
        <p>
          Acts and patrons must be at least 18 years old and able to enter a contract. A person who lists or pays on behalf of a
          business confirms that the business has allowed them to.
        </p>
      </>
    ),
  },
  {
    id: "words",
    heading: "The words used here",
    body: (
      <>
        <p>The site uses a few words in a specific way. They mean the same thing in these terms.</p>
        <Bullets
          items={[
            <Term key="act" name="Act">Any musician or group that lists: a touring band, a house act or a soloist.</Term>,
            <Term key="patron" name="Patron">Anyone who pays. A business or brand buying a placement, or a fan backing an act.</Term>,
            <Term key="run" name="Run">The thing a patron backs: a tour, a season, or a residency month, with a start date and an end date.</Term>,
            <Term key="surface" name="Surface">A physical or digital place a mark can go, such as a kick drum head, a road case, a tip jar card, or a post.</Term>,
            <Term key="lot" name="Lot">One surface, on one run, at one price. What a business patron buys.</Term>,
            <Term key="backing" name="Backing">A fan-tier contribution through the widget, in return for recognition rather than a surface.</Term>,
            <Term key="mark" name="Mark">The patron&apos;s name or logo, as it will appear.</Term>,
            <Term key="record" name="Record">The end-of-run summary a patron receives.</Term>,
          ]}
        />
      </>
    ),
  },
  {
    id: "what",
    heading: "What Door Money is",
    body: (
      <>
        <p>
          {SITE.name} is a marketplace. Acts list a run, name the surfaces they offer, and set their own prices. Patrons buy lots
          or back an act. {SITE.name} holds the money, pays the act weekly through the run, and sends the patron a record at the
          end.
        </p>
        <p>
          The deal about where a mark goes is between the act and the patron. {SITE.name} is not a manager, a booking agent, or a
          promoter. It does not book shows, promise a crowd, or guarantee that any run will finish.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    heading: "Accounts",
    body: (
      <>
        <p>
          An account needs a working email address. The person who holds an account is responsible for what happens under it
          and for keeping the sign-in private. Anyone who thinks someone else has used their account should tell {SITE.name}{" "}
          straight away.
        </p>
        <p>
          {SITE.name} can close an account that breaks these terms, and will say why. Open runs on a closed account finish under
          these terms, so money already held still reaches the act or returns to the patron.
        </p>
      </>
    ),
  },
  {
    id: "acts",
    heading: "Listing a run",
    body: (
      <>
        <p>An act that lists a run agrees to the following.</p>
        <Bullets
          items={[
            "The act owns or controls every surface it offers, and has the right to put a patron's mark on it.",
            "The run's dates, venues and show count are accurate, and the act tells Door Money promptly when any of them change.",
            "The act honours every lot it accepts: the mark goes on the surface, as described, for the whole run.",
            "The act approves or declines each mark within a reasonable time. Nothing goes up without the act's yes, and the act can say no to any mark for any reason.",
            "No placements at weddings or private events.",
            "The act does not list the same surface on the same run twice, or sell a surface outside Door Money that a patron has already bought here.",
          ]}
        />
        <p>
          The standard card on the <Link href="/placements">placements page</Link> lists default prices. The act&apos;s own price on
          a lot always wins. {SITE.name} charges no listing fee and takes its fee only from lots and backings that sell.
        </p>
      </>
    ),
  },
  {
    id: "patrons",
    heading: "Buying a lot and backing an act",
    body: (
      <>
        <p>
          Buying a lot is a commitment. The patron pays the full price up front, before the first show, and {SITE.name} holds it
          through the run. On a fixed-price lot the patron pays at checkout. On an auction lot each bid is a binding offer to pay
          that amount, and the highest bid when the auction closes wins. The winner puts the money up within 48 hours or the lot
          rolls to the next bid.
        </p>
        <p>
          The mark must be the patron&apos;s own name or logo, or one the patron has the right to use. The act may decline any mark.
          When an act declines, the patron pays nothing and any money held goes back in full.
        </p>
        <p>
          Backing an act through the widget is a fan contribution at a set tier. It buys recognition, such as a name on the tour
          thank-you or on the merch table card, not a surface. Backing follows the same holding and refund rules as a lot.
        </p>
        <p>
          A patron gets the placement described in the lot and a record at the end of the run. A patron does not get a say in
          the act&apos;s music, set list, bookings or other patrons.
        </p>
      </>
    ),
  },
  {
    id: "money",
    heading: "Money",
    body: (
      <>
        <p>
          {SITE.name} keeps {SITE.feePercent}% of every lot and every backing as its fee. The rest belongs to the act.{" "}
          {SITE.name} releases it in equal weekly slices between the run&apos;s start date and its end date, and pays acts every
          Friday.
        </p>
        <p>
          Stripe processes every payment and every payout. {SITE.name} never sees or stores card numbers. Acts receive payouts
          through a Stripe account and must finish Stripe&apos;s onboarding, which includes identity and bank checks, before the first
          payout. Stripe&apos;s own terms apply to that account.
        </p>
        <p>
          Each act and each patron handles their own taxes. {SITE.name} reports what the law requires it to report and nothing
          more.
        </p>
      </>
    ),
  },
  {
    id: "refunds",
    heading: "Refunds and cancelled runs",
    body: (
      <>
        <p>Patrons pay nothing for a placement that never runs. In practice:</p>
        <Bullets
          items={[
            "If an act declines a mark, the patron gets everything back.",
            "If an act cancels a run before it starts, every patron gets everything back.",
            "If an act cancels part way through, patrons get back the slices not yet released. Slices already paid for weeks the run played stay paid.",
            "A patron who believes a placement did not run can flag the lot. Door Money pauses the next release for that lot while it looks, and refunds if the flag holds up.",
          ]}
        />
        <p>
          Refunds go back to the card the patron paid with. {SITE.name} returns its fee along with the rest whenever the
          placement never ran.
        </p>
        <p>
          The <Link href="/refunds">refunds and disputes policy</Link> works through the same ground in detail, including what
          happens when a patron asks their bank instead. These terms govern if the two ever disagree.
        </p>
      </>
    ),
  },
  {
    id: "content",
    heading: "Marks, photos and other content",
    body: (
      <>
        <p>
          Anyone who uploads a mark, a logo, a photo or text keeps ownership of it and gives {SITE.name} permission to show it on
          the board, in the widget, in records, and in emails about the run. That permission ends when the content is removed,
          except for records already sent.
        </p>
        <p>
          Content must not be unlawful, hateful, misleading, or infringe anyone else&apos;s rights. {SITE.name} can remove content that
          breaks this rule and can decline to run a lot whose mark does.
        </p>
      </>
    ),
  },
  {
    id: "widget",
    heading: "The widget",
    body: (
      <>
        <p>
          Acts may embed the {SITE.name} widget on sites they control, using the snippet on the{" "}
          <Link href="/widget">widget page</Link>. The widget must stay as {SITE.name} serves it: not altered, not covered, and
          not placed anywhere that misleads a fan about who is paying whom. {SITE.name} may change or withdraw the widget with
          notice.
        </p>
      </>
    ),
  },
  {
    id: "promises",
    heading: "What Door Money does not promise",
    body: (
      <>
        <p>
          {SITE.name} provides the site as it is. It does not promise uninterrupted service, a particular level of attendance,
          reach or sales for any patron, or that any act will complete a run.
        </p>
        <p>
          To the extent the law allows, {SITE.name}&apos;s liability to any person is limited to the fees {SITE.name} kept from that
          person&apos;s transactions in the twelve months before the claim. Nothing here limits liability for fraud, for death or
          personal injury caused by negligence, or for anything else the law does not let a business limit.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    heading: "Ending things",
    body: (
      <>
        <p>
          Anyone can close their account at any time by emailing <Contact />. Open runs finish under these terms first.
        </p>
        <p>
          {SITE.name} may suspend or close an account for breaking these terms, for suspected fraud, or when Stripe requires it.
          {SITE.name} tells the account holder why, except where the law prevents it.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: (
      <>
        <p>
          {SITE.name} posts changes on this page and updates the date at the top. For changes that matter, {SITE.name} emails
          account holders at least 14 days before the change takes effect. Continued use after that date means acceptance of the
          new terms. Runs already under way finish under the terms they started with.
        </p>
      </>
    ),
  },
  {
    id: "law",
    heading: "Law and disputes",
    body: (
      <>
        <p>
          New York law governs these terms. Any dispute goes to the state or federal courts in New York County, New York. Before
          either side files anything, both agree to try to settle it by email for thirty days.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <p>
        Questions about these terms go to <Contact />. {SITE.name} answers within five business days.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      path="/terms"
      eyebrow="House paper"
      title="Terms and"
      accent="conditions"
      intro={
        <p>
          The rules for using {SITE.name}. They cover acts that list, patrons that pay, and anyone who visits. Plain language on
          purpose. Where a sentence sounds firm, it is.
        </p>
      }
      stamp={
        <>
          READ<br />BEFORE<br />SIGNING
        </>
      }
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
