-- Phase 2: acts sign in, own their runs and lots, and approve marks.

-- ---------------------------------------------------------------
-- A profile row for every auth user, created by trigger.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Ownership helper: does the signed-in user own the act behind a run?
-- ---------------------------------------------------------------
create or replace function public.owns_run(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from runs r join acts a on a.id = r.act_id
    where r.id = p_run_id and a.owner_id = auth.uid()
  );
$$;

create or replace function public.owns_lot(p_lot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from lots l join runs r on r.id = l.run_id join acts a on a.id = r.act_id
    where l.id = p_lot_id and a.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------
-- Owner policies. Public read policies from 0001 stay as they are;
-- these add draft visibility and writes for the act's owner.
-- ---------------------------------------------------------------
create policy "owner all runs" on runs
  for all
  using (exists (select 1 from acts a where a.id = runs.act_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from acts a where a.id = runs.act_id and a.owner_id = auth.uid()));

create policy "owner all lots" on lots
  for all
  using (public.owns_run(lots.run_id))
  with check (public.owns_run(lots.run_id));

create policy "owner all shows" on shows
  for all
  using (public.owns_run(shows.run_id))
  with check (public.owns_run(shows.run_id));

-- The act sees purchases on its own lots (to approve marks). Writes stay server-side.
create policy "owner reads purchases" on purchases
  for select
  using (public.owns_lot(purchases.lot_id));

-- ---------------------------------------------------------------
-- Act photos. Public bucket; uploads go through the server.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('acts', 'acts', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "public read act photos" on storage.objects
  for select
  using (bucket_id = 'acts');
