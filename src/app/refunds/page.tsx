import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Contact, LegalPage, Term, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refunds and disputes",
  description: "What comes back, when, and what happens if a sponsor asks their bank instead. Door Money's refund and dispute policy.",
};

const UPDATED = "September 21, 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "principle",
    heading: "The one rule",
    body: (
      <>
        <p>
          Money that has not been released to the organizer can always go back. Everything on this page follows from that, and
          from one fact about how the money moves.
        </p>
        <p>
          A sponsor pays the whole amount when they buy. {SITE.name} holds it, and releases the organizer&apos;s share under the
          fundraiser&apos;s terms. Those terms depend on the category, and the next section sets them out.
        </p>
        <p>
          {SITE.name} returns its {SITE.feePercent}% on whatever is refunded. The fee is earned by a sponsorship that was
          delivered, not by taking the payment.
        </p>
      </>
    ),
  },
  {
    id: "release",
    heading: "When money is released",
    body: (
      <>
        <Bullets
          items={[
            <Term key="music" name="Music">The organizer&apos;s share goes out in equal weekly parts, on Fridays, between the fundraiser&apos;s first date and its last. A part goes only once the charge has cleared, the musician has approved the sponsor&apos;s logo and payout setup is finished. A part that waits keeps its amount and is paid late.</Term>,
            <Term key="others" name="Every other category">Nothing goes out on a calendar. The organizer&apos;s share goes out one deliverable at a time, on the Friday after the organizer documents it, and only after the organizer has accepted the sponsor&apos;s materials.</Term>,
          ]}
        />
        <p>
          Music fundraisers take payments today. A category that is not open for payment cannot be bought at all, so there is
          nothing to refund.
        </p>
      </>
    ),
  },
  {
    id: "how-much",
    heading: "How much comes back",
    body: (
      <>
        <p>
          What comes back is the part that has not reached the organizer yet. Before anything is released, that is the whole
          amount. The parts already released stay with the organizer, because that work happened.
        </p>
        <p>
          A music example: a tour of eight weeks, a sponsorship at $400, cancelled after three Fridays. Three eighths has gone
          to the musician, so five eighths comes back, {SITE.name}&apos;s fee on that part included.
        </p>
        <p>Fan backings through the widget work the same way.</p>
      </>
    ),
  },
  {
    id: "when",
    heading: "When money comes back",
    body: (
      <>
        <p>Six situations, and only the last needs anyone to ask.</p>
        <Bullets
          items={[
            <>
              <Term name="The organizer declines the sponsor's materials">
                The sponsorship option goes back on the fundraiser and the sponsor is refunded. Nothing is released before
                materials are accepted, so this is everything.
              </Term>
            </>,
            <>
              <Term name="The organizer cancels the fundraiser">
                Every sponsor and every backer gets the unreleased part back, and the open options come off the fundraiser. A
                checkout part way through is closed without charging.
              </Term>
            </>,
            <>
              <Term name="A winning bidder's card fails">
                A bidder saves a card with the bid, and {SITE.name} charges the winner when bidding closes. If that charge
                fails, nothing was taken. The winner has 48 hours to pay through a link sent by email, and then the option
                passes to the next bid.
              </Term>
            </>,
            <>
              <Term name="Somebody buys an option outright">
                Bidders on an option that is bought at its set price are never charged, and are told the bidding is over.
              </Term>
            </>,
            <>
              <Term name="A sponsor says the sponsorship is not being delivered">
                Every release still to come on that sponsorship stops. See below.
              </Term>
            </>,
            <>
              <Term name="A sponsor asks">
                Sending a note to {SITE.contact} works. {SITE.name} would rather hear it early than late.
              </Term>
            </>,
          ]}
        />
        <p>
          A sponsor cannot cancel a sponsorship alone once it is paid, because the organizer may already have started the work.
          Asking is always open, and so is the flag below.
        </p>
        <p>Refunds go back to the card the payment came from. Banks take five to ten business days to show them.</p>
      </>
    ),
  },
  {
    id: "waiting",
    heading: "When materials or evidence never arrive",
    body: (
      <>
        <p>
          A release that waits for a sponsor&apos;s logo or materials, or for the organizer&apos;s evidence, keeps waiting. The money stays
          held. It is not paid out and it is not refunded automatically, and {SITE.name} has not set a deadline that ends the
          wait.
        </p>
        <p>
          Either side can write to {SITE.contact}. {SITE.name} hears from both and settles it with them. When {SITE.name} sets a
          deadline, this page will state it before it applies to anyone.
        </p>
      </>
    ),
  },
  {
    id: "flag",
    heading: "Saying a sponsorship is not being delivered",
    body: (
      <>
        <p>
          Every sponsor gets a record by email, and every record carries a link for saying the work is not happening. One click
          on it holds every release still to come on that sponsorship, straight away.
        </p>
        <p>
          Nothing is charged or refunded by that click. It stops money, which is the safe direction. {SITE.name} reads the note,
          checks with the organizer, and then either lets the releases continue or sends the unreleased part back.
        </p>
        <p>
          The organizer is not told by the click itself. {SITE.name} looks first, because a quiet week and a cancelled tour look
          alike from outside.
        </p>
      </>
    ),
  },
  {
    id: "disputes",
    heading: "Disputes",
    body: (
      <>
        <p>
          A dispute is a sponsor asking their bank to reverse a charge. It is always available and nobody needs permission to
          use it. {SITE.name} would rather be asked first, because the link on the record stops the money at once and a bank can
          take up to seventy five days.
        </p>
        <p>When a dispute arrives, {SITE.name} does three things.</p>
        <Bullets
          items={[
            "Stops every release still to come on that sponsorship, the same hold the record link applies.",
            "Answers the bank with the record: what was bought, the dates, and the evidence the organizer supplied.",
            "Tells the organizer what was disputed, once there is something worth saying.",
          ]}
        />
        <p>
          Stripe charges a fee for a dispute whatever the outcome. {SITE.name} pays it and does not pass it on to the
          organizer.
        </p>
      </>
    ),
  },
  {
    id: "loss",
    heading: "Who carries the loss",
    body: (
      <>
        <p>
          If the bank sides with the sponsor, the sponsor is made whole first, every time. Money {SITE.name} still holds covers
          it.
        </p>
        <p>
          Where money had already gone to the organizer, {SITE.name} covers the difference and recovers it from that
          organizer&apos;s later releases. Where there are no later releases, {SITE.name} absorbs it. An organizer is never asked to
          send money back out of their own pocket for work they delivered.
        </p>
      </>
    ),
  },
  {
    id: "repeat",
    heading: "When it keeps happening",
    body: (
      <>
        <p>
          An organizer whose fundraisers are disputed more than once comes off the site while {SITE.name} works out why. That is
          not a judgment, it is a pause.
        </p>
        <p>
          A sponsor who disputes work that demonstrably happened can be refused future sponsorships. The record exists so that
          question has an answer.
        </p>
      </>
    ),
  },
  {
    id: "elsewhere",
    heading: "Where else this is written down",
    body: (
      <>
        <p>
          The <Link href="/terms">terms and conditions</Link> cover the same ground in less detail and govern if the two ever
          disagree. The <Link href="/privacy">privacy policy</Link> covers what happens to the information in a dispute.
        </p>
        <Contact />
      </>
    ),
  },
];

export default function RefundsPage() {
  return (
    <LegalPage
      path="/refunds"
      eyebrow="The house paper"
      title="Refunds and"
      accent="disputes"
      intro={
        <p>
          What comes back, how much of it, and what happens when a sponsor asks their bank instead. The short version: money
          that has not been released to the organizer can always go back.
        </p>
      }
      stamp={
        <>
          MONEY
          <br />
          GOES
          <br />
          BACK
        </>
      }
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
