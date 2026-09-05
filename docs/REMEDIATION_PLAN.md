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

**Status: built and tested locally, not applied to the hosted project.** Branch
`remediation-phase-1`, migration `0022_security_boundary.sql`. See `docs/PHASE_1_DEPLOYMENT.md` for
the apply and token-rotation checklist.

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

Make purchases, marks, refunds, cancellations, payouts and failures explicit and recoverable.

**Product decision.** For placement purchases, no money is released to an act before the patron's
mark is approved. Fan backings without a mark follow their own documented rule.

- Define the purchase and backing state machine, and validate every transition in PostgreSQL.
- Gate placement payouts on mark approval.
- Make a declined mark produce the full refund the product promises.
- Keep a run cancellation from becoming final until every financial obligation is durably queued.
- Add durable financial-operation (outbox) records for refunds, transfers, transfer reversals,
  cancellation refunds and mark-decline refunds, each pending, processing, succeeded, retryable or
  terminally failed, with stable idempotency keys.
- Never let an in-memory loop be the only record of a refund that is owed.
- Add retry workers and staff-visible failure states, and make partial failures resumable.
- Test every valid and invalid transition, duplicate execution, and failure between the Stripe call
  and the database write.
- Plan the reconciliation of existing purchases and payout rows.

**Gate.** No payout happens before its release condition, and every failed refund or cancellation
obligation stays visible and retryable.

---

## Phase 3: transactional auctions

Make bidding, closing, funding, rollover and checkout safe under concurrency.

- Replace read-then-insert bid placement with a transactional RPC that locks the lot row, computes
  the minimum, and inserts, all in one transaction.
- Reject bids after the authoritative close time.
- Make winner selection and rollover transactional. Treat `requires_payment` as an active funding
  attempt.
- Bind a checkout session to the lot, the winner, the funding token or version, the authoritative
  price and an offer expiry, and revalidate all of it during webhook fulfilment before marking a lot
  sold.
- Expire stale checkout sessions when an offer rolls over.
- Freeze commercial terms once the first bid lands, and refuse deletion of lots with bids or
  financial records.
- Take global auction settlement out of board-page rendering. Rendering becomes read-only and
  settlement moves to an isolated idempotent worker.
- Test simultaneous bids, bids at closing time, winner rollover, completion of an old checkout,
  duplicate fulfilment, and buy-now while bids exist.

**Gate.** Two concurrent requests never produce two authoritative winners and never fulfil a stale
offer.

---

## Phase 4: Stripe ledger, disputes and reconciliation

Give Door Money an authoritative financial history and a way to recover.

- Add an immutable ledger covering patron charges, Door Money fees, act liabilities, transfers,
  refunds, transfer reversals, disputes, dispute fees, recoveries and adjustments. Entries balance.
- Redesign webhook-event storage to distinguish received, processing, processed, and failed and
  retryable. A webhook that returns `ok: false` is not processed.
- Handle Stripe dispute events, and transfer reversals, with an explicit platform recovery policy.
- Reconcile Stripe against the database daily, detecting missing charges, transfers, refunds,
  reversals and ledger entries.
- Add a dead-letter queue, actionable staff alerts, and admin visibility into unresolved financial
  operations.
- Calculate revenue from actual charges and ledger entries, not from configured lot prices.
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
  plus bot protection where it fits.
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
  as sent when delivery failed.
- Fix the HTML email footer escaping problem.
- Implement the retention and deletion commitments the privacy policy makes.
- Update the README to describe every migration and the real setup, and the roadmap to reflect
  password authentication.
- Document deployment, rollback, migration, refund, dispute and reconciliation procedures.
- Remove unused large assets and optimise public images, after the correctness work is done.
