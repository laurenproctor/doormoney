-- Phase 1 of docs/REMEDIATION_PLAN.md: make the database safe when a caller ignores the UI and the
-- server actions and talks to PostgREST directly.
--
-- Numbered 0022, not 0020, on purpose. Migrations 0020 and 0021 exist on the self-service-boards
-- branch and are not merged yet. A duplicate number is recorded as already applied and skipped in
-- silence, which is the dangerous kind of failure.
--
-- Four holes this closes, each reproduced against a local stack before it was written:
--   1. anon could read every act's Connect account id and payout flag.
--   2. anon could read every lot's funding token.
--   3. anon could name an anonymous bidder by joining bids.patron_id to the patron_names view.
--   4. An authenticated musician could rewrite their own stripe_account_id, turn payouts on, and
--      grant themselves founding status, straight through the Data API.

-- ---------------------------------------------------------------
-- 1. Operational columns come off the public Data API.
--
--    A column-level REVOKE does nothing while a table-level GRANT SELECT stands: Postgres treats
--    the table grant as covering every column, present and future. So each table below has its
--    blanket grant revoked and an explicit column list granted back. Anything not named here is
--    unreachable through PostgREST, including any column added later.
-- ---------------------------------------------------------------

-- acts: the board's public face, minus the Connect account and the payout flag.
revoke select on public.acts from anon, authenticated;
grant select (id, slug, name, type, city, bio, photo_url, instagram, website, created_at)
  on public.acts to anon;
grant select (id, owner_id, slug, name, type, city, bio, photo_url, instagram, website, created_at)
  on public.acts to authenticated;

-- lots: the commercial terms, never the funding token.
revoke select on public.lots from anon, authenticated;
grant select (id, run_id, surface_key, label, price_cents, mode, exclusive, status,
              winner_bid_id, closes_at, buy_now_cents, created_at)
  on public.lots to anon, authenticated;

-- bids: amounts are public, the patron behind them is not. patron_id is a stable identifier that
-- links a patron's bids across lots and boards even when every one of them is marked anonymous.
revoke select on public.bids from anon, authenticated;
grant select (id, lot_id, amount_cents, anonymous, passed_at, created_at)
  on public.bids to anon, authenticated;
-- Bids are placed by a server action running as the service role, never written from the client.
revoke insert, update, delete on public.bids from anon, authenticated;

-- profiles: the account's own handle, never the address it signs in with.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, username, created_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------
-- 2. patron_names was the other half of the de-anonymising join, and a roster of every patron's
--    name on its own. Nothing public needs it now: the board reads public_bids below, and the
--    dashboard reads its mark queue with the service role.
-- ---------------------------------------------------------------
revoke select on public.patron_names from anon, authenticated;

-- What the board is actually allowed to know about a bid. The name is resolved here and masked
-- here, so an anonymous bid has no name to leak rather than a name the caller is trusted to hide.
create or replace view public.public_bids with (security_invoker = false) as
  select b.id,
         b.lot_id,
         b.amount_cents,
         b.anonymous,
         b.passed_at,
         b.created_at,
         case when b.anonymous then null else p.name end as patron_name
    from public.bids b
    join public.patrons p on p.id = b.patron_id;

grant select on public.public_bids to anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Owner policies stop being FOR ALL.
--    A single FOR ALL policy plus full table privileges means the owner of a row may write every
--    column on it. Ownership decides which rows; column privileges below decide which columns.
-- ---------------------------------------------------------------
drop policy if exists "own acts" on public.acts;

create policy "acts owner reads own drafts" on public.acts
  for select using (auth.uid() = owner_id);

create policy "acts owner inserts own" on public.acts
  for insert with check (auth.uid() = owner_id);

create policy "acts owner updates own" on public.acts
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
-- Deliberately no delete policy. An act carries runs, lots and financial history.

drop policy if exists "own profile" on public.profiles;

create policy "profile owner reads own" on public.profiles
  for select using (auth.uid() = id);

create policy "profile owner updates own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- No insert policy: handle_new_user creates the row. No delete policy: auth.users cascades.

-- ---------------------------------------------------------------
-- 4. Column privileges: what a musician may write on their own rows.
--    Same rule as above, so each write privilege is revoked wholesale and granted back by name.
-- ---------------------------------------------------------------

-- acts. Identity, money plumbing and staff flags are not the musician's to set.
revoke insert, update, delete on public.acts from anon, authenticated;
grant insert (owner_id, slug, name, type, city, bio, photo_url, instagram, website)
  on public.acts to authenticated;
grant update (slug, name, type, city, bio, photo_url, instagram, website)
  on public.acts to authenticated;

-- profiles. Email belongs to Supabase Auth, not to an editable column.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, username) on public.profiles to authenticated;

-- lots. A musician sets a lot's commercial terms. Its lifecycle, its winner and its funding token
-- are set by the auction and payment code running as the service role.
revoke insert, update, delete on public.lots from anon, authenticated;
grant insert (run_id, surface_key, label, price_cents, mode, exclusive, buy_now_cents, closes_at)
  on public.lots to authenticated;
grant update (surface_key, label, price_cents, mode, exclusive, buy_now_cents, closes_at)
  on public.lots to authenticated;
grant delete on public.lots to authenticated;  -- row ownership and the history trigger below decide which

-- runs. The act owns the description and publishes the run; the lifecycle timestamps are not theirs.
revoke insert, update, delete on public.runs from anon, authenticated;
grant insert (act_id, kind, title, starts_on, ends_on, show_count, expected_attendance, bidding_closes_at, status)
  on public.runs to authenticated;
grant update (kind, title, starts_on, ends_on, show_count, expected_attendance, bidding_closes_at, status)
  on public.runs to authenticated;

-- shows are entirely the act's own, and carry no money.
revoke insert, update, delete on public.shows from anon;

-- ---------------------------------------------------------------
-- 5. runs.status stays writable, because publishing and unpublishing a run is the musician's own
--    action, but only between the two states that belong to them.
-- ---------------------------------------------------------------
create or replace function public.enforce_run_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The service role and the table owner settle runs; this only constrains a signed-in musician.
  if current_setting('role', true) is distinct from 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('draft','open') and new.status in ('draft','open')) then
    raise exception 'a run may only move between draft and open here, not % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists runs_status_transition on public.runs;
create trigger runs_status_transition
  before update of status on public.runs
  for each row execute function public.enforce_run_status_transition();

-- ---------------------------------------------------------------
-- 6. A lot with a bid or a payment on it cannot be deleted.
--    Deleting it would orphan money and erase an auction's history.
-- ---------------------------------------------------------------
create or replace function public.refuse_lot_delete_with_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from bids where lot_id = old.id) then
    raise exception 'that spot has bids on it and cannot be deleted' using errcode = 'foreign_key_violation';
  end if;
  if exists (select 1 from purchases where lot_id = old.id) then
    raise exception 'that spot has been paid for and cannot be deleted' using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists lots_refuse_delete_with_history on public.lots;
create trigger lots_refuse_delete_with_history
  before delete on public.lots
  for each row execute function public.refuse_lot_delete_with_history();

-- ---------------------------------------------------------------
-- 7. One act per account, in the database rather than by convention.
-- ---------------------------------------------------------------
create unique index if not exists acts_one_per_owner
  on public.acts (owner_id) where owner_id is not null;

-- ---------------------------------------------------------------
-- 8. Reserved handles, enforced here and not only in TypeScript.
--    handle_new_user copies the username straight out of the auth user's metadata, which the client
--    controls at signup, so "admin" was claimable by anyone who asked for it.
--    The list mirrors RESERVED_SLUGS in src/lib/slug.ts; tests/reserved-names.test.ts keeps them equal.
-- ---------------------------------------------------------------
create table if not exists public.reserved_handles (name text primary key);
alter table public.reserved_handles enable row level security;

insert into public.reserved_handles (name) values
  ('accessibility'),('account'),('admin'),('api'),('auctions'),('auth'),('badge'),('board'),('claim'),('contact'),
  ('cookies'),('dashboard'),('door-money'),('doormoney'),('embed'),('forgot'),('icon'),('list'),('login'),('mark'),
  ('new'),('newsletter'),('placements'),('privacy'),('record'),('refunds'),('reset'),('robots'),('signup'),
  ('sitemap'),('terms'),('test'),('widget')
on conflict (name) do nothing;

create or replace function public.refuse_reserved_handle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  -- One trigger serves both tables, so the field is read by name rather than by reference:
  -- naming new.username directly fails to compile when the trigger fires on acts.
  candidate := coalesce(to_jsonb(new) ->> 'username', to_jsonb(new) ->> 'slug');
  if candidate is null then
    return new;
  end if;
  if exists (select 1 from reserved_handles r where r.name = candidate) then
    raise exception 'that name is reserved: %', candidate using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_refuse_reserved on public.profiles;
create trigger profiles_refuse_reserved
  before insert or update of username on public.profiles
  for each row execute function public.refuse_reserved_handle();

drop trigger if exists acts_refuse_reserved on public.acts;
create trigger acts_refuse_reserved
  before insert or update of slug on public.acts
  for each row execute function public.refuse_reserved_handle();

-- The shape rule profiles.username already carries, applied to the board address too.
alter table public.acts drop constraint if exists acts_slug_shape;
alter table public.acts
  add constraint acts_slug_shape
  check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$');

-- ---------------------------------------------------------------
-- 9. Functions stop being executable by everyone who can reach the API.
--    Every one of these already sets a search_path; what they lacked was a grant boundary.
--    The policy helpers are called from inside policies, which run as the table owner, so nothing
--    needs execute on them. The trigger functions are only ever called by their triggers.
-- ---------------------------------------------------------------
-- owns_run and owns_lot are the exception: they are called from inside the RLS policies on runs,
-- lots, shows and purchases, and a policy expression is evaluated with the caller's own privileges.
-- Revoking execute here does not merely deny the query, it segfaults the backend (signal 11) the
-- moment anon selects from purchases. Verified against postgres 17 in the local stack. They keep
-- execute, which costs nothing: both answer only "does the caller own this", and for an anonymous
-- caller auth.uid() is null, so the answer is always false.
grant execute on function public.owns_run(uuid) to anon, authenticated;
grant execute on function public.owns_lot(uuid) to anon, authenticated;

revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.username_unclaimed()               from public, anon, authenticated;
revoke execute on function public.slug_unclaimed()                   from public, anon, authenticated;
revoke execute on function public.enforce_run_status_transition()    from public, anon, authenticated;
revoke execute on function public.refuse_lot_delete_with_history()   from public, anon, authenticated;
revoke execute on function public.refuse_reserved_handle()           from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 10. Nothing new in this schema is public by default.
-- ---------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
