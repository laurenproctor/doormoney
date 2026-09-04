-- One account, either job, or both.
--
-- Door Money had one kind of account: a musician, whose username was also their board address.
-- A patron who bought a spot or backed a run had a `patrons` row keyed by email and nothing to
-- sign in to, so there was nowhere to see what they had backed or how their bids went.
--
-- An account now carries what it came here to do. Both roles at once is the point, not an edge
-- case: the bassoonist who backs the band down the street is one person with one password.
-- See docs/DECISIONS.md, decision 10.

-- ---------------------------------------------------------------
-- Roles. Stated at sign-up, and gained later by doing the thing: listing an act adds musician,
-- backing a run adds patron. Nothing here removes a role.
-- ---------------------------------------------------------------
alter table profiles
  add column if not exists roles text[] not null default '{}',
  add column if not exists public_profile boolean not null default false;

comment on column profiles.roles is
  'What this account is here to do: musician, patron, or both. Stated at sign-up, and added to by listing an act or backing a run.';
comment on column profiles.public_profile is
  'A patron may show what they have backed on a public page. Off until they ask for it.';

alter table profiles drop constraint if exists profiles_roles_known;
alter table profiles add constraint profiles_roles_known
  check (roles <@ array['musician', 'patron']::text[]);

-- Every account that already owns an act is a musician, whatever it says it came for.
update profiles p
   set roles = array['musician']
 where p.roles = '{}'
   and exists (select 1 from acts a where a.owner_id = p.id);

-- ---------------------------------------------------------------
-- Tie a patron's history to their account.
--
-- patrons.profile_id has existed since 0001 and nothing has ever set it: a patron pays as an
-- email address, with no account. Whoever holds that address and signs in owns that history,
-- so the link is made on the address, once, and only where the row has no owner yet.
-- ---------------------------------------------------------------
create index if not exists patrons_email_idx on patrons (lower(contact_email));
create index if not exists patrons_profile_idx on patrons (profile_id);

create or replace function public.claim_patron_rows(p_user_id uuid, p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed int;
begin
  if p_email is null or btrim(p_email) = '' then
    return 0;
  end if;
  update patrons
     set profile_id = p_user_id
   where profile_id is null
     and lower(contact_email) = lower(btrim(p_email));
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.claim_patron_rows(uuid, text) from public, anon, authenticated;

-- A new account picks up whatever it has already paid for under the same address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, display_name, roles)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'display_name', ''),
    coalesce(
      (select array_agg(value::text)
         from jsonb_array_elements_text(
           case jsonb_typeof(new.raw_user_meta_data->'roles')
             when 'array' then new.raw_user_meta_data->'roles'
             else '[]'::jsonb
           end
         ) as value
        where value::text in ('musician', 'patron')),
      '{}'::text[]
    )
  )
  on conflict (id) do nothing;

  perform public.claim_patron_rows(new.id, new.email);
  return new;
end;
$$;
