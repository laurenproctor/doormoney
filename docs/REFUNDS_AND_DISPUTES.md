# Refunds and disputes

The policy, and what enforces each part of it. The public version is at `/refunds`; keep the two in step.

**2026-09-21:** `/refunds` and `/terms` were rewritten in the current vocabulary (organizer, sponsor, fundraiser, sponsorship option, materials) and now state both release rules from `DELIVERY_POLICY_MATRIX.md`: music on the calendar, every other category on evidence. They also say what is true of decisions 16 and 19's open half: money waiting on materials or evidence stays held, with no deadline set. No policy changed. The music mechanics below are as they were, in the words the code still uses (act, run, lot, slice).

## The principle

A patron pays nothing for a placement that never ran. Everything below follows from that and from one fact about how the money moves: a patron pays the whole amount up front, Door Money holds it, and it reaches the act in equal weekly slices across the run. Money that has not been released can always go back.

Door Money returns its own 15% on whatever is refunded. The fee is earned by a placement that ran, not by taking the payment.

## What money can come back

`refundDue` in `src/lib/refunds.ts` is the single rule:

```
refund = amount × (net not yet released ÷ net)
```

where net is the amount minus Door Money's fee. Before the first Friday of a run that is the whole amount. Half way through a run it is roughly half. The slices already sent stay with the act, because the run did happen those weeks.

The same rule covers fan backings. `refundPurchase` and `refundBacking` are the same function over two tables.

## The cases

| Case | What happens | Enforced by |
|---|---|---|
| The act declines a mark | The whole charge goes back, fee included, and the spot returns to the board. Not "in practice": since migration 0031 a sponsorship's weekly slices cannot be paid before the mark is approved, so there is never a released part to subtract. | `decideMark` in `src/app/actions/marks.ts`, `slicePlan` in `src/lib/release.ts` |
| The act cancels the run | Every patron and every fan gets the unreleased part back. Open spots come off the board. A checkout in flight is expired, and a fan's unfinished payment is cancelled. | `cancelRun` in `src/lib/refunds.ts` |
| An auction winner never pays | Nothing was ever charged. The spot rolls to the next bid with a fresh 48 hours. | `rollExpiredFunding` in `src/lib/auctions.ts` |
| Someone takes a spot at its take-it-now price | The bidders were never charged. They are told the bidding is over. | `notifyBiddersSpotTaken` in `src/lib/purchases.ts` |
| A patron does not think the run is happening | Every slice not yet released is paused. Door Money looks, then either releases the hold or refunds the unreleased part. | `raiseFlag` in `src/lib/flags.ts`, cleared from `/admin` |
| Door Money refunds by hand in Stripe | The `charge.refunded` webhook mirrors the amount, and a full refund stops the remaining slices. | `src/app/api/stripe/webhook/route.ts` |

Refunds go to the card the patron paid with. Banks take five to ten business days.

## A refund that is owed does not depend on the request that owed it

A refund is written down before Stripe is called. `cancelRun` and `decideMark` each put a row in
`financial_operations` (migration 0032) and only then attempt it, so a refund Stripe refuses today
is still owed tomorrow and a process that dies partway through loses an attempt rather than an
obligation. The row carries the same idempotency key the Stripe call uses, so neither the queue nor
Stripe can be made to refund the same payment twice.

`src/lib/outbox.ts` works it. The two places an obligation is born attempt it at once, which is why
a cancellation still reports its total on the spot. The daily job retries what failed and stops
after six attempts. The row carries a widening wait (five minutes, then thirty, then two hours,
then twelve, then a day), but the only worker after the first attempt is the daily job, so in
practice each retry is about a day apart and the six attempts span about five days. Stopping is not
giving up: the row stays, marked `failed` with its last error, counted on `/admin` next to the
payment it belongs to. Refunding it by hand in the Stripe Dashboard is what clears it: the
`charge.refunded` webhook mirrors the amount the way it always did, and the next daily job sees
the amount and settles the row.

The patron is told from the queue and nowhere else, once, by whichever attempt gets the money back.
A refund that lands on the fourth try still sends the mail the first try would have.

Two gaps it closes on purpose, because both were reachable rather than theoretical: a worker that
dies holding a row is freed after fifteen minutes, and a crash between marking a fundraiser
cancelled and queueing its refunds is caught by a sweep that asks which patron is still holding
money on a cancelled fundraiser.

## What the database refuses

The rules above are enforced by the application and, since migration 0033, by PostgreSQL under it.
A payment moves `requires_payment` to `held` to `released`, and out to `refunded` or
`partially_refunded`. There is no way back from any of them: a refunded purchase cannot return to
held, a released one cannot return to unpaid, and a refund can neither shrink nor exceed the charge
it is against. A logo is answered once, which is what holds a sponsorship's payouts until the
musician says yes.

None of that is reachable through the site today. It is written down because each one is a single
forgotten condition away from being reachable, and every one of them would be a row saying a
patron's money is somewhere it is not.

## Disputes

A dispute is a patron asking their bank to reverse the charge. Door Money would rather be asked first, because a flag stops the money at once and a dispute can take the bank up to seventy five days.

**What Door Money does when one arrives.**

1. Stops every payment still to go out on that placement, the same hold a patron flag applies.
2. Answers the bank with the record: the run's dates, which shows were played, attendance where the act counted it, any photos, and the board as it stood.
3. Tells the act what was disputed and why, once there is something to say.

**Who carries the loss.** If the bank sides with the patron, the patron is made whole first, always. Money Door Money still holds covers it. If slices had already gone to the act, Door Money covers the difference and recovers it from that act's later payouts. Where there are no later payouts, Door Money absorbs it. An act is never asked to send money back out of its own pocket.

**How that recovery works, and what it never does.** Door Money pays for the platform's charge type
here: with separate charges and transfers, Stripe debits the disputed amount and the dispute fee
from Door Money's balance as soon as a dispute opens. That is the same arrangement that lets Door
Money hold a patron's money in weekly slices at all, so it is not a cost to push elsewhere.
Recovery runs in order: the unreleased slices of that payment first, then withholding from the act's
later slices, and a transfer reversal only as a last resort, only after a dispute closes as lost,
only by a person's decision on `/admin` with the reason written down, and never for more than the
slices that payment already released. Where there are no later payouts, Door Money absorbs it.
`debit_negative_balances` stays off, because reaching a musician's bank account is the one thing the
sentence above rules out. Fraud is the exception: shows that were never played, or evidence that was
made up, are not a run the act played, and a reversal is available at once. Decision 18 in
`docs/DECISIONS.md` holds the full terms.

Stripe charges a fee for a dispute whatever the outcome. Door Money pays that and does not pass it on.

**Repeat disputes.** An act whose runs are disputed more than once is taken off the board while Door Money works out why. A patron who disputes runs that demonstrably happened can be refused future placements.

## What is automatic and what is a person

Automatic today: every row in the table above. The flag hold, the cancellation refunds, the auction rolls, and the mirror of a Stripe Dashboard refund all happen without anyone watching.

A person today: everything in the dispute section. Stripe sends `charge.dispute.created`, `charge.dispute.closed` and their siblings, and the webhook does not handle them yet. Nothing pauses on its own when a dispute lands, and nobody is alerted. The commitments above are kept by hand.

**The gap worth closing first.** Handle `charge.dispute.created` the way `raiseFlag` handles a flag: pause the remaining slices, record it, email Door Money. The machinery exists; it needs wiring to the event. Until that ships, disputes have to be watched in the Stripe Dashboard.
