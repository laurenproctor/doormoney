-- Usernames: the handle a musician signs in with, and the address of their board.
-- One word doing two jobs. profiles.username is the sign-in handle, acts.slug is the
-- board address, and for any one account they are the same word.

-- ---------------------------------------------------------------
-- The handle itself. Shaped like a slug, so a handle is always a legal board address.
-- ---------------------------------------------------------------
alter table profiles add column if not exists username text;

alter table profiles drop constraint if exists profiles_username_shape;
alter table profiles
  add constraint profiles_username_shape
  check (username is null or username ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$');

create unique index if not exists profiles_username_key on profiles (username);

-- An account that already listed an act keeps that act's address as its handle.
-- One act per account, but order by created_at so a stray second act cannot win the race.
update profiles p
   set username = first_act.slug
  from (
    select distinct on (owner_id) owner_id, slug
      from acts
     where owner_id is not null
     order by owner_id, created_at
  ) as first_act
 where first_act.owner_id = p.id
   and p.username is null;

-- ---------------------------------------------------------------
-- Handles and board addresses live in two tables but share one namespace:
-- doormoney.com/<word> has to mean one act. These two triggers keep it whole.
-- Each table's own unique index covers collisions inside it; these cover across.
-- ---------------------------------------------------------------
create or replace function public.username_unclaimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is null then
    return new;
  end if;
  if exists (
    select 1 from acts a
     where a.slug = new.username
       and a.owner_id is distinct from new.id
  ) then
    raise exception 'username already taken: %', new.username
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_unclaimed on profiles;
create trigger profiles_username_unclaimed
  before insert or update of username on profiles
  for each row execute function public.username_unclaimed();

create or replace function public.slug_unclaimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from profiles p
     where p.username = new.slug
       and p.id is distinct from new.owner_id
  ) then
    raise exception 'board address already taken: %', new.slug
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists acts_slug_unclaimed on acts;
create trigger acts_slug_unclaimed
  before insert or update of slug on acts
  for each row execute function public.slug_unclaimed();

-- ---------------------------------------------------------------
-- Signing up carries the handle in the auth user's metadata, so the profile row
-- and its handle are written in one go and two people cannot claim one word.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'username', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
