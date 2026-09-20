-- Expansion Phase 2. Existing music IDs, URLs and payment rows retain their meaning.
-- The new categories can save private drafts only; publishing is a later phase.
begin;

create table public.fundraiser_categories (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (length(label) between 1 and 80),
  detail_keys text[] not null default '{}',
  draft_enabled boolean not null default true
);
alter table public.fundraiser_categories enable row level security;
revoke all on public.fundraiser_categories from public, anon, authenticated;
grant select on public.fundraiser_categories to authenticated;
grant all on public.fundraiser_categories to service_role;
create policy "category definitions" on public.fundraiser_categories for select to authenticated using (true);
insert into public.fundraiser_categories (key, label, detail_keys) values
  ('music', 'Music', array['format']),
  ('sports', 'Sports teams', array['sport','level']),
  ('film', 'Film', array['format','production_stage']),
  ('theater', 'Theater', array['production','venue']);

-- A neutral organizer uses the existing ownership/username namespace, without a fake music type.
alter table public.acts alter column type drop not null;
alter table public.acts alter column city drop not null;
alter table public.acts alter column city drop default;
alter table public.acts add column region text check (length(region) <= 100),
  add column country_code text check (country_code ~ '^[A-Z]{2}$');
grant select (region, country_code), insert (region, country_code), update (region, country_code)
  on public.acts to authenticated;
-- New organizer metadata is private until the category-aware public profiles are implemented.

alter table public.profiles drop constraint profiles_roles_known;
alter table public.profiles add constraint profiles_roles_known
  check (roles <@ array['musician','organizer','patron']::text[]);
update public.profiles set roles = array_append(roles, 'organizer')
  where not ('organizer' = any(roles)) and ('musician' = any(roles)
    or exists (select 1 from public.acts where owner_id = profiles.id));
comment on column public.profiles.roles is
  'Product preferences, not authorization. Organizer and patron can coexist; musician remains a legacy-compatible role.';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id,email,username,first_name,last_name,roles)
  values (new.id,coalesce(new.email,''),nullif(new.raw_user_meta_data->>'username',''),
    nullif(new.raw_user_meta_data->>'first_name',''),nullif(new.raw_user_meta_data->>'last_name',''),
    coalesce((select array_agg(distinct value) from jsonb_array_elements_text(
      case jsonb_typeof(new.raw_user_meta_data->'roles') when 'array' then new.raw_user_meta_data->'roles' else '[]'::jsonb end
    ) as value where value in ('musician','organizer','patron')), '{}'::text[]))
  on conflict (id) do nothing;
  perform public.claim_patron_rows(new.id,new.email);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Atomic role addition avoids read/overwrite races and is based on actual ownership.
create function public.organizer_role_from_ownership()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set roles = array_append(roles,'organizer')
    where id = new.owner_id and not ('organizer' = any(roles));
  return new;
end;
$$;
revoke all on function public.organizer_role_from_ownership() from public, anon, authenticated;
create trigger acts_add_organizer_role after insert or update of owner_id on public.acts
  for each row execute function public.organizer_role_from_ownership();

alter table public.runs
  add column category_key text not null default 'music' references public.fundraiser_categories(key),
  add column purpose text check (length(purpose) <= 1000),
  add column description text check (length(description) <= 10000),
  add column audience_description text check (length(audience_description) <= 2000),
  add column sponsor_promise text check (length(sponsor_promise) <= 2000),
  add column goal_cents integer check (goal_cents >= 0 and goal_cents <= 2000000000),
  add column goal_currency text check (goal_currency = 'USD'),
  add column fundraising_starts_on date,
  add column fundraising_ends_on date,
  add column delivery_due_at timestamptz,
  add column timezone text,
  add column activity_mode text check (activity_mode in ('in_person','online','hybrid')),
  add column activity_locations jsonb not null default '[]',
  add column category_details jsonb not null default '{}',
  add column category_locked boolean not null default false,
  add constraint runs_goal_currency check (goal_cents is null or goal_currency is not null),
  add constraint runs_fundraising_dates check (fundraising_ends_on >= fundraising_starts_on);
update public.runs set category_locked = true where status <> 'draft';
alter table public.runs alter column kind drop not null;
alter table public.runs alter column starts_on drop not null;
alter table public.runs alter column ends_on drop not null;
alter table public.runs alter column show_count drop not null;
alter table public.runs alter column show_count drop default;
-- Keep title present as an empty draft string, not an invented purpose or public title.
alter table public.runs alter column title set default '';
create index runs_category_idx on public.runs(category_key);

grant select (category_key,purpose,description,audience_description,sponsor_promise,goal_cents,goal_currency,
  fundraising_starts_on,fundraising_ends_on,delivery_due_at,timezone,activity_mode,activity_locations,category_details,category_locked)
  on public.runs to authenticated;
grant insert (category_key,purpose,description,audience_description,sponsor_promise,goal_cents,goal_currency,
  fundraising_starts_on,fundraising_ends_on,delivery_due_at,timezone,activity_mode,activity_locations,category_details),
  update (category_key,purpose,description,audience_description,sponsor_promise,goal_cents,goal_currency,
  fundraising_starts_on,fundraising_ends_on,delivery_due_at,timezone,activity_mode,activity_locations,category_details)
  on public.runs to authenticated;
-- runs already has table SELECT grants from the original schema. Remove that blanket grant so
-- new private draft metadata is not incidentally exposed with every future public column.
revoke select on public.runs from anon, authenticated;
grant select (id,act_id,kind,title,starts_on,ends_on,show_count,expected_attendance,bidding_closes_at,
  status,created_at,slug,verification_methods,verification_other,announced_at,closed_at,cancelled_at) on public.runs to anon, authenticated;
grant select (category_key,purpose,description,audience_description,sponsor_promise,goal_cents,goal_currency,
  fundraising_starts_on,fundraising_ends_on,delivery_due_at,timezone,activity_mode,activity_locations,category_details,category_locked)
  on public.runs to authenticated;

-- This trigger must inspect private payment history even for an authenticated draft writer.
-- It accepts no caller-supplied identity, exposes no rows, and has no callable client grant.
create function public.guard_fundraiser_foundation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare category public.fundraiser_categories; item jsonb; pair record;
begin
  select * into category from public.fundraiser_categories where key = new.category_key;
  if not found then raise exception 'unknown fundraiser category' using errcode = '23514'; end if;
  if (tg_op = 'INSERT' or new.category_key is distinct from old.category_key) and not category.draft_enabled then
    raise exception 'category is not enabled for drafts' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.category_key is distinct from old.category_key and (old.category_locked or old.status <> 'draft'
      or exists (select 1 from public.lots where run_id = old.id)
      or exists (select 1 from public.shows where run_id = old.id)
      or exists (select 1 from public.backings where run_id = old.id)) then
      raise exception 'category cannot change after publication or attached offers, activity or payments' using errcode = '23514';
    end if;
    new.category_locked := old.category_locked or old.status <> 'draft' or new.status <> 'draft';
    if old.category_locked and new.slug is distinct from old.slug then
      raise exception 'published fundraiser addresses are frozen' using errcode = '23514';
    end if;
  else
    new.category_locked := new.status <> 'draft';
  end if;
  if new.category_key <> 'music' then
    if new.kind is not null or new.show_count is not null then
      raise exception 'music fields do not apply to this category' using errcode = '23514';
    end if;
    if new.status <> 'draft' then
      raise exception 'this category supports drafts only in expansion phase 2' using errcode = '23514';
    end if;
  end if;
  if new.status <> 'draft' and (new.kind is null or new.starts_on is null or new.ends_on is null or new.show_count is null) then
    raise exception 'published music fundraisers require the existing music details' using errcode = '23514';
  end if;
  if new.status <> 'draft' and not exists (select 1 from public.acts where id = new.act_id and type is not null) then
    raise exception 'published music fundraisers require a music organizer profile' using errcode = '23514';
  end if;
  if new.show_count < 0 or new.show_count > 400 or new.expected_attendance < 0 or new.expected_attendance > 10000000 then
    raise exception 'invalid attendance or performance count' using errcode = '23514';
  end if;
  if new.timezone is not null and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid time zone' using errcode = '23514';
  end if;
  if jsonb_typeof(new.category_details) <> 'object' then raise exception 'details must be an object' using errcode = '23514'; end if;
  for pair in select * from jsonb_each(new.category_details) loop
    if not (pair.key = any(category.detail_keys)) or jsonb_typeof(pair.value) <> 'string' or length(pair.value #>> '{}') > 1000 then
      raise exception 'invalid category detail' using errcode = '23514';
    end if;
  end loop;
  if jsonb_typeof(new.activity_locations) <> 'array' or jsonb_array_length(new.activity_locations) > 50 then
    raise exception 'locations must be an array of at most 50 entries' using errcode = '23514';
  end if;
  for item in select * from jsonb_array_elements(new.activity_locations) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'invalid location' using errcode = '23514'; end if;
    for pair in select * from jsonb_each(item) loop
      if pair.key not in ('city','region','country_code') or jsonb_typeof(pair.value) not in ('string','null')
        or length(pair.value #>> '{}') > 100
        or (pair.key = 'country_code' and jsonb_typeof(pair.value) = 'string' and (pair.value #>> '{}') !~ '^[A-Z]{2}$') then
        raise exception 'invalid location field' using errcode = '23514';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_fundraiser_foundation() from public, anon, authenticated;
create trigger runs_foundation before insert or update on public.runs
  for each row execute function public.guard_fundraiser_foundation();

-- Preserve published music profiles when an organizer starts branching into other categories.
create function public.guard_music_profile_visibility()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.type is not null and new.type is null and exists (
    select 1 from public.runs where act_id = old.id and category_key = 'music' and category_locked
  ) then
    raise exception 'keep the music profile type while published music fundraisers exist' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_music_profile_visibility() from public, anon, authenticated;
create trigger acts_keep_music_visibility before update of type on public.acts
  for each row execute function public.guard_music_profile_visibility();

-- Neutral profiles remain private until the broader public profile experience exists.
-- Music profiles retain the original public access, with their unchanged column grants.
drop policy "public read acts" on public.acts;
create policy "public read acts" on public.acts for select to anon, authenticated using (type is not null);
commit;
