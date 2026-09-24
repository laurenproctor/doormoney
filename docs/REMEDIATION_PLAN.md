# Remediation plan

Door Money works, but it mediates money, identity and reputation, and it is not yet safe to hold
real customer money. This plan takes it from a functional prototype to a system that can. Correctness
comes before feature velocity for the length of it.

Each phase is one reviewable pull request. The phases do not get combined into one large refactor,
and a phase does not start until the one before it passes its gate.

Read `docs/SYSTEM_INVARIANTS.md` beside this. It states the rules the system has to keep and marks,
honestly, which ones the code does not keep yet.

## Ground rules for every phase

- Supabase migrations are append only. An applied migration never gets rewritten.
- No migration is applied to the hosted project without explicit approval.
- No production environment variables change.
- Stripe test mode only. No live charges, refunds, transfers, disputes or customer records.
- The service-role key never reaches the browser.
- Database transactions stay short, and never contain a Stripe, email or other network call.
- If a step needs credentials, production access or an irreversible decision, stop and report it.

## Architectural principles

- PostgreSQL enforces financial and ownership invariants.
- Server actions are not the only security boundary.
- RLS policies, grants, column privileges, views and RPC permissions are explicit.
- Money operations are durable, idempotent, retryable and reconcilable.
- A webhook is not complete until its business operation completes.
- Public identity and login identity have separate lifecycles.
- Page rendering does not start global financial or auction mutations.
- Product promises agree with actual system behavior.
- Every critical state transition has an automated test.

---

## Phase 0: reproducible foundation and CI

**Status: done.** Branch `remediation-phase-0`, cut from `d5b6e4e`.

A dependable engineering baseline, before anything touches permissions, auctions or money.

- Declared the Node and npm versions (`engines`, `packageManager`, `.nvmrc`) and regenerated the
  lockfile with the declared package manager.
- Added `lint`, `typecheck`, `test`, `build` and `verify` scripts. `typecheck` runs `next typegen`
  first, because the generated route and layout types do not exist in a fresh checkout and `tsc`
  fails without them.
- Added a unit-test foundation on `node --test`, with no new dependency. Covers the fee split,
  `refundDue`, weekly payout slices, auction minimum bids, and slug and username rules.
- Replaced five terse side-effect expressions in `src/lib/auctions.ts` with plain statements, which
  clears the last lint warnings. No rule was suppressed.
- Added `.github/workflows/verify.yml`: clean checkout, `npm ci`, lint, types, tests, production
  build. It takes no secrets and cannot reach a live service.
- Wrote `docs/SYSTEM_INVARIANTS.md` and this document.

The tests record what the code does today, including behavior that later phases change on purpose.
That is deliberate: a test that fails when Phase 2 or Phase 3 lands is the point, not a defect.

**Gate.** A fresh `npm ci` succeeds, lint is clean, types check on a clean checkout, unit tests pass,
the production build passes, and no application behavior, payment behavior or schema changed.

### Two corrections to the original plan, found while doing the work

1. **`npm ci` did not fail.** The audit said a clean `npm ci --ignore-scripts` fails on an
   out-of-sync lockfile. On a clean checkout of `d5b6e4e` it succeeds. The lockfile *was* incomplete:
   regenerating it added four transitive entries nested under `@tailwindcss/oxide-wasm32-wasi`, the
   WebAssembly fallback for Tailwind's native module. Those never install on macOS arm64 or on
   GitHub's Linux runners, which is why nothing failed. The lockfile is now complete, but the
   original symptom was not reproducible.
2. **Migration numbering has moved.** Phase 1 was written to add migrations "starting after 0019".
   Work landed since the audit has taken the tree to `0021_account_roles.sql`. Phase 1 must start
   after the highest migration present when it begins, not after 0019.

---

## Phase 1: Supabase security boundary

**Status: applied to the hosted project, and extended once since.** Branch
`remediation-phase-1`, migration `0022_security_boundary.sql`. See `docs/PHASE_1_DEPLOYMENT.md` for
the apply and token-rotation checklist.

`0029_patron_profile_boundary.sql` finished the job. 0022 covered the tables that existed when it
was written; everything added after it (0024's patron profiles) and everything it had not reached
(`backings`, `payout_schedule`, `stripe_events`, `waitlist`, `contact_messages`, `newsletter`) was
left defended by row level security alone. RLS held in every case, so nothing leaked, but one layer
where the rest of the app has two is how the last hole got in. 0029 also closed a real one:
`patron_profile_items` checked that a row belonged to the account and never that the placement it
pointed at did, so anyone signed in who knew a purchase id could publish somebody else's
sponsorship under their own name. `owns_patron_activity` now asks the question the server action
was already asking, and the suite has 60 assertions rather than 37.

**The lesson, worth stating because it will recur:** a boundary migration is a snapshot. Every new
table needs its grants decided when it is created, not in a later sweep. A table with no policy for
`anon` or `authenticated` still answers the Data API with `200 []` until its grant is revoked.

Four holes were reproduced against a local stack before anything was written, and all four are now
closed and covered by `supabase/tests/permissions_test.sql` (34 assertions, all passing):

1. `anon` could read every act's Connect account id and payout flag.
2. `anon` could read every lot's funding token.
3. `anon` could name any anonymous bidder by joining `bids.patron_id` to the `patron_names` view.
4. An authenticated musician could rewrite their own `stripe_account_id`, enable payouts and grant
   themselves `founding`, straight through the Data API.

Two things learned in the doing, both written up in `docs/PHASE_1_DEPLOYMENT.md`:

- A column-level `revoke` is a no-op while a table-level `grant select` stands. The first draft of
  the migration looked right and changed nothing; the tests caught it.
- Revoking `execute` on a `security definer` function that an RLS policy calls segfaults the backend
  rather than denying the query. `0022` grants execute on `owns_run` and `owns_lot` for that reason.

Still open from the original Phase 1 list, and deliberately not attempted here: moving the Stripe
columns into a separate private table (the column grants achieve the same boundary with less schema
churn), a full storage-policy review, and the `security definer` view audit beyond the three known
views. `lot_buyers`, `patron_names` and `run_backers` are all `security_invoker = false` by design,
so they can read locked base tables; only `patron_names` was over-exposed.

Make the database and Data API safe when a caller ignores the UI and the server actions entirely.

- Inventory every table, view, function, policy, table grant, column grant and storage policy, and
  every Supabase query in the application, before changing any privilege.
- Add one append-only migration numbered after the highest one then present.
- Revoke unintended access from `anon`, `authenticated` and `PUBLIC`.
- Replace the broad owner `FOR ALL` policies on `acts` and `profiles` with operation-specific
  policies and column privileges.
- Stop an authenticated musician from directly changing Stripe account ids, payout-enabled state,
  founding or administrative flags, run financial state, lot winner, sale, funding and lifecycle
  state, funding tokens, and purchase, refund or payout state.
- Move sensitive operational fields into private tables, or otherwise off the public Data API.
  `lots.funding_token` and `acts.stripe_account_id` are both publicly readable today.
- Replace unsafe public base-table reads with deliberately limited views or RPCs.
- Make sure anonymous bids cannot be joined back to patron identities, including through the
  `patron_id` currently exposed on every public bid row.
- Review every `security definer` function: controlled search path, private functions in a
  non-exposed schema, revoke default `PUBLIC EXECUTE`, grant only to intended roles.
- Enforce one act per account in the database.
- Add the missing ownership and value constraints.
- Add SQL or pgTAP tests proving what is allowed and what is denied for anonymous visitors,
  authenticated musicians, other musicians, and the service role.
- Update application queries **before** privileges are revoked, so the site keeps working.
- Produce a token-rotation and deployment checklist.

**Gate.** The migration passes locally and the permission tests show that public and authenticated
callers can neither read nor mutate protected data.

---

## Phase 2: durable money lifecycle

**Status: done**, apart from the reconciliation plan, which belongs to Phase 4 and is listed there.
Three migrations: `0031_payout_needs_approved_mark.sql` (the payout gate),
`0032_financial_operations.sql` (the refund outbox) and `0033_payment_state_machine.sql` (the
transitions).

Make purchases, marks, refunds, cancellations, payouts and failures explicit and recoverable.

**Product decision.** For placement purchases, no money is released to an act before the patron's
mark is approved. Fan backings without a mark follow their own documented rule.

- [x] Gate placement payouts on mark approval. `slicePlan` in `src/lib/release.ts` is the rule the
  Friday job asks, and migration 0031 is a trigger asking the same thing under it, because a query
  is not a boundary. A backing has no logo and stays on the calendar. Waiting is not skipping: a
  held slice keeps its scheduled status and its due date, so the first Friday after the yes pays
  every Friday that went by without one.
- [x] Make a declined mark produce the full refund the product promises. Nothing left to fix in
  `refundDue`: it was always correct about the money not yet sent, and 0031 is what makes "not yet
  sent" mean all of it.

  One thing the gate creates, and does not answer: a sponsorship whose logo never arrives holds its
  money with no Friday that will ever move it. Counted in the payout summary, totalled on `/admin`
  and said out loud on the musician's dashboard, but not resolved. `docs/DECISIONS.md`, decision 16
  has the candidates and says why none of them is a safe default to pick in code.
- [x] Keep a run cancellation from becoming final until every financial obligation is durably queued.
  Taken the other way round, deliberately: the fundraiser is marked cancelled first, so nothing new
  can be sold into one that is coming down, and `sweepOwed` closes the window from the far end by
  asking which patron is still holding money on a cancelled fundraiser. Trusting the request that
  cancelled it to have finished is the assumption that caused this.
- [x] Add durable financial-operation (outbox) records for refunds, transfers, transfer reversals,
  cancellation refunds and mark-decline refunds, each pending, processing, succeeded, retryable or
  terminally failed, with stable idempotency keys. Refunds only, and that is the whole gap:
  transfers already had an outbox in `payout_schedule`, which is a durable row per slice with a
  status and a stable key. Transfer reversals arrive with disputes in Phase 4 and have nothing to
  queue yet.
- [x] Never let an in-memory loop be the only record of a refund that is owed.
- [x] Add retry workers and staff-visible failure states, and make partial failures resumable. The
  daily job retries on a widening schedule and stops after six attempts, about a day and a half; a
  worker that dies holding a row is reclaimed after fifteen minutes; `/admin` carries what is owed,
  what it last failed with and what has stopped.
- [x] Test every valid and invalid transition, duplicate execution, and failure between the Stripe
  call and the database write. The last of those was already safe and stayed that way: the Stripe
  idempotency key means a retry after a crash between the refund and the write returns the same
  refund rather than making a second one.
- [x] Define the purchase and backing state machine, and validate every transition in PostgreSQL.
  Migration 0033. `payment_status` moves requires_payment to held to released, and out to refunded
  or partially_refunded; every other move, and every way back, is refused by a trigger on both
  tables. `refunded_cents` cannot shrink (the webhook writes Stripe's running total, so a late
  older event would otherwise walk it backwards) and cannot exceed the charge. `mark_status` is
  answered once: none to submitted to approved or declined, and no further, which is what 0031's
  hold on a sponsorship's payouts rests on and what nothing enforced before.

  Writing it found one thing: `permissions_test.sql` had been driving a logo straight from none to
  declined to set up the 0031 fixtures, which is not a move the application can make. The rules
  refused the test, and the fixture was what was wrong.
- [ ] Plan the reconciliation of existing purchases and payout rows.

**Gate.** No payout happens before its release condition, and every failed refund or cancellation
obligation stays visible and retryable. Both halves are met and tested, and the state a payment is
in is now enforced by PostgreSQL rather than by the WHERE clause of whichever query writes next.
`supabase/tests/permissions_test.sql` covers the phase in 29 assertions, up from 70 to 99.

---

## Phase 3: transactional auctions

**Status: done, applied to the hosted project 2026-09-18** (PR #22). The five-minute worker is
running. Three migrations: `0034_stale_offer_refund_reason.sql` (one enum
value, on its own because Postgres will not use it in the transaction that adds it),
`0035_transactional_auctions.sql` (the functions, the guards, the offer version) and
`0036_auction_worker_schedule.sql` (the database calling the worker). `docs/PHASE_3_DEPLOYMENT.md`
has the apply order and the record of how it went.

Make bidding, closing, funding, rollover and checkout safe under concurrency.

- [x] Replace read-then-insert bid placement with a transactional RPC that locks the lot row, computes
  the minimum, and inserts, all in one transaction. `place_bid`. A trigger on `bids` asks the same
  questions under the same lock of any insert that comes another way, and a second trigger keeps a
  bid's amount, lot and patron from changing afterwards.
- [x] Reject bids after the authoritative close time. In the function and in the trigger, against the
  lot's own `closes_at` or the run's `bidding_closes_at`, at the database's clock.
- [x] Make winner selection and rollover transactional. `close_auction` and `roll_offer`, one lot per
  call, each under the row lock. Treat `requires_payment` as an active funding attempt: a purchase
  still inside its `expires_at` holds a roll back ("waiting"); one past it is cleared and its Stripe
  session named for expiry.
- [x] Bind a checkout session to the lot, the winner, the funding token or version, the authoritative
  price and an offer expiry, and revalidate all of it during webhook fulfilment before marking a lot
  sold. Every offer bumps `lots.offer_version`; a purchase records `bid_id` and `offer_version`; the
  guard on `purchases` refuses a row that does not pay for the current offer at the bid's amount, and
  `fulfil_lot_purchase` re-checks it under the lock. A stale payment is held (the charge is real)
  and refunded through the queue under the new reason; the lot stays with its current winner.
- [x] Expire stale checkout sessions when an offer rolls over. `roll_offer` returns the session ids it
  cleared and the worker expires them at Stripe, best effort.
- [x] Freeze commercial terms once the first bid lands, and refuse deletion of lots with bids or
  financial records. Price, mode, take-it-now and placement freeze on the first bid or purchase;
  deletion was already refused by 0022. The dashboard says which spot and why.
- [x] Take global auction settlement out of board-page rendering. Rendering becomes read-only and
  settlement moves to an isolated idempotent worker. `/api/cron/auctions`, called every five minutes
  by pg_cron through pg_net (0036, guarded so CI's plain Postgres installs nothing) and daily by the
  existing job. The page no longer imports anything that writes.
- [x] Test simultaneous bids, bids at closing time, winner rollover, completion of an old checkout,
  duplicate fulfilment, and buy-now while bids exist. `supabase/tests/auctions_test.sql` (81
  assertions) covers everything one session can; `supabase/tests/concurrency_test.sh` races two
  psql sessions for the rest: two bids at the same minimum, two closes, a bid in flight as the
  close arrives, and a fulfilment in flight as a roll arrives. Both run from `npm run
  test:db:docker` and in CI.

Found while doing it: an abandoned take-it-now checkout used to hand the lot to the current top
bidder before the auction had closed, because the roll saw a lapsed `pending_funding` with no winner
and picked "the next bid". A lapsed hold now reopens the lot ("reopened") and the close decides.

**Gate.** Two concurrent requests never produce two authoritative winners and never fulfil a stale
offer. Met: the concurrency script shows one winner from two closes and one bid from two at the same
minimum, and the pgTAP suite shows a stale offer held and not sold, twice.

---

## Phase 4: Stripe ledger, disputes and reconciliation

Give Door Money an authoritative financial history and a way to recover.

**Status: two of four pieces are built and applied; the ledger is written by every money path
since 2026-09-24 (migrations 0055 and 0065).** Piece 1 (webhook event states) merged 2026-09-19 and
piece 2 (the ledger) in two steps: the schema, 0055, on 2026-09-22 and the writer with 0065 on
2026-09-24. Disputes and reconciliation are untouched.
`docs/PHASE_4_INVENTORY.md` is the reading done beforehand: what exists, what is missing item by
item, five things this list leaves out, and the decisions that have to be made before the dispute
work can be written. That document proposes splitting this phase into four pieces, because it is
larger than the three before it and its halves do not depend on each other. The first piece is
webhook-event states and the worker that retries them: no new money behavior, and everything after
it needs somewhere to record a failure.

- [x] Add an immutable ledger covering patron charges, Door Money fees, act liabilities, transfers,
  refunds, transfer reversals, disputes, dispute fees, recoveries and adjustments. Entries balance.
  Migration `0055` is the table: append only by grant and by trigger, a deferred constraint that
  refuses an unbalanced event, and a unique index per (payment, event, account) that is the
  idempotency key. `src/lib/ledger.ts` is the writer, called from the four paths that move money:
  the charge and Stripe's own fee when a purchase or backing is held, the transfer and the fee it
  earns on every Friday slice (and from `transfer.created` when the job died before writing it), and
  the refund whether `refundRow` sent it or a person did in the Dashboard. Door Money earns its fee
  as the money releases, which is `refundDue`'s arithmetic read the other way; a hand refund beyond
  what was held is a receivable from the organizer (`organizer_receivable`, `0065`). `/admin` reads
  revenue from `ledger_balances` and nothing else. Reversals, disputes, dispute fees and
  recoveries are piece 3's entries, and `held_unresolved` waits on decision 16.
- [x] Redesign webhook-event storage to distinguish received, processing, processed, and failed and
  retryable. A webhook that returns `ok: false` is not processed. Migration `0039` gives
  `stripe_events` six states, an attempt count, the error, a retry time and the payload;
  `src/lib/stripeEvents.ts` holds the handler and the worker, reusing `outbox.ts`'s backoff rather
  than restating it; the daily job works the queue and `/admin` shows what has not finished.

  The bug underneath was worse than the item says. The route read **any** failed insert as a
  duplicate and answered 200, so a statement timeout discarded the event: Stripe takes a 200 as
  delivered and never sends it again. Now only a duplicate key is a duplicate, and everything else
  asks for the event back.
- Handle Stripe dispute events, and transfer reversals, with an explicit platform recovery policy.
- Reconcile Stripe against the database daily, detecting missing charges, transfers, refunds,
  reversals and ledger entries.
- Add a dead-letter queue, actionable staff alerts, and admin visibility into unresolved financial
  operations.
- [x] Calculate revenue from actual charges and ledger entries, not from configured lot prices.
  `/admin`'s "earned" tile and its Books card are `ledger_balances`; the runs table's money column
  is what each run's purchases were charged, refunds off. The musician dashboard's "worth" went
  with the 2026-09-22 dashboard rework.
- Replay tests using Stripe fixtures or the Stripe CLI in test mode.

**Gate.** For every cent Stripe reports, Door Money can explain its source, current owner, state and
destination.

---

## Phase 5: separate login identity from public identity

Keep credentials, branding and public URLs from fusing into one fragile object.

`profiles.username` stays an optional login username. `acts.slug` is the public board address. They
may start equal, but they are not required to stay equal.

- Remove the assumption that `profiles.username` equals `acts.slug`.
- Replace cross-table collision triggers with a canonical constraint per namespace.
- Make username and slug changes atomic, keep board-slug history, and permanently redirect old slugs.
- Block direct profile email changes through PostgREST, and leave email to Supabase Auth.
- Resolve username login against the authoritative Auth user safely.
- Enforce reserved names in PostgreSQL, not only in TypeScript.
- Return neutral signup responses that do not reveal whether an email is registered.
- Rate limit and add CAPTCHA to signup, sign-in, magic-link and reset flows.
- Require reauthentication for sensitive account changes, and MFA for staff accounts.
- Test migration and compatibility for existing users and acts.

**Gate.** Changing a public board address does not change how a musician signs in, and changing
credentials does not break published board links.

---

## Phase 6: production and abuse hardening

- Durable rate limits on checkout, bidding, contact, newsletter, auth and expensive public actions,
  plus bot protection where it fits. Checkout's is done ahead of the phase (migration 0065, the
  `checkout_attempts` table and `begin_lot_purchase_limited`), because an unlimited hold was a way
  to stop every sale; see `docs/SYSTEM_INVARIANTS.md`, "A hold on an option costs something to ask
  for". Bidding, contact, newsletter and auth are still open.
- Validate required production environment variables at startup, and remove fallbacks that let the
  app quietly run in mock mode.
- Structured logging, error monitoring, financial alerts and request correlation ids.
- Backup, restore and incident-response documentation.
- Stronger CSP and security headers.
- Validate uploaded file contents instead of trusting client MIME types, re-encode images where
  practical, and keep draft media private until publication.
- Replace `ADMIN_EMAILS` as the whole authorization model with explicit staff roles and audit logs.
- Paginate administrative and unbounded queries, remove the major N+1 patterns, and add the missing
  foreign-key indexes and monetary constraints.

---

## Phase 7: product, legal, email and documentation alignment

- Make refund, mark, cancellation and dispute copy match what the system actually does.
- Versioned terms acceptance with timestamps, recorded at checkout where that is appropriate.
- Operational FTC material-connection disclosures for paid placements and the posts that follow.
- Route final terms, privacy, refund, auction and disclosure language through qualified counsel.
- Replace the state-changing unsubscribe GET with a scanner-safe flow, and add `List-Unsubscribe`.
- Durable idempotency against duplicate newsletter sends, and never record a reminder or announcement
  as sent when delivery failed. The total failure is already closed, ahead of this phase, because it
  was seen live on 2026-09-11: a new-fundraisers pass that reaches nobody marks nothing announced
  and does not start the week's clock (`src/lib/weekly.ts`, `tests/weekly.test.ts`). What is left
  here is the partial failure, which needs a per-address send log, and the mark reminders.
- Fix the HTML email footer escaping problem.
- Implement the retention and deletion commitments the privacy policy makes.
- Update the README to describe every migration and the real setup, and the roadmap to reflect
  password authentication.
- Document deployment, rollback, migration, refund, dispute and reconciliation procedures.
- Remove unused large assets and optimise public images, after the correctness work is done.
