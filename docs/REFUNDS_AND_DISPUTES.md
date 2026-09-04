# Refunds and disputes

The policy, and what enforces each part of it. The public version is at `/refunds`; keep the two in step.

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
| The act declines a mark | The unreleased part goes back, the spot returns to the board. A mark is normally decided before the run starts, so in practice this is everything. | `decideMark` in `src/app/actions/marks.ts` |
| The act cancels the run | Every patron and every fan gets the unreleased part back. Open spots come off the board. A checkout in flight is expired, and a fan's unfinished payment is cancelled. | `cancelRun` in `src/lib/refunds.ts` |
| An auction winner never pays | Nothing was ever charged. The spot rolls to the next bid with a fresh 48 hours. | `rollExpiredFunding` in `src/lib/auctions.ts` |
| Someone takes a spot at its take-it-now price | The bidders were never charged. They are told the bidding is over. | `notifyBiddersSpotTaken` in `src/lib/purchases.ts` |
| A patron does not think the run is happening | Every slice not yet released is paused. Door Money looks, then either releases the hold or refunds the unreleased part. | `raiseFlag` in `src/lib/flags.ts`, cleared from `/admin` |
| Door Money refunds by hand in Stripe | The `charge.refunded` webhook mirrors the amount, and a full refund stops the remaining slices. | `src/app/api/stripe/webhook/route.ts` |

Refunds go to the card the patron paid with. Banks take five to ten business days.

## Disputes

A dispute is a patron asking their bank to reverse the charge. Door Money would rather be asked first, because a flag stops the money at once and a dispute can take the bank up to seventy five days.

**What Door Money does when one arrives.**

1. Stops every payment still to go out on that placement, the same hold a patron flag applies.
2. Answers the bank with the record: the run's dates, which shows were played, attendance where the act counted it, any photos, and the board as it stood.
3. Tells the act what was disputed and why, once there is something to say.

**Who carries the loss.** If the bank sides with the patron, the patron is made whole first, always. Money Door Money still holds covers it. If slices had already gone to the act, Door Money covers the difference and recovers it from that act's later payouts. Where there are no later payouts, Door Money absorbs it. An act is never asked to send money back out of its own pocket.

Stripe charges a fee for a dispute whatever the outcome. Door Money pays that and does not pass it on.

**Repeat disputes.** An act whose runs are disputed more than once is taken off the board while Door Money works out why. A patron who disputes runs that demonstrably happened can be refused future placements.

## What is automatic and what is a person

Automatic today: every row in the table above. The flag hold, the cancellation refunds, the auction rolls, and the mirror of a Stripe Dashboard refund all happen without anyone watching.

A person today: everything in the dispute section. Stripe sends `charge.dispute.created`, `charge.dispute.closed` and their siblings, and the webhook does not handle them yet. Nothing pauses on its own when a dispute lands, and nobody is alerted. The commitments above are kept by hand.

**The gap worth closing first.** Handle `charge.dispute.created` the way `raiseFlag` handles a flag: pause the remaining slices, record it, email Door Money. The machinery exists; it needs wiring to the event. Until that ships, disputes have to be watched in the Stripe Dashboard.
