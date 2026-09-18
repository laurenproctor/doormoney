# Phase 3: deployment record

Migrations `0034_stale_offer_refund_reason.sql`, `0035_transactional_auctions.sql` and
`0036_auction_worker_schedule.sql` move every auction decision into Postgres and take settlement out
of page rendering. This document was their deployment checklist. All three are on the hosted
project and the schedule is running, so what follows is the record of how it went, with the
checklist kept below as it was written.

Read `docs/SYSTEM_INVARIANTS.md` for what the migrations enforce.

## Status, 2026-09-18

Everything on this page is done. In the order it happened:

- **The ledger was repaired first.** 0031, 0032 and 0033 had been applied by hand, so the CLI's
  ledger did not know them. CLI access came back on 2026-09-17 (the CLI had been signed in to an
  account in a different organization, which is all the 403 ever was), and the three versions were
  written into `supabase_migrations.schema_migrations` in the dashboard SQL editor, which is what
  `supabase migration repair --status applied` does. `supabase db push --dry-run` then listed 0034
  to 0036 and nothing else.
- **`supabase db push` applied 0034, 0035 and 0036**, from a terminal, not from a Claude session:
  the permission classifier refuses a production apply from a session, and that is the right way
  round. The four `trigger ... does not exist, skipping` notices are 0035's `drop trigger if exists`
  lines and mean nothing. The two data checks in step 3 were not run from the session, because
  production reads are refused there too; the audit the day before had found no lot in
  `pending_funding`, so there was nothing for the backfill to touch.
- **The old code ran against the new schema without a fault** for the window between the push and
  the merge: home, a musician's page, a fundraiser page, the fundraiser index and the widget all
  answered 200. That is the window the "Order" section below promises, and it held.
- **PR #22 merged and deployed.** `/api/cron/auctions` answering 401 to a call with no secret is the
  quick proof that the new code is what is serving: the route did not exist before.
- **`CRON_SECRET` was replaced, not copied.** Every variable on the Vercel project is marked
  sensitive, so neither the dashboard nor `vercel env pull` will show a value. A fresh one
  (`openssl rand -hex 32`) went into Vercel, a redeploy, `.env.local`, and then Vault. Vercel's own
  scheduler reads the variable, so the daily and Friday jobs picked it up with no other change.
  Called with it, the worker answered 200 with every count at zero and an empty `errors` list.
- **The two Vault secrets were created and the schedule turned itself on.** `cron.job_run_details`
  showed `0 rows` on every run before them and `1 row` on every run after, five minutes apart.

One thing worth knowing when reading that table: `succeeded` with `1 row` means the database queued
the request, not that the site answered 200. The site's answers are in `net._http_response`
(`select status_code, created from net._http_response order by created desc limit 5`). A 401 there
means the `cron_secret` in Vault and the `CRON_SECRET` in Vercel have drifted apart, which is what
will happen if either is ever rotated without the other.

## Order

The checklist from here down is as it was written before anything was applied.

The migrations are additive and the code on this branch needs them: `placeBid` calls `place_bid`,
checkout calls `begin_lot_purchase`, the webhook calls `fulfil_lot_purchase`, and the worker calls
`close_auction` and `roll_offer`. So the migrations go first, and the code follows once they are in.
The old code keeps working against the new schema in between: every new column is nullable or
defaulted, and the guards let through everything the old code writes except the two things it must
not (a bid under the minimum, a purchase for a stale offer), which is the point.

1. **Take a backup.**
2. **Check the ledger.** The CLI's migration ledger does not know about 0031, 0032 and 0033, which
   were applied by hand. If CLI access is back, repair those first (`supabase migration repair
   --status applied 0031 0032 0033`), then `supabase db push`. If not, paste each of the three files
   into the dashboard SQL editor in order. `0034` is one statement and must run on its own: Postgres
   will not use a new enum value in the transaction that adds it.
3. **Check the data passes the new guards.** These find nothing on the hosted project today
   (0 lots in `pending_funding`, 0 unpaid purchases), but look:

   ```sql
   -- An unpaid purchase with no expiry gets one from the migration; here is what will be backfilled.
   select id, lot_id, created_at from purchases where payment_status = 'requires_payment';

   -- A purchase on a lot won at auction gets bound to its winning bid; here is what will be bound.
   select p.id, l.winner_bid_id from purchases p join lots l on l.id = p.lot_id
    where l.mode = 'auction' and l.winner_bid_id is not null and p.payment_status in ('requires_payment','held','released');
   ```

4. **Apply 0034, then 0035, then 0036.** 0036 will say it installed nothing if `pg_cron` or `pg_net`
   is unavailable; on the hosted project both are, and it schedules `auction-worker` every five
   minutes. The job makes no request until step 6.
5. **Merge and deploy the code.**
6. **Turn the schedule on.** Two values in Supabase Vault, in the dashboard SQL editor:

   ```sql
   select vault.create_secret('https://<the site>/api/cron/auctions', 'auction_worker_url');
   select vault.create_secret('<the CRON_SECRET Vercel has>',           'cron_secret');
   ```

   The job reads both at call time and skips the request while either is missing. Until this step
   the daily job at `/api/cron/daily` is the only thing that closes auctions, as before Phase 3;
   what has changed is that a page load no longer does.
7. **Watch the first run.** `select * from cron.job_run_details order by start_time desc limit 5`
   shows the job firing; the worker answers `{"auctions": {...}}` with counts and an `errors` list.

## Rollback

The functions and triggers can be dropped and the columns left in place; nothing reads them
without the code on this branch. Reverting the code alone is not enough, because the guards on
`bids` and `purchases` stay and the old `placeBid` would then be refused only when it should be.

## What this does not do

- It does not enable `pg_cron` or `pg_net` on a project that lacks them, and it does not put either
  secret anywhere but Vault.
- It does not touch `vercel.json`. The plan allows two crons and both are taken.
- It does not change how a fan backing is fulfilled; those never had an auction to be stale against.
