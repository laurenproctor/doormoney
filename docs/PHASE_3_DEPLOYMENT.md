# Phase 3: deployment checklist

Migrations `0034_stale_offer_refund_reason.sql`, `0035_transactional_auctions.sql` and
`0036_auction_worker_schedule.sql` move every auction decision into Postgres and take settlement out
of page rendering. They have been applied and tested on a throwaway Postgres only (`npm run
test:db:docker`: the pgTAP suites and the two-session concurrency checks). Nothing in this document
has been done to the hosted project.

Read `docs/SYSTEM_INVARIANTS.md` for what the migrations enforce.

## Order

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
