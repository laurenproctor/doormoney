import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Contact, LegalPage, Term, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "The rules for organizing a fundraiser, buying a sponsorship and making a backing on Door Money.",
};

const UPDATED = "September 21, 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    heading: "Who these terms cover",
    body: (
      <>
        <p>
          These terms are an agreement between {SITE.name} and everyone who uses the site: people who visit, organizers who
          create a fundraiser, sponsors who buy a sponsorship, fans who make a backing, and anyone acting for a business or an
          organization that does any of these. Using the site means accepting the terms. Anyone who does not accept them should
          not use the site.
        </p>
        <p>
          Organizers, sponsors and backers must be at least 18 years old and able to enter a contract. A person who organizes or
          pays on behalf of a business, a team or another organization confirms that it has allowed them to.
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
            <Term key="organizer" name="Organizer">The person or organization responsible for a fundraiser and for delivering what it promises: a musician, a team, a filmmaker, a theater company or another organizer.</Term>,
            <Term key="sponsor" name="Sponsor">A person or business that buys a sponsorship.</Term>,
            <Term key="patron" name="Patron">Anyone with an account who supports work on {SITE.name}, as a sponsor, a backer or both. One account may organize and sponsor.</Term>,
            <Term key="fundraiser" name="Fundraiser">One named funding effort with its own category, purpose and timeline, such as a tour, a season, a production or a screening series.</Term>,
            <Term key="option" name="Sponsorship option">A priced offer on a fundraiser that describes the visibility a sponsor receives. A sponsorship is the purchase of one.</Term>,
            <Term key="placement" name="Placement">Where a sponsor&apos;s name, logo, product or message appears. It may be physical, digital, printed or part of a production.</Term>,
            <Term key="materials" name="Materials">What a sponsor hands over so the placement can be made: a name or logo, a credit line, artwork or a product.</Term>,
            <Term key="deliverable" name="Deliverable">A specific promised action or appearance, with a due date or a delivery window.</Term>,
            <Term key="evidence" name="Evidence">What the organizer supplies to document a deliverable, such as a photograph, a link or a note. It comes from the organizer. {SITE.name} passes it on and does not certify it.</Term>,
            <Term key="backing" name="Backing">A fan contribution at a set tier through a music fundraiser&apos;s widget, in return for recognition and not a placement.</Term>,
            <Term key="record" name="Record">The sponsor&apos;s summary of what was bought, what was delivered, the evidence and the payment outcomes. It is separate from Stripe&apos;s payment receipt.</Term>,
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
          {SITE.name} is a sponsorship marketplace. Organizers create a fundraiser, say what the funding enables, choose the
          sponsorship options they offer and set their own prices. Sponsors buy the visibility an option describes. {SITE.name}{" "}
          holds the money, releases the organizer&apos;s share under the fundraiser&apos;s terms, and gives the sponsor a record.
        </p>
        <p>
          The agreement about what appears, and where, is between the organizer and the sponsor. {SITE.name} is not a manager,
          an agent, a producer or a promoter. It does not book work, inspect placements, promise an audience, or guarantee that
          any fundraiser will finish.
        </p>
        <p>
          A sponsorship is a purchase of visibility. It is not an investment, a loan or an ownership stake, and it carries no
          promise of a commercial return. {SITE.name} does not treat a sponsorship or a backing as a charitable gift and makes no
          statement about how either is taxed.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    heading: "Categories, places and payments",
    body: (
      <>
        <p>
          Fundraisers belong to a category, and {SITE.name} opens categories one at a time. A category may accept private
          drafts before it can publish a fundraiser, and may publish before it can take payments. Music fundraisers take
          payments today. A sponsorship option in a category that is not open for payment cannot be bought, and the site says so
          at checkout.
        </p>
        <p>
          A category says what kind of work a fundraiser funds. It never says where. Organizers and audiences can be anywhere,
          and the work can be in person, online or both. Payments are narrower than that today: every price and every payment
          is in US dollars, and {SITE.name} pays organizers through Stripe accounts in the United States. {SITE.name} will say
          here when that changes.
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
          A username is an address on the site. {SITE.name} can refuse or reclaim a username that impersonates someone,
          misleads, or uses a reserved word, and limits how often one can change.
        </p>
        <p>
          {SITE.name} can close an account that breaks these terms, and will say why. Open fundraisers on a closed account
          finish under these terms, so money already held still reaches the organizer or returns to the sponsor.
        </p>
      </>
    ),
  },
  {
    id: "organizers",
    heading: "Organizing a fundraiser",
    body: (
      <>
        <p>An organizer who publishes a fundraiser agrees to the following.</p>
        <Bullets
          items={[
            "The organizer has the authority to offer every placement on the fundraiser, and the right to put a sponsor's materials there. A team representative has authority over the team's inventory. A league's, a venue's or a supplier's rules still apply.",
            "The fundraiser says truthfully what the funding enables, who the audience is and what a sponsor receives. Any audience figure is an estimate, and the organizer states what it is based on.",
            "The dates, locations and other details are accurate, and the organizer updates them promptly when they change.",
            "The organizer delivers every sponsorship it accepts, as the option described it, and documents delivery in the ways the fundraiser said it would.",
            "The organizer accepts or declines each sponsor's materials within a reasonable time. Nothing appears without the organizer's approval, and the organizer can decline any materials for any reason.",
            "The organizer does not sell the same placement twice, here or anywhere else.",
            "A music fundraiser offers no placements at weddings or private events.",
            "Evidence that shows a child is never published. A youth team publishes no evidence at all.",
          ]}
        />
        <p>
          {SITE.name} suggests prices only where it has a sales history to suggest from. The organizer&apos;s own price always
          wins. {SITE.name} charges nothing to create a fundraiser and takes its fee only from sponsorships and backings that
          sell.
        </p>
      </>
    ),
  },
  {
    id: "sponsors",
    heading: "Buying a sponsorship and making a backing",
    body: (
      <>
        <p>
          Buying a sponsorship is a commitment. The sponsor pays the full price up front and {SITE.name} holds it. At a fixed
          price the sponsor pays at checkout. Where an option is open to bids, a bidder saves a card with the bid, and each bid
          is a binding offer to pay that amount. When bidding closes, the highest bid wins and {SITE.name} charges the saved
          card. If that charge fails, the winner has 48 hours to pay through a link sent by email. After that the option passes
          to the next highest bid. A bidder who does not win is never charged.
        </p>
        <p>
          The sponsor sees what the sponsorship includes before paying. What was bought is fixed at that moment: later changes to
          the fundraiser, the organizer&apos;s profile or the price do not rewrite a completed purchase.
        </p>
        <p>
          Materials must be the sponsor&apos;s own, or ones the sponsor has the right to use. The organizer may decline them. When an
          organizer declines a sponsor&apos;s materials, the money held goes back in full.
        </p>
        <p>
          Some sponsorships involve a product, a service or a space that the sponsor supplies. {SITE.name} moves money and
          nothing else. Anything supplied in kind is agreed between the organizer and the sponsor, and is not bought or sold
          through {SITE.name}.
        </p>
        <p>
          A backing through a music fundraiser&apos;s widget is a fan contribution at a set tier. It buys recognition, such as a name
          on the tour thank-you, not a placement. A backing follows the same holding and refund rules as a music sponsorship.
        </p>
        <p>
          A sponsor gets the visibility described in the option and a record. A sponsor does not get a say in the
          organizer&apos;s work, its content, its bookings or its other sponsors.
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
          {SITE.name} keeps {SITE.feePercent}% of every sponsorship and every backing as its fee. The rest belongs to the
          organizer, and {SITE.name} holds it until the fundraiser&apos;s terms release it. Releases go out on Fridays.
        </p>
        <Bullets
          items={[
            <Term key="music" name="Music">The organizer&apos;s share is released in equal weekly parts between the fundraiser&apos;s first date and its last. A part is released only once the charge has cleared, the musician has approved the sponsor&apos;s logo and payout setup is finished. A part that waits is paid late, never reduced. Backings follow the dates alone.</Term>,
            <Term key="others" name="Every other category">Nothing is released on a calendar. The organizer&apos;s share is released one deliverable at a time, as the organizer documents each one, and only after the organizer has accepted the sponsor&apos;s materials.</Term>,
          ]}
        />
        <p>
          The terms a sponsorship was bought under stay with it. A later change to a category&apos;s terms applies to later
          purchases only.
        </p>
        <p>
          Stripe processes every payment and every payout. {SITE.name} never sees or stores card numbers. Organizers receive
          payouts through a Stripe account and must finish Stripe&apos;s onboarding, which includes identity and bank checks, before
          the first payout. Stripe&apos;s own terms apply to that account.
        </p>
        <p>
          Each organizer and each sponsor handles their own taxes. {SITE.name} reports what the law requires it to report and
          nothing more.
        </p>
      </>
    ),
  },
  {
    id: "refunds",
    heading: "Refunds and cancelled fundraisers",
    body: (
      <>
        <p>Money that has not been released to the organizer can always go back. In practice:</p>
        <Bullets
          items={[
            "If an organizer declines a sponsor's materials, the sponsor gets everything back.",
            "If an organizer cancels a fundraiser, every sponsor and every backer gets back whatever has not been released. Before anything is released, that is everything.",
            "Money already released for work that happened stays with the organizer.",
            "A sponsor who believes a sponsorship is not being delivered can flag it from the record. Door Money holds every release still to come on that sponsorship while it looks, and refunds the unreleased part if the flag holds up.",
            "A missed funding goal changes nothing. A sponsorship is a direct purchase, and it stands whatever the fundraiser raises.",
          ]}
        />
        <p>
          Refunds go back to the card the sponsor paid with. {SITE.name} returns its fee on whatever it refunds.
        </p>
        <p>
          The <Link href="/refunds">refunds and disputes policy</Link> works through the same ground in detail, including what
          happens when a sponsor asks their bank instead. These terms govern if the two ever disagree.
        </p>
      </>
    ),
  },
  {
    id: "content",
    heading: "Logos, photos, evidence and other content",
    body: (
      <>
        <p>
          Anyone who uploads a logo, a photo, evidence or text keeps ownership of it and gives {SITE.name} permission to show it
          where the site needs to: on the fundraiser, in the widget, in records, and in emails about the sponsorship. That
          permission ends when the content is removed, except for records already sent.
        </p>
        <p>
          Evidence outside music is private by default. The sponsor who bought the sponsorship, the organizer and {SITE.name} can
          see it. An organizer may publish an item, one at a time, and never one that shows a child.
        </p>
        <p>
          Content must not be unlawful, hateful, misleading, or infringe anyone else&apos;s rights. {SITE.name} can remove content that
          breaks this rule and can refuse a sponsorship whose materials do.
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
          The widget belongs to music fundraisers today. Musicians may embed it on sites they control, using the snippet on the{" "}
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
          {SITE.name} provides the site as it is. It does not promise uninterrupted service. It does not promise any sponsor a
          level of attendance, reach, impressions or sales. It does not promise that a film will be distributed, that a team
          will play, or that any organizer will finish what a fundraiser set out to do.
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
          Anyone can close their account at any time by emailing <Contact />. Open fundraisers and sponsorships finish under
          these terms first.
        </p>
        <p>
          {SITE.name} may suspend or close an account for breaking these terms, for suspected fraud, or when Stripe requires it.
          {" "}{SITE.name} tells the account holder why, except where the law prevents it.
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
          new terms. Sponsorships already bought finish under the terms they were bought under.
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
          {SITE.name} is based in New York, and New York law governs these terms wherever an organizer or a sponsor is. Any
          dispute goes to the state or federal courts in New York County, New York. Before either side files anything, both
          agree to try to settle it by email for thirty days.
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
          The rules for using {SITE.name}. They cover organizers who raise money, sponsors and backers who pay, and anyone who
          visits. Plain language on purpose. Where a sentence sounds firm, it is.
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
