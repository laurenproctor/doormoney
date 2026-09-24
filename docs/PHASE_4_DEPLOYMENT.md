# Phase 4: deployment checklist

Phase 4 is being built in four pieces, as `docs/PHASE_4_INVENTORY.md` proposes. This document grows
a section per piece. Piece 1 (0039) and the first half of piece 2 (0055) are applied to the hosted
project. Piece 2's second half (0064) is below.

## Piece 1: webhook event states and the retry worker

One migration, `0039_webhook_event_states.sql`. It adds columns to `stripe_events`, backfills the
rows already there, and adds an index, a check constraint and a touch trigger. It creates no table
and no view, so nothing new reaches the Data API.

### Order

The migration is additive and the code needs it: the route and the worker both write the new
columns. So the migration goes first and the code follows.

The old code keeps working against the new schema in between. It inserts id and type only, which
the defaults cover, and it deletes the row on a handler failure, which the new columns do not
prevent. What it will not do in that window is record anything, which is the state everything has
been in until now.

1. **Check the ledger and apply.**

   ```
   supabase migration list          # expect 0001 to 0038 aligned, 0039 local only
   supabase db push                 # from a terminal, never from a Claude session
   ```

2. **Look at what the backfill touched.** Every existing row is marked processed and settled at the
   time it arrived, because the old route had no way to record anything else and answered Stripe
   200 for all of them. Before applying, this says how many that is:

   ```sql
   select count(*) from stripe_events;
   ```

   On the hosted project as of the 2026-09-17 audit, no real money had ever moved, so these are
   test-mode events from the rehearsals. Nothing is replayed by the backfill.

3. **Merge and deploy the code.**

4. **Watch the first delivery.** Anything Stripe sends should land as a row that settles:

   ```sql
   select id, type, status, attempts, last_error, received_at
   from stripe_events order by received_at desc limit 10;
   ```

   `processed` means the handler acted. `ignored` means there was nothing to do, which is most of
   the nine subscribed types this system does not handle. `retryable` and `failed` are the ones to
   read, and they also appear on `/admin`.

### Rollback

Reverting the code alone is safe: the columns are additive and the old route ignores them. Dropping
the migration means dropping the trigger, the index, the constraints, the columns and the type, in
that order, and nothing else reads them.

### What this piece does not do

- It does not pin the webhook endpoint's API version. Events still arrive in the account default
  shape (2014-03-13) and the row records which version it was, so a later replay can tell. Pinning
  is a Stripe Dashboard action and it is Lauren's.
- It does not handle any new event type. The nine handled are the nine that were handled before;
  the other nine now settle as `ignored` rather than passing for processed work.
- It does not add the ledger, disputes or reconciliation. Those are pieces 2, 3 and 4, and piece 3
  waits on the decisions in `docs/PHASE_4_INVENTORY.md`.

## Piece 2: the ledger, written by the paths that move money

Two migrations, applied on different days. `0055_ledger.sql` (2026-09-22) is the table, the chart of
accounts, the balance trigger and the sample data's opening entries; it was applied with the offer
terms migrations and is frozen. `0064_ledger_balances.sql` is what the writer ships with: one more
account (`organizer_receivable`), and two read-only views, `ledger_balances` and
`ledger_payment_balances`, both granted to `service_role` only, with every write privilege revoked.
It creates no table, changes no grant on any existing table, and nothing in it changes when or
whether a cent moves.

### Order

Additive, and the code needs it: `/admin` reads `ledger_balances` and a hand refund beyond what was
held posts to `organizer_receivable`. So the migration goes first and the code follows. In between,
the deployed code writes nothing to the ledger and reads neither view, and `/admin` after the code
deploy says "Apply migration 0064" in its Books card rather than failing, if the order slips.

1. **Check the ledger and apply.**

   ```
   supabase migration list          # expect 0001 to 0063 aligned, 0064 local only
   supabase db push                 # from a terminal, never from a Claude session
   ```

2. **Look at the books before any real money.** On the hosted project every payment is sample
   data, so both views should say so:

   ```sql
   select account_key, balance_cents, entry_count from ledger_balances order by account_key;
   -- every balance 0 and every count 0: the sample rows are is_seed and are left out
   select count(*) from ledger_payment_balances where not is_seed;   -- 0
   select * from ledger_imbalances;                                    -- none
   ```

3. **Merge and deploy the code.**

4. **Watch the first real charge.** A test-mode purchase or backing should land as five entries
   under two events, and the books by payment should show the charge and the fee:

   ```sql
   select event_key, account_key, amount_cents, stripe_object_id, occurred_at
     from ledger_entries where not is_seed order by occurred_at, event_key;
   -- charge: platform_cash +amount, organizer_liability -(amount - fee), unearned_fee -fee
   -- stripe_fee: stripe_fee +Stripe's fee, platform_cash -the same
   ```

   Then a Friday: each paid slice adds `transfer_<payout id>` (liability down, cash down) and
   `release_<payout id>` (unearned fee down, revenue up). `/admin`'s "earned" tile moves with the
   second of those and with nothing else.

### What to read if the books disagree with the tables

The tables stay authoritative; the ledger mirrors them. Three shapes of disagreement, and what each
one means:

- **A payment with a non-zero `organizer_liability` after it was refunded in full.** A transfer the
  ledger never heard about: the job sent it, could not write the entry, and the `transfer.created`
  webhook found the row already marked. The payout summary email named it on the day. Piece 4's
  reconciliation is what finds these from Stripe's side.
- **A balance in `organizer_receivable`.** Somebody refunded more than Door Money still held, in the
  Dashboard. The organizer has that money. Decision 18 says it is withheld from later slices or
  absorbed, by a person.
- **A row in `ledger_imbalances`.** Should not be possible: the constraint refuses one at write time.
  If one appears, the trigger was dropped or bypassed, and that is the finding.

### Rollback

Reverting the code alone is safe: nothing else reads the entries, and the tables keep saying what
they said. Dropping the migration means dropping the two views and the account row, in that order;
entries posted to `organizer_receivable` would have to go first, and the trigger refuses deleting
them, which is the point. Leave the views and revert the code instead.

### What this piece does not do

- It does not record a transfer reversal, a dispute, a dispute fee or a recovery. Those are piece 3,
  and they arrive as accounts (rows) and events, not as changes to what is here.
- It does not compare the books to Stripe. Piece 4.
- It does not reclassify anything into `held_unresolved`. Decision 16 is open.
- It does not write an entry for a sample payment beyond its opening balance, and every sum a person
  reads leaves the sample data out.
