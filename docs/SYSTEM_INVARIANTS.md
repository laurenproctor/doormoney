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

**Held** as of migration `0035`. Every offer bumps `lots.offer_version`; a purchase records the
`bid_id` and `offer_version` it pays for; `guard_purchase_insert` refuses a purchase that is not for
the lot's current winner at the bid's exact amount and version, and `fulfil_lot_purchase` asks the
same question again under the lot's lock before it will mark the lot sold. A payment that lands for
an offer that has moved on is held (the charge is real) and refunded through the queue under
`stale_offer`; the lot stays with its current winner. Proved by `supabase/tests/auctions_test.sql`
("a payment for an offer that has moved on is not a sale") and by `concurrency_test.sh` scenario 4.

### One auction has one authoritative winner at a time

**Held** as of migration `0035`. `close_auction` and `roll_offer` select the lot `for update` and
decide and write inside that lock, one lot per transaction; a second call finds the lot no longer
open and answers `already`. Settlement runs only from the worker at `/api/cron/auctions` and the
daily job, never from a page. Proved by `concurrency_test.sh` scenario 2: two closes at once, one
`won`, one `already`, `offer_version` 1.

### A bid must exceed the authoritative current minimum

**Held** as of migration `0035`. `place_bid` reads the top bid, computes the minimum and inserts
under the lot's row lock, and `guard_bid_insert` does the same for any insert that arrives another
way, so two bids that arrive together queue: the second sees the first. The close time is checked
in the same place at the database's clock. Proved by `auctions_test.sql` (a bid under the minimum,
a bid after the close, a plain insert of either) and `concurrency_test.sh` scenarios 1 and 3.

### A bid carries a card that was confirmed for it

**Held** as of 2026-09-23, in the action. Migration `0028` gave a bid a saved card so the close
could charge it with nobody present, and `/api/bids/setup` was where the card was stored and the
payment gate asked. The action that placed the bid trusted that the route had run: `setupIntentId`
was optional with Stripe configured, and `placeBid` never asked `paymentsOpenFor` itself. A caller
of the action could place a bid with no card behind it, on a category whose payments were not
open, and the close would fall back to the claim link, which is the 48 hours 0028 was meant to
stop costing the organizer.

`placeBid` (`src/app/actions/bids.ts`) now refuses a bid without a SetupIntent whenever Stripe is
configured, reads the SetupIntent back from Stripe and requires that it succeeded, holds a payment
method, belongs to the patron's own customer and carries the metadata the setup route wrote for
this lot and this patron, refuses one that already sits on a bid, and asks the payment gate before
the patron row is written. The cardless path is only for a Door Money with no Stripe key, and
`cardlessBidsAllowed` closes it on every production build and every Vercel deployment. Proved by
`tests/bids-action.test.ts`.

What the database holds, and what it does not. "One SetupIntent, one bid" is the database's since
migration `0063`: a partial unique index on `bids.stripe_setup_intent_id`, so two requests carrying
the same SetupIntent cannot both land, whatever the action read first (`auctions_test.sql`, two
assertions). `place_bid` still accepts a null card, because Postgres cannot see whether Stripe is
configured; that half of the rule is the action's.

### A hold on an option costs something to ask for

**Held** as of migration `0064`, for checkout.

`/api/checkout` holds a fixed-price option for whoever posts to it: a name, an email address, no
account and no card. That is the right rule for one buyer and, until 0064, the whole rule: nothing
counted the requests, because the handler runs where memory does not survive from one request to
the next. A script could hold every option on the site and hold each again as it lapsed, and the
hold lasted forty-five minutes against a session that died at thirty-five.

The counting is now the database's, in `checkout_attempts` and `begin_lot_purchase_limited`, which
records the attempt, applies four limits under an advisory lock per address and per email (ten
attempts from one address in ten minutes, thirty on one option, three open holds from one
address, two for one email), and only then calls `begin_lot_purchase`, which is untouched and is
still the one place a hold is decided. A refusal is a word, never an exception, so the refused
attempt stays counted. The route asks a honeypot before it reads anything, says one sentence for
all four limits, and asks Stripe for a session that ends when the hold does: thirty-one minutes,
released by `checkout.session.expired` through the existing webhook path, with the database's own
clearing two minutes behind it for a payment made in the session's last seconds. Proved by
`supabase/tests/checkout_holds_test.sql` and `tests/checkout-route.test.ts`.

What it does not do. `/api/bids/setup` has the honeypot and no counting; a bid stores a card and
holds nothing, so the cost of a flood there is patron rows and SetupIntents, not a locked board.
`patronFor` still writes a patron row before the limiter is asked, on both routes. Both are Phase 6.

### A declined mark receives the refund promised by the product

**Held**, since migration 0031.

`refundDue` (`src/lib/refunds.ts`) returns the unreleased part of the charge plus the fee that rode
on it, and that arithmetic is tested (`tests/refunds.test.ts`). It could only ever give back what
had not been sent, and until 0031 nothing stopped a weekly slice from being sent while the logo was
still undecided: slices fall on the fundraiser's own Fridays, so a sponsorship bought during a live
fundraiser could be paid out on Friday and declined on Saturday. The patron was told "in full" on
`/terms` and in two emails, and would have got less.

A sponsorship's slice now waits for the musician's yes, asked in `slicePlan`
(`src/lib/release.ts`, covered by `tests/release.test.ts`) and asked again by a trigger underneath
it, so the rule holds for any caller that writes to `payout_schedule` rather than only for the one
query that remembers to filter (`supabase/tests/permissions_test.sql`, seven assertions). A backing
carries no logo and is unaffected: the calendar alone releases it, which is decision 2, option A.

What this creates instead is a sponsorship whose logo never arrives, whose money then waits with
nothing to move it. Nobody is short-changed in that state and it is counted in three places rather
than silent, but it does not resolve on its own. See `docs/DECISIONS.md`, decision 16.

### A payout cannot exceed the available act share

**Partly held.** Enforced by Phase 4.

The schedule is built from amount minus fee, so the arithmetic cannot overpay
(`weeklySlices`, tested in `tests/money.test.ts`), and since 0031 a sponsorship's slice cannot be
marked paid at all before the logo is approved. Since 0033 a refund cannot exceed the charge it is
against, or shrink. What is still missing is the payout side of the same constraint: no database
rule prevents a `payout_schedule` row from being written or edited to more than the act's share,
and there is no ledger to check the total against.

### Every Stripe object maps to an internal financial record

**Violated.** Enforced by Phase 4.

There is no reconciliation between Stripe and the database. A charge, refund, transfer or reversal
that exists at Stripe and not here, or here and not at Stripe, goes unnoticed.

### Financial totals must be derivable from an immutable ledger

**Violated.** Enforced by Phase 4.

There is no ledger. Totals are computed from mutable rows on `purchases`, `backings` and
`payout_schedule`, and revenue is read from configured lot prices rather than from what was actually
charged.

### A payment only moves the way money moves

**Held**, since migration 0033.

`purchases.payment_status` and `backings.payment_status` carried the state of everybody's money
from 0001 with nothing behind them but the WHERE clause of whichever query wrote next. The
application was careful (fulfilment conditional on `requires_payment`, the payout job on `held`,
`refundRow` checking before it writes) and careful is not enforced: each of those is one forgotten
`.eq()` from being absent. Nothing refused a refunded purchase moving back to held, a released one
back to requires_payment, or a refund unwinding to zero.

A trigger on both tables now allows only what the system performs: `requires_payment` to `held` to
`released`, and out to `refunded` or `partially_refunded`, with a hand-made refund after the fact
allowed from `released` because Door Money pays that one out of its own pocket. Every other move,
and every way back, is refused. A status that does not change is always allowed, so a duplicate
webhook stays harmless. `purchases.mark_status` has the same treatment, which is what 0031's hold
rests on: a logo goes none, submitted, then approved or declined, and no further.

---

## Webhooks and durability

### Every webhook is idempotent and retryable

**Held** as of migration `0039`.

The event id is still the dedupe, but the row now carries a status, an attempt count, the error, a
retry time and the payload, and `src/lib/stripeEvents.ts` is what writes them. A handler that
throws and one that returns `{ ok: false }` both mark the row retryable and answer 500. A crash
after the claim leaves the row in `processing`, which the worker takes back after fifteen minutes.
Every handler underneath was already conditional on the state it expects, which is what makes the
retry safe.

The gap that mattered most was not in the list above: **any** failed insert was read as a
duplicate. A statement timeout answered Stripe 200, and Stripe never sends a delivered event again,
so the event was lost. Only error `23505` is a duplicate now. Proved by
`tests/stripeEvents.test.ts` and `supabase/tests/webhook_events_test.sql`.

### A webhook is not complete until its business operation completes

**Held** as of migration `0039`. Same cause as above, and the same fix: the route answers 200 only
when the handler finished or an earlier delivery finished it. A refusal, a throw, and a row that
could not be written all answer 500 and leave a row saying what happened. An event this system
deliberately does not act on settles as `ignored`, so "there was nothing to do" and "nobody looked"
are no longer the same row.

### Refunds and cancellations survive a failure

**Held**, since migration 0032.

`cancelRun` (`src/lib/refunds.ts`) used to walk purchases and backings in an in-memory loop,
refunding each as it went and collecting failures into an `errors` array. The count reached the
musician and nothing else outlived the request: a process that died halfway left no record anywhere
that the remaining refunds were owed, and a failure was never tried again.

`cancelRun` now writes every obligation to `financial_operations` before Stripe is called, and
`decideMark` does the same for a declined logo. A row carries its own idempotency key, which is the
key the Stripe call uses, so the same obligation cannot be written or paid twice.
`src/lib/outbox.ts` works the queue: the two places an obligation is born attempt it immediately,
and the daily job retries what failed on a widening schedule and stops after six attempts rather
than forever. The patron is written to from one place, by whichever attempt lands, so a refund that
succeeds on Thursday still sends the mail and cannot send it twice.

Three ways it can still be lost are each closed rather than assumed away. A worker that dies
holding a row is reclaimed after fifteen minutes (the claim is what sets `updated_at`, and a caller
cannot backdate it). A crash between marking a fundraiser cancelled and queueing its refunds is
caught by a sweep that asks which patron is still holding money on a cancelled fundraiser rather
than trusting the request to have finished, and the same sweep covers a declined logo. A row out of
attempts is `failed` rather than gone, counted on `/admin` with its last error and the payment it
belongs to.

Not covered here, and still Phase 4: there is no ledger to reconcile any of this against, so a
refund Stripe has and this table does not still goes unnoticed.

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

### A lot with a bid on it keeps its terms

**Held** as of migration `0035`, via the `lots_terms_frozen` trigger. Price, mode, take-it-now and
placement cannot change once a bid or a purchase exists on the lot; the label still can. Proved by
`supabase/tests/auctions_test.sql`. A bid is a promise to pay a price against a set of terms, and the
terms moving under it would make the promise mean something else.

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

**Held** as of remediation Phase 3. `src/app/[slug]/[run]/page.tsx` reads the board and renders
it; it imports nothing from `src/lib/auctions.ts` and holds no service-role client. Settlement is the
worker at `/api/cron/auctions` (idempotent, one lot per transaction), called on a schedule by the
database (migration `0036`) and daily by `/api/cron/daily`.
