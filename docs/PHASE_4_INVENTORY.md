# Phase 4: inventory before the work

Written 2026-09-18 from a read of `main` at `c4a3a03`. Nothing here is built, and nothing was
changed to write it. `docs/REMEDIATION_PLAN.md` says a phase does not start without approval; this
is the reading that comes before asking for it: what Phase 4 requires, what already exists, what is
missing, what the plan forgot, and the decisions that are Lauren's and not an engineer's.

## What Phase 4 asks for

From the plan, in its words: an immutable ledger whose entries balance; webhook-event storage that
tells received from processing from processed from failed; dispute and transfer-reversal handling
with an explicit recovery policy; a daily reconciliation of Stripe against the database; a
dead-letter queue, staff alerts and admin visibility; revenue calculated from charges and ledger
entries; and replay tests. Phase 2 left it one more item: plan the reconciliation of existing
purchases and payout rows.

**The gate.** For every cent Stripe reports, Door Money can explain its source, current owner,
state and destination.

## What exists today

| Area | What is there | Where |
| --- | --- | --- |
| The charge | The patron pays Door Money. The charge lands on the platform balance. Three ways in: embedded Checkout for a sponsorship, a PaymentIntent for a backing, an off-session charge for a won bid. | `src/lib/stripe.ts` |
| The fee | 15%, rounded down, stored on the row as `fee_cents`. It is "the part never transferred", kept by arithmetic. | `src/lib/money.ts` |
| The payout | One `payout_schedule` row per Friday per payment. The Friday job sends a Transfer per row, keyed on the row id, sourced from the charge. `transfer.created` repairs a job that died between Stripe and the database. | `src/lib/payouts.ts` |
| What may be paid | A sponsorship waits for the approved logo. Enforced in code and by a trigger. | `src/lib/release.ts`, migration 0031 |
| Refunds owed | Written to `financial_operations` before Stripe is called. Retried on a widening schedule, six attempts, then `failed` and shown on `/admin`. | `src/lib/refunds.ts`, `src/lib/outbox.ts`, migration 0032 |
| Payment states | `requires_payment`, `held`, `released`, `refunded`, `partially_refunded`, with every illegal move refused by Postgres. A refund can neither shrink nor exceed its charge. | migration 0033 |
| Webhook dedupe | The event id is inserted into `stripe_events` first. A second delivery is answered without acting. A handler that throws deletes the row and returns 500, so Stripe retries. | `src/app/api/stripe/webhook/route.ts` |
| Hand refunds | `charge.refunded` mirrors the amount, and a full refund skips the remaining slices. | same |
| The patron flag | Pauses the unreleased slices of one payment and emails Door Money. | `src/lib/flags.ts` |
| Staff alerts | Two: a failed transfer on a Friday, and a patron flag. Both go to `CONTACT_TO_EMAIL`. | `src/lib/payouts.ts`, `src/lib/flags.ts` |
| The dispute policy | Written, and good: who is made whole, who carries the loss, what is never asked of a musician. Kept by hand. | `docs/REFUNDS_AND_DISPUTES.md` |

The webhook acts on nine event types: the four `checkout.session.*`, `payment_intent.succeeded`,
`payment_intent.canceled`, `charge.refunded`, `transfer.created` and `account.updated`. The endpoint
is subscribed to eighteen.

## Requirement by requirement

### 1. An immutable ledger whose entries balance

**Built: the schema 2026-09-22 (0055), the writer 2026-09-24 (0064, `src/lib/ledger.ts`).** What
follows is the reading as it was.

**Missing entirely.** There is no ledger table. What the system knows about money is the current
state of four tables (`purchases`, `backings`, `payout_schedule`, `financial_operations`), each of
which is updated in place. A row says where a payment is now and nothing about how it got there.
"How much does Door Money owe musicians today" is answerable only by summing scheduled slices, and
"how much has Door Money earned" is not answerable from stored facts at all: the fee is a number on
the purchase, never an event.

What it needs: an append-only table of entries, each with an account (patron charge, Door Money
fee, musician liability, Stripe fee, transfer, refund, dispute, recovery, adjustment), a signed
amount, the Stripe object it came from, and the payment it belongs to. Update and delete revoked
and refused by trigger. A check, in SQL, that the entries for one payment sum to zero.

### 2. Webhook-event storage with real states

**Partly there, and the gaps are real.**

- `stripe_events` has three columns: id, type, received_at. There is no status, no attempt count,
  no error and no payload.
- **Any insert error is read as a duplicate.** The handler treats a failed insert as "already
  handled" and answers 200. A unique violation is that. So is a database timeout, and Stripe will
  not send the event again.
- **`{ ok: false }` is logged and forgotten.** `fulfilLotPurchase` and `fulfilBacking` report a
  refusal by return value. The route logs it, leaves the event row in place and answers 200. The
  invariants doc already names this one.
- **A crash between the insert and the work** leaves the event marked as seen for good.

What it needs: status (`received`, `processing`, `processed`, `failed`), attempts, last error, the
payload or enough of it to replay, and a worker that picks up `failed` and stale `processing` rows
the way `outbox.ts` already does for refunds. That file is the pattern to copy.

### 3. Disputes and transfer reversals

**Policy written, nothing wired.** No `charge.dispute.*` event is handled. Nothing pauses, nobody
is emailed. `transfer.reversed` is not handled either.

The cheap first step is the one `docs/REFUNDS_AND_DISPUTES.md` already names: treat
`charge.dispute.created` like a patron flag. `raiseFlag` pauses the unreleased slices and writes to
Door Money. The machinery exists.

The rest needs decisions first. See "Decisions" below, 1 and 2.

### 4. Daily reconciliation

**Missing entirely.** Nothing compares Stripe to the database in either direction. The closest
thing is `transfer.created`, which repairs one specific failure.

What it needs: a daily job that lists Stripe's charges, refunds, transfers, reversals and disputes
for a window and matches each to a row, then does the same the other way round. Every mismatch
becomes a row a person can see, not a log line. The project's plan allows two Vercel crons and
both are taken, so this joins `/api/cron/daily` or is called by `pg_cron` the way the auction
worker is since migration 0036.

### 5. Dead letters, alerts, admin visibility

**Partly there.** `/admin` shows refunds that are pending, retrying or failed. A failed Friday
transfer and a patron flag each send an email. Missing: failed webhook events (there is nowhere
for them to be), reconciliation mismatches (same), disputes, and a transfer that fails every
Friday, which is reported weekly and never escalates.

### 6. Revenue from charges, not list prices

**Done 2026-09-24.** `/admin` reads `ledger_balances`; the runs table sums what purchases were
charged, refunds off. The musician dashboard's "worth" went with the 2026-09-22 rework.

**Three places add up list prices.** `/admin` totals sold sponsorships by `lots.price_cents`, twice
(`src/app/admin/page.tsx`, lines 167 and 168). The musician's dashboard computes "worth" the same
way (`src/app/dashboard/page.tsx`, line 44). An auction sells above its list price and a refund
takes money back, so all three are wrong as soon as either happens. The weekly digest and the
`/admin` held total already use `amount_cents` and are right.

### 7. Replay tests

**None.** No test touches the webhook route. The unit harness can already stub `fetch` and fake the
database (`tests/weekly.test.ts` does both), so signed fixture events through the real handler are
within reach without a new dependency.

### The Phase 2 leftover: existing rows

**Small.** As of the read-only audit on 2026-09-17 the hosted project had an empty
`payout_schedule`, no connected accounts and a zero Stripe balance: no real money has moved. The
only payments are seed rows that have no Stripe object behind them. A ledger can start empty, with
the seed rows either given opening entries marked as seed or left out of the balance check by
name. That should be re-checked on the day, from a terminal.

## What the plan does not list, and the gate requires

1. **Stripe's own fees.** Recorded since 2026-09-24: `stripe_fee` entries, read off the charge's
   balance transaction when the payment is held. As first written: no file in the repo mentions them. Stripe takes its processing fee out
   of the platform balance, which means out of Door Money's 15%. On a full refund Door Money
   returns its fee and Stripe keeps theirs, so every refund costs Door Money money that no table
   records. The gate says every cent Stripe reports. These are cents Stripe reports, on the
   balance transaction of each charge. The ledger needs an account for them.
2. **A refund can fail after it succeeds.** `refundRow` treats a successful `refunds.create` as
   final and marks the payment refunded. Stripe can fail a refund later (a closed card, for one)
   and says so with `refund.failed`. Nothing listens. The database would say a patron has money
   they do not have.
3. **The events arrive in a 2014 shape.** The webhook endpoint has no API version pinned, so
   payloads follow the account default, which is 2014-03-13. The SDK pins 2026-08-26 for requests
   only. Dispute and refund objects changed a great deal in those twelve years. Fixtures recorded
   today would break the day the account is upgraded, so this comes before any replay test. It is
   a Dashboard action and it is Lauren's.
4. **A partial refund by hand leaves the slices alone.** `charge.refunded` skips the remaining
   slices only on a full refund. After a partial one, the Friday job still tries to send the
   musician the full net. Whether Stripe refuses the transfer that would exceed what is left of
   the charge, or sends it, should be shown in test mode, not assumed.
5. **Eighteen subscribed, nine handled.** The nine that arrive and are ignored are recorded as
   processed. Once events carry a status, "ignored on purpose" should be one of them.

## Decisions that are Lauren's

Each has a default that follows the policy already written. They are here because code should not
be what settles them.

1. **Does Door Money ever reverse a transfer?** The policy says a musician is never asked to send
   money back out of their own pocket, and that a loss is recovered from that musician's later
   payouts. A transfer reversal takes money out of the musician's Stripe balance, which is arguably
   their pocket. *Default: never reverse automatically. Record `transfer.reversed` if Stripe or a
   person does one, and recover only by withholding from later slices.*
   **Decided 2026-09-19: the default stands, with a bounded last resort. Decision 18 in
   `docs/DECISIONS.md` holds the terms, and note that it leans on decision 2 below.**
2. **What does "recover from later payouts" reach?** Later slices of the same fundraiser only, or
   any later fundraiser by the same musician, and for how long. *Default: the same musician, any
   fundraiser, no time limit, shown to the musician on the payouts page before it happens.*
3. **Who is told about a dispute, and when?** The policy says the musician hears "once there is
   something to say". *Default: Door Money at once, the musician when the bank decides.*
4. **Where do staff alerts go?** Today it is one inbox, `CONTACT_TO_EMAIL`, shared with the contact
   form. *Default: a separate `ALERTS_TO_EMAIL`, so a dispute is never sitting under a press
   inquiry.*
5. **Does a won dispute put the money back on the schedule?** Stripe returns the funds when a
   dispute is won. *Default: yes, the paused slices resume on the next Friday.*
6. **The contradiction the audit found is still open.** `docs/ROADMAP.md` says to run the original
   Phase 3 with real money before building anything else. `docs/REMEDIATION_PLAN.md` says the
   system is not safe for real money until this phase is done. One of them has to give.

## A shape for the work

The plan's rule is one phase, one pull request. This phase is larger than the three before it, and
two halves of it do not depend on each other. If the rule bends anywhere, it should bend here, into
pieces that each pass their own gate:

1. **Events with states, and the worker that retries them.** No new behavior, so it is the safe
   one to land first, and everything after it needs somewhere to record a failure.
2. **The ledger, written by the paths that already move money.** Charge, fee, Stripe fee,
   liability, transfer, refund. Balance check in SQL. Revenue on `/admin` and the dashboard moves
   to it.
3. **Disputes, refund failures and reversals**, once decisions 1 to 5 are made.
4. **Reconciliation and the alerts that come out of it.**

Before any of it: pin the webhook's API version, which is item 3 in the section above.
