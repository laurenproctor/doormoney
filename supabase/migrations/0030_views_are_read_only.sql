-- anon could delete every fan backing. Closing that, and the shape behind it.
--
-- Found by the policy audit that followed 0029. Migration 0022 revoked the blanket SELECT on the
-- tables that mattered and granted columns back by name. It never touched INSERT, UPDATE, DELETE or
-- TRUNCATE on the views, and Supabase grants those to anon and authenticated by default.
--
-- A view built `with (security_invoker = false)` runs as its owner. Postgres owns these, Postgres
-- owns the tables under them, and row level security does not apply to a table's owner unless the
-- table is FORCEd. So a write through one of these views reaches the base table with RLS switched
-- off. Two of the six are simple enough for Postgres to make them auto-updatable, which is all it
-- takes:
--
--   set role anon;
--   update patron_names set name = 'OWNED';        -- rewrote every patron's name
--   delete from run_backers;                       -- would delete every fan backing
--
-- Reproduced against a local stack, then confirmed on the hosted project through PostgREST, where
-- a PATCH and a DELETE on run_backers both answered 204 to the publishable key. backings holds what
-- fans paid; payout_schedule cascades from it. Nothing appears to have been written by anybody.
--
-- Three things are wrong here and each is fixed below:
--   1. Views carry write privileges at all. No view on this site is a write path, ever.
--   2. Four tables carry write privileges with no policy to use them. RLS refuses today, so this
--      is defence in depth rather than a hole, but it is one CREATE POLICY away from being one.
--   3. TRUNCATE is granted on everything. TRUNCATE ignores row level security by design, so a
--      policy is no defence against it. PostgREST cannot issue one, which is the only reason this
--      has not mattered.

-- ---------------------------------------------------------------
-- 1. Every view is read-only. Named one at a time so the list is greppable, and swept afterwards
--    so a view added later cannot quietly arrive with the defaults.
-- ---------------------------------------------------------------
revoke insert, update, delete, truncate on public.lot_buyers             from anon, authenticated;
revoke insert, update, delete, truncate on public.run_backers            from anon, authenticated;
revoke insert, update, delete, truncate on public.public_bids            from anon, authenticated;
revoke insert, update, delete, truncate on public.patron_names           from anon, authenticated;
revoke insert, update, delete, truncate on public.public_patron_profiles from anon, authenticated;
revoke insert, update, delete, truncate on public.public_patron_activity from anon, authenticated;

-- ---------------------------------------------------------------
-- 2. Tables nothing writes from a browser. Each of these is written only by the server with the
--    service role, and each already has no write policy, so RLS refuses these today. The grant
--    going too means a policy added later for a read cannot open a write by accident.
-- ---------------------------------------------------------------
revoke insert, update, delete on public.patrons          from anon, authenticated;
revoke insert, update, delete on public.surfaces         from anon, authenticated;
revoke insert, update, delete on public.mail_runs        from anon, authenticated;
revoke insert, update, delete on public.reserved_handles from anon, authenticated;

-- ---------------------------------------------------------------
-- 3. TRUNCATE, everywhere. It empties a table without consulting a single policy, and nothing on
--    this site has any business issuing one. The sweep also catches anything the lists above
--    missed, and any view created between 0022 and now.
-- ---------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v')
  loop
    execute format('revoke truncate on public.%I from anon, authenticated', r.relname);
    if r.relkind = 'v' then
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', r.relname);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 4. And for whatever is built next.
--
--    0022 was a snapshot: it covered the tables that existed the day it was written, and 0029 had
--    to catch up eight more. This makes the default no writes at all, so a new table or view
--    arrives closed and its migration has to say out loud what the browser may do with it. The
--    same was done for functions in 0022.
-- ---------------------------------------------------------------
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

comment on view public.run_backers is
  'Read-only. A backer''s chosen name and tier once the money is held. Writes were revoked in 0030: this view runs as its owner, so a write through it would reach backings with row level security switched off.';
