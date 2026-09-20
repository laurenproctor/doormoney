# Phase 4: deployment checklist

Phase 4 is being built in four pieces, as `docs/PHASE_4_INVENTORY.md` proposes. This document grows
a section per piece. Nothing here has been applied to the hosted project.

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
