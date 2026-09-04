import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Contact, LegalPage, Term, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refunds and disputes",
  description: "What comes back, when, and what happens if a patron asks their bank instead. Door Money's refund and dispute policy.",
};

const UPDATED = "September 3, 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "principle",
    heading: "The one rule",
    body: (
      <>
        <p>
          A patron pays nothing for a placement that never ran. Everything on this page follows from that, and from one fact about
          how the money moves.
        </p>
        <p>
          A patron pays the whole amount when they take a spot. {SITE.name} holds it, and it reaches the act in equal weekly
          slices between the run&apos;s first date and its last. Money that has not been released yet can always go back.
        </p>
        <p>
          {SITE.name} returns its {SITE.feePercent}% on whatever is refunded. The fee is earned by a placement that ran, not by
          taking the payment.
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
          What comes back is the part that has not reached the act yet. Before the first Friday of a run that is the whole
          amount. Half way through a run it is roughly half. The slices already sent stay with the act, because the run did
          happen those weeks.
        </p>
        <p>
          A run of eight weeks, a spot at $400, cancelled after three Fridays: three eighths has gone to the act, so five
          eighths comes back, {SITE.name}&apos;s fee on that part included.
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
        <p>Six ways a payment reverses, and only the last needs anyone to ask.</p>
        <Bullets
          items={[
            <>
              <Term name="The act declines the mark">
                The spot goes back on the board and the patron is refunded. A mark is normally settled before the run starts, so
                in practice this is everything.
              </Term>
            </>,
            <>
              <Term name="The act cancels the run">
                Every patron and every fan gets the unreleased part back, and the open spots come off the board. A checkout part
                way through is closed without charging.
              </Term>
            </>,
            <>
              <Term name="An auction winner does not pay">
                Nothing was ever charged. A winning bid is not a payment. The spot rolls to the next bid after 48 hours.
              </Term>
            </>,
            <>
              <Term name="Somebody takes a spot outright">
                Bidders on an auction spot that is taken at its set price are never charged, and are told the bidding is over.
              </Term>
            </>,
            <>
              <Term name="A patron says the run is not happening">
                Every payment still to go out on that placement stops the same day. See below.
              </Term>
            </>,
            <>
              <Term name="A patron asks">
                Sending a note to {SITE.contact} works. {SITE.name} would rather hear it early than late.
              </Term>
            </>,
          ]}
        />
        <p>Refunds go back to the card the payment came from. Banks take five to ten business days to show them.</p>
      </>
    ),
  },
  {
    id: "flag",
    heading: "Saying a run is not happening",
    body: (
      <>
        <p>
          Every patron gets a record of their run by email, and every record carries a link for saying the run is not
          happening. One click on it holds every payment still to go out on that placement, straight away.
        </p>
        <p>
          Nothing is charged or refunded by that click. It stops money, which is the safe direction. {SITE.name} reads the note,
          checks with the act, and then either lets the payments continue or sends the unreleased part back.
        </p>
        <p>
          The act is not told by the click itself. {SITE.name} looks first, because a quiet week and a cancelled run look alike
          from outside.
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
          A dispute is a patron asking their bank to reverse a charge. It is always available and nobody needs permission to use
          it. {SITE.name} would rather be asked first, because the link on the record stops the money at once and a bank can
          take up to seventy five days.
        </p>
        <p>When a dispute arrives, {SITE.name} does three things.</p>
        <Bullets
          items={[
            "Stops every payment still to go out on that placement, the same hold the record link applies.",
            "Answers the bank with the record: the dates, which shows were played, attendance where the act counted it, any photos, and the board as it stood.",
            "Tells the act what was disputed, once there is something worth saying.",
          ]}
        />
        <p>
          Stripe charges a fee for a dispute whatever the outcome. {SITE.name} pays it and does not pass it on to the act.
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
          If the bank sides with the patron, the patron is made whole first, every time. Money {SITE.name} still holds covers it.
        </p>
        <p>
          Where slices had already gone to the act, {SITE.name} covers the difference and recovers it from that act&apos;s later
          payouts. Where there are no later payouts, {SITE.name} absorbs it. An act is never asked to send money back out of its
          own pocket for a run it played.
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
          An act whose runs are disputed more than once comes off the board while {SITE.name} works out why. That is not a
          judgment, it is a pause.
        </p>
        <p>
          A patron who disputes runs that demonstrably happened can be refused future placements. The record exists so that
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
          What comes back, how much of it, and what happens when a patron asks their bank instead. The short version: a patron
          pays nothing for a placement that never ran.
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
