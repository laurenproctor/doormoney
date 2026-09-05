-- ---------------------------------------------------------------
-- The account holder gets a first name and a last name.
--
-- profiles.display_name was one free-text field, and its hint on the sign-up form said "a person
-- or a business". Whoever holds an account is a person: the band's name lives on acts.name and the
-- business's name lives on patrons.name, and both of those already appear on boards, receipts and
-- marks. So the account holder splits in two and the public names are left alone.
--
-- Deliberately untouched, because they are how a name APPEARS rather than who somebody is:
--   patrons.name              "Kettle St. Coffee", the paying business on a receipt
--   backings.display_name     the fan's name as it should read on a tour thank-you
--   patron_profiles.display_name  what a patron chose to call their public page
--   acts.name                 the band
-- ---------------------------------------------------------------

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

-- ---------------------------------------------------------------
-- Backfill: split on the LAST space. "Dana Whitfield" gives Dana / Whitfield, "Ana Lucia de Souza"
-- gives "Ana Lucia de" / "Souza", and a single word is a first name with no last name.
--
-- Splitting a name is guesswork in every language, so this errs towards keeping everything typed:
-- nothing is discarded. It still gets some wrong. A business that signed up as "Kettle St. Coffee"
-- lands as "Kettle St." / "Coffee", and there is no form for correcting it yet: the account page
-- shows the name but has never had an editor, for display_name either. The columns are in the
-- authenticated update grant below, so a form is all that is missing.
-- ---------------------------------------------------------------
update public.profiles
   set first_name = case
         when position(' ' in btrim(display_name)) > 0
           then btrim(left(btrim(display_name), length(btrim(display_name)) - position(' ' in reverse(btrim(display_name)))))
         else btrim(display_name)
       end,
       last_name = case
         when position(' ' in btrim(display_name)) > 0
           then btrim(right(btrim(display_name), position(' ' in reverse(btrim(display_name))) - 1))
         else null
       end
 where display_name is not null
   and btrim(display_name) <> ''
   and first_name is null;

-- Sign-up requires a first name, so every row written from here on has one. Existing rows that
-- never had a name at all keep their null: NOT VALID checks new and updated rows without demanding
-- the table already comply, which is what lets this run on a live table without inventing data.
alter table public.profiles drop constraint if exists profiles_first_name_present;
alter table public.profiles add constraint profiles_first_name_present
  check (first_name is null or btrim(first_name) <> '') not valid;

-- ---------------------------------------------------------------
-- The sign-up trigger from 0021 reads the two names off the new auth user instead of one.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, first_name, last_name, roles)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
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

-- ---------------------------------------------------------------
-- The grants from 0022 named display_name explicitly, so they name the two columns now. A column
-- not in these lists stays unreadable and unwritable from the browser, which is the whole point of
-- that migration: the lists are replaced wholesale rather than added to.
-- ---------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (id, first_name, last_name, username, created_at) on public.profiles to authenticated;

revoke update on public.profiles from anon, authenticated;
grant update (first_name, last_name, username) on public.profiles to authenticated;

alter table public.profiles drop column display_name;

-- ---------------------------------------------------------------
-- The newsletter learns who it is writing to.
--
-- The list has only ever held an address, so the new-boards email could not greet anybody. The form
-- now asks for a first name and refuses without one. Addresses collected before today have no name:
-- they are matched to an account by address where one exists, and the rest keep a null and get the
-- unnamed version of the email.
-- ---------------------------------------------------------------
alter table public.newsletter add column if not exists first_name text;

update public.newsletter n
   set first_name = p.first_name
  from public.profiles p
 where lower(p.email) = lower(n.email)
   and p.first_name is not null
   and n.first_name is null;

alter table public.newsletter drop constraint if exists newsletter_first_name_present;
alter table public.newsletter add constraint newsletter_first_name_present
  check (first_name is null or btrim(first_name) <> '') not valid;
