-- The auction worker on a clock the hosting plan does not set.
--
-- Migration 0035 moved every auction transition into the database and remediation Phase 3 took
-- settlement out of page rendering, which leaves the question of who calls the worker, and when.
-- Vercel's cron on this plan runs once a day. A close cannot wait a day, and a board that settled
-- itself on sight was the thing Phase 3 removed. So the database calls the worker: pg_cron runs
-- this job every five minutes and pg_net makes the request.
--
-- Guarded, because CI runs these migrations on plain Postgres, which has neither extension. There
-- the block says so and installs nothing; the daily job remains the only caller, as before.
--
-- The two values the job needs are not in this file. They live in Supabase Vault under the names
-- below and are read at call time, so nothing secret is ever committed and a project without them
-- simply makes no request. To turn the schedule on, in the dashboard SQL editor:
--
--   select vault.create_secret('https://<site>/api/cron/auctions', 'auction_worker_url');
--   select vault.create_secret('<the CRON_SECRET Vercel has>',      'cron_secret');
--
-- See docs/PHASE_3_DEPLOYMENT.md.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron or pg_net is not available here, so the auction worker schedule is not installed';
    return;
  end if;

  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';

  if exists (select 1 from cron.job where jobname = 'auction-worker') then
    perform cron.unschedule('auction-worker');
  end if;

  perform cron.schedule(
    'auction-worker',
    '*/5 * * * *',
    $job$
      select net.http_get(
        url := s.url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || s.secret),
        timeout_milliseconds := 55000
      )
      from (
        select (select decrypted_secret from vault.decrypted_secrets where name = 'auction_worker_url') as url,
               (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')        as secret
      ) s
      where s.url is not null and s.secret is not null
    $job$
  );
end $$;
