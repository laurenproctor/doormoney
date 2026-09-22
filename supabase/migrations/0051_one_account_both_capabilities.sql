-- One account, both capabilities, from the moment it is opened.
--
-- Decision 10 settled that an account can organize and support, and sign-up asked which one the
-- person was in those words. Asking was the problem: it put an identity in front of the door,
-- before anybody had seen the place, and it decided the first screen they met afterwards. Nobody
-- is asked now, so the database has to hold the floor the form used to hold.
--
-- Three things here, all additive:
--   1. every new account is opened with organizer and patron, whichever way it came in,
--   2. every existing account gains whichever of the two it is missing,
--   3. no account, new or updated, can be left with no capabilities at all.
--
-- Nothing is taken away. `musician` is the role accounts made before Expansion Phase 2 carry, it
-- is read everywhere `organizer` is read, and a row that has it keeps it.

-- ---------------------------------------------------------------
-- 1. The floor, in the constraint that already names the known roles.
--
-- Re-asserted rather than changed: musician, organizer and patron are all still valid, and a
-- fourth word is still refused. The new part is cardinality. Every row is given its capabilities
-- below before it is applied, so this is validated rather than left NOT VALID: an empty roles
-- array is a state the product no longer has, not a state it tolerates in old rows.
-- ---------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_roles_known;
alter table public.profiles add constraint profiles_roles_known
  check (roles <@ array['musician','organizer','patron']::text[]);

-- ---------------------------------------------------------------
-- 2. Existing accounts.
--
-- An account with nothing (made before roles existed, or by a one-time email link) gets both.
-- An account carrying musician keeps musician and gains both. An account that said patron and
-- nothing else gains organizer, because it could always have created a fundraiser and now the
-- product says so. array_append twice, guarded, rather than a rewrite: nothing reads a row and
-- writes it back, so nothing can lose a value it did not know about.
-- ---------------------------------------------------------------
update public.profiles set roles = array_append(roles, 'organizer')
  where not ('organizer' = any(roles));
update public.profiles set roles = array_append(roles, 'patron')
  where not ('patron' = any(roles));

alter table public.profiles drop constraint if exists profiles_roles_present;
alter table public.profiles add constraint profiles_roles_present
  check (cardinality(roles) > 0);

comment on column public.profiles.roles is
  'Product capabilities, not authorization. Every account is opened with organizer and patron and keeps both; musician remains a legacy-compatible role and is never removed.';

-- ---------------------------------------------------------------
-- 3. New accounts.
--
-- The trigger from 0038, with one change: whatever the metadata carries is unioned with both
-- capabilities instead of being taken as the whole answer. A password sign-up sends both and gets
-- both. A one-time email link sends no metadata at all and gets both, which it did not before:
-- an account created that way used to arrive with an empty array and no way to gain a capability
-- except by owning an act. A legacy caller sending 'musician' keeps it and gains both.
--
-- Still security definer, still search_path-pinned, still `on conflict (id) do nothing`, and it
-- still claims any patron rows already paid for under the same address (0021).
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  stated text[];
begin
  select coalesce(array_agg(distinct value), '{}'::text[]) into stated
    from jsonb_array_elements_text(
      case jsonb_typeof(new.raw_user_meta_data->'roles')
        when 'array' then new.raw_user_meta_data->'roles'
        else '[]'::jsonb
      end
    ) as value
   where value in ('musician','organizer','patron');

  insert into public.profiles (id,email,username,first_name,last_name,roles)
  values (new.id,coalesce(new.email,''),nullif(new.raw_user_meta_data->>'username',''),
    nullif(new.raw_user_meta_data->>'first_name',''),nullif(new.raw_user_meta_data->>'last_name',''),
    (select coalesce(array_agg(distinct r), '{}'::text[])
       from unnest(stated || array['organizer','patron']::text[]) as r))
  on conflict (id) do nothing;

  perform public.claim_patron_rows(new.id,new.email);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
