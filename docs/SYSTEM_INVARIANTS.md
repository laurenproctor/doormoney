# System invariants

The rules Door Money has to keep once it holds real money. This document states the rule, then says
plainly whether the code enforces it today. Most of them it does not. Nothing here should be read as
a description of current behavior unless the status says so.

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

**Held** as of migration `0022`. Proved by `supabase/tests/permissions_test.sql` tests 1 to 3.

It was violated: `lots.funding_token`, `acts.stripe_account_id` and `acts.stripe_payouts_enabled`
were all readable by any anonymous caller, and all three were reproduced against a local stack
before the fix. `0022` revokes the table-level select on `acts`, `lots` and `bids` and grants back an
explicit column list, so these columns are no longer part of the Data API.

Note for anyone tightening this further: a column-level `revoke` does nothing while a table-level
`grant select` stands. Postgres treats the table grant as covering every column, present and future.
The revoke has to be wholesale, with the allowed columns granted back by name.

### A musician cannot alter protected payout or auction state through PostgREST

**Held** as of migration `0022`. Proved by `supabase/tests/permissions_test.sql` tests 16 to 25.

It was violated: the `FOR ALL` owner policies plus full table privileges let an authenticated
musician rewrite their own `stripe_account_id`, turn `stripe_payouts_enabled` on and grant themselves
`founding`, straight through the Data API. All three were reproduced locally.

`0022` splits the `FOR ALL` policies on `acts` and `profiles` into separate select, insert and update
policies with no delete, and replaces the blanket write grants with explicit column lists. Row
ownership decides which rows; column privileges decide which columns. A musician may still edit
their act's description, publish and unpublish a run, and set a lot's commercial terms.

### Anonymous bidder identity is not publicly disclosed

**Held** as of migration `0022`. Proved by `supabase/tests/permissions_test.sql` tests 4, 5, 13 to 15.

It was violated, and this was the worst of the four. The `patrons` table was correctly locked, but
`patron_names` (a `security_invoker = false` view granted to `anon`) plus `patron_id` on the publicly
readable `bids` table meant one join named every anonymous bidder:

```sql
select b.amount_cents, pn.name from bids b join patron_names pn on pn.id = b.patron_id where b.anonymous;
```

Reproduced against a local stack with a realistic patron name. The seed hides it by naming those
patrons "Anonymous patron"; production rows carry the real one. `src/lib/boards.ts` was also fetching
the name for every bid and masking it afterwards in TypeScript, so the masking was never the thing
protecting it.

`0022` revokes `select` on `patron_names` from both roles, drops `patron_id` from the columns
`bids` exposes, and adds `public_bids`, which resolves the name and masks it in the view. An
anonymous bid now has no name to leak rather than a name a caller is trusted to hide.

---

### Reserved names cannot be claimed as a handle or a board address

**Held** as of migration `0022`. Proved by `supabase/tests/permissions_test.sql` tests 26 and 27, and
by `tests/reserved-names.test.ts`, which keeps the database list and `RESERVED_SLUGS` equal.

It was violated: `handle_new_user` copies `username` out of `raw_user_meta_data`, which the client
controls at signup, and the reserved list lived only in TypeScript. Anyone could sign up as `admin`.

### A lot with bids or payments on it cannot be deleted

**Held** as of migration `0022`, via the `lots_refuse_delete_with_history` trigger. Proved by
`supabase/tests/permissions_test.sql` test 32. Deleting such a lot would orphan money and erase an
auction's history.

### A musician cannot move a run to a state that is not theirs

**Held** as of migration `0022`, via the `runs_status_transition` trigger. Proved by
`supabase/tests/permissions_test.sql` tests 25 and 34. A musician moves a run between `draft` and
`open`, which is publishing. `closed` and `cancelled` are settled by the service role, because they
carry refunds with them.

## Identity

### Public board URLs and login credentials can evolve independently

**Violated.** Enforced by Phase 5.

`profiles.username` and `acts.slug` share one namespace by design today: `src/lib/username.ts` says
so, and `usernameTaken` checks both tables. A musician who renames their board therefore changes how
they sign in, and there is no slug history, so every published link to the old address breaks.

### One act per account

**Held** as of migration `0022`, via the partial unique index `acts_one_per_owner`. Proved by
`supabase/tests/permissions_test.sql` test 28.

### An account only reaches a patron's paid history if the person owns the email address

**Held today, by email confirmation. Turning confirmation off violates it.**

`handle_new_user` calls `claim_patron_rows(new.id, new.email)` (migration `0021`, rewritten in
`0027`). That hands every unclaimed `patrons` row carrying the same address to the new account:
what was backed, what was paid, and the record behind each one. The trigger fires when the
`auth.users` row is inserted, which is at sign-up, before anything has been confirmed. So the
linking already happens for an address somebody merely typed.

What confirmation buys is the session, not the linking. An impostor can create the row today, but
cannot sign in, so cannot read any of it. With `mailer_autoconfirm` on, sign-up returns a session
straight away and whoever typed the address reaches `/patron` as its owner.

Before Door Money is public, one of two things has to be true: confirmation is back on, or the
claim moves out of `handle_new_user` and behind something that actually proves the address, and
sign-up stops linking history it cannot vouch for.

---

## Rendering

### Page rendering does not initiate global financial or auction mutations

**Violated.** Enforced by Phase 3.

`src/app/[slug]/[run]/page.tsx` calls `settleDueLots` during render, with the service-role
client. Loading a public board page can close auctions, roll offers to the next bidder and send
email. The comment there explains the reason (a daily cron is too slow for a close), which Phase 3
must solve with a worker rather than a page.
