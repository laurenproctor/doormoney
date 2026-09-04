# System invariants

The rules Door Money has to keep once it holds real money. This document states the rule, then says
plainly whether the code enforces it today. Most of them it does not. Nothing here should be read as
a description of current behaviour unless the status says so.

Status is one of:

- **Held**: the code enforces this now, and something tests or constrains it.
- **Partly held**: enforced on the ordinary path, but a concurrent, retried or hostile caller can get past it.
- **Violated**: not enforced. A caller who tries can break it today.

Every claim below was checked against the tree at the Phase 0 branch point (`d5b6e4e`). Line
references are to that commit.

---

## Money

### A patron cannot be charged for a stale auction offer

**Violated.** Enforced by Phase 3.

Checkout reads the lot, the winning bid and the price at session-creation time
(`src/app/api/checkout/route.ts`), but the session is not bound to a funding token or an offer
version, and webhook fulfilment does not re-check that the winner and price are still the ones the
session was made for. An offer that rolls to the next bidder while a checkout is open can still be
completed by the patron who lost it.

### One auction has one authoritative winner at a time

**Violated.** Enforced by Phase 3.

`closeDueAuctions` and `rollExpiredFunding` (`src/lib/auctions.ts`) select candidate lots, then
update them in a later statement. Nothing locks the lot row across that gap, and `settleDueLots`
runs from page rendering, so two concurrent readers of the same board can both try to settle the
same lot.

### A bid must exceed the authoritative current minimum

**Partly held.** Enforced by Phase 3.

`placeBid` (`src/app/actions/bids.ts:62`) reads the top bid, computes the minimum, and then inserts,
in three separate round trips with no lock and no constraint behind them. The arithmetic is correct
and now tested (`tests/auctions.test.ts`), but two bids that arrive together can both read the same
top and both be accepted. The close-time check has the same shape: it is read before the insert, so
a bid can land after the lot has closed.

### A declined mark receives the refund promised by the product

**Partly held.** Enforced by Phase 2.

`refundDue` (`src/lib/refunds.ts`) returns the unreleased part of the charge plus the fee that rode
on it, and that arithmetic is now tested (`tests/refunds.test.ts`). The promise in
`docs/REFUNDS_AND_DISPUTES.md` matches, but leans on the words "in practice this is everything":
nothing stops weekly slices from being released before the mark is decided. Once Phase 2 gates
placement payouts on mark approval, the promise becomes unconditional.

### A payout cannot exceed the available act share

**Partly held.** Enforced by Phase 2 and Phase 4.

The schedule is built from amount minus fee, so the arithmetic cannot overpay
(`weeklySlices`, tested in `tests/money.test.ts`). What is missing is a constraint: no database rule
prevents a payout row from being written or edited to more than the act's share, and there is no
ledger to check the total against.

### Every Stripe object maps to an internal financial record

**Violated.** Enforced by Phase 4.

There is no reconciliation between Stripe and the database. A charge, refund, transfer or reversal
that exists at Stripe and not here, or here and not at Stripe, goes unnoticed.

### Financial totals must be derivable from an immutable ledger

**Violated.** Enforced by Phase 4.

There is no ledger. Totals are computed from mutable rows on `purchases`, `backings` and
`payout_schedule`, and revenue is read from configured lot prices rather than from what was actually
charged.

---

## Webhooks and durability

### Every webhook is idempotent and retryable

**Partly held.** Enforced by Phase 4.

`src/app/api/stripe/webhook/route.ts:32` inserts the event id first and treats a duplicate insert as
already handled, which is the right shape. Two gaps:

1. When a handler **throws**, the row is deleted and a 500 is returned, so Stripe retries. Good.
2. When a fulfilment function **returns `{ ok: false }`**, the failure is only logged and the route
   returns 200 with the event row still in place. The event is recorded as processed though its
   business operation never completed, and Stripe will not retry it.

There is also no distinction between received, processing, processed and failed, so a crash between
the insert and the work leaves the event permanently marked as seen.

### A webhook is not complete until its business operation completes

**Violated.** Enforced by Phase 4. Same cause as above.

### Refunds and cancellations survive a failure

**Violated.** Enforced by Phase 2.

`cancelRun` (`src/lib/refunds.ts`) walks purchases and backings in an in-memory loop and collects
failures into an `errors` array that is returned to the caller and then dropped. If the process dies
halfway, the refunds that had not run yet leave no record that they were owed. There is no outbox,
no retry worker, and no staff-visible failure state.

---

## Access and privacy

### Funding tokens and Stripe account information are private

**Violated.** Enforced by Phase 1.

`lots` carries `funding_token` (`supabase/migrations/0011_auctions.sql:8`) and its policy is
`public read lots ... using (true)`. Any anonymous caller can read every funding token straight from
the Data API. `acts` carries `stripe_account_id` and `stripe_payouts_enabled`
(`supabase/migrations/0001_init.sql:44`) under `public read acts ... using (true)`, so Connect
account ids are public too.

### A musician cannot alter protected payout or auction state through PostgREST

**Violated.** Enforced by Phase 1.

The owner policies are `own acts on acts for all using (auth.uid() = owner_id)` and
`own profile on profiles for all using (auth.uid() = id)`. `FOR ALL` with no column privileges means
an authenticated musician can write any column on their own row directly through the Data API,
including `stripe_account_id`, `stripe_payouts_enabled` and `slug`, without ever touching a server
action. Server actions are currently the only place these rules exist, and they are not a security
boundary.

### Anonymous bidder identity is not publicly disclosed

**Partly held.** Enforced by Phase 1.

`patrons` has RLS enabled and no policy, so anonymous callers cannot read patron rows and cannot
join a bid to a name. But `public read bids ... using (true)` exposes `patron_id` on every bid,
including bids marked `anonymous`. That id is a stable identifier: it links a patron's bids to each
other across lots and boards, and it becomes a name the moment any future policy opens `patrons`.
The `anonymous` flag hides the name on the board and nowhere else.

---

## Identity

### Public board URLs and login credentials can evolve independently

**Violated.** Enforced by Phase 5.

`profiles.username` and `acts.slug` share one namespace by design today: `src/lib/username.ts` says
so, and `usernameTaken` checks both tables. A musician who renames their board therefore changes how
they sign in, and there is no slug history, so every published link to the old address breaks.

### One act per account

**Violated.** Enforced by Phase 1.

Nothing in the schema constrains `acts.owner_id` to one row per account. The application assumes one
act per account throughout.

---

## Rendering

### Page rendering does not initiate global financial or auction mutations

**Violated.** Enforced by Phase 3.

`src/app/board/[slug]/page.tsx:81` calls `settleDueLots` during render, with the service-role
client. Loading a public board page can close auctions, roll offers to the next bidder and send
email. The comment there explains the reason (a daily cron is too slow for a close), which Phase 3
must solve with a worker rather than a page.
