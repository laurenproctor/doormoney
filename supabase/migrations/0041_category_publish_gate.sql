-- Publishing for the four launch categories, with the gate each one is actually held to.
--
-- Migration 0038 let every category save a draft and let only music leave draft status. That rule
-- was a phase marker, not a product rule, and it lived in the trigger where no category could ever
-- outgrow it. The registry decides now: publish_enabled is off by default, so a category added in
-- SQL is still draft-only until somebody turns it on deliberately.
--
-- Music's gate is unchanged, on purpose. It predates the product contract, and the fundraisers
-- already published under it have to keep passing it. Every other category is held to the
-- contract's own test instead: what the money enables, who it reaches, what the sponsor receives.
begin;

alter table public.fundraiser_categories add column publish_enabled boolean not null default false;
comment on column public.fundraiser_categories.publish_enabled is
  'Whether a fundraiser in this category may leave draft status. Off by default: a new category is draft-only until its delivery workflow exists.';
update public.fundraiser_categories set publish_enabled = true where key in ('music','sports','film','theater');

create or replace function public.guard_fundraiser_foundation()
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
  -- An act type, a performance format and a show count are music ideas. No other category carries
  -- one, so none of them can be read as a default somewhere else.
  if new.category_key <> 'music' and (new.kind is not null or new.show_count is not null) then
    raise exception 'music fields do not apply to this category' using errcode = '23514';
  end if;
  if new.status <> 'draft' then
    if not category.publish_enabled then
      raise exception 'this category is not enabled for publishing' using errcode = '23514';
    end if;
    if btrim(coalesce(new.title,'')) = '' then
      raise exception 'a published fundraiser needs a name' using errcode = '23514';
    end if;
    if new.category_key = 'music' then
      if new.kind is null or new.starts_on is null or new.ends_on is null or new.show_count is null then
        raise exception 'published music fundraisers require the existing music details' using errcode = '23514';
      end if;
      if not exists (select 1 from public.acts where id = new.act_id and type is not null) then
        raise exception 'published music fundraisers require a music organizer profile' using errcode = '23514';
      end if;
    else
      -- The product contract's test for a sponsorship anyone can judge. Unknown stays unknown in a
      -- draft; a public page has to answer all three.
      if btrim(coalesce(new.purpose,'')) = '' or btrim(coalesce(new.audience_description,'')) = ''
        or btrim(coalesce(new.sponsor_promise,'')) = '' then
        raise exception 'a published fundraiser must say what the funding enables, who it reaches and what a sponsor receives'
          using errcode = '23514';
      end if;
    end if;
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

-- A published fundraiser outside music has no act type, no show count and no tour to describe it.
-- What it has instead is the answer to the three questions the gate above now enforces, and its
-- public page is drawn from them, so anon has to be able to read them.
--
-- Safe because rows, not columns, decide what anon sees here: the "public read runs" policy from
-- migration 0001 is limited to open, live and closed, so a draft stays invisible whatever is
-- granted. These four are the columns the board actually renders and no more.
grant select (category_key, purpose, audience_description, sponsor_promise) on public.runs to anon;

-- An organizer outside music has no act type, and migration 0038 made the act type the whole test
-- for whether a profile is public. That was right while only music could publish; now it is what
-- would turn a published theater fundraiser into a 404, because the board reads the act first.
--
-- Asked through a security definer rather than inline, for the reason migration 0023 records: a
-- policy body runs as the calling role, so an inline question it has no privilege to answer fails
-- the whole policy closed and the page simply disappears.
create function public.act_has_public_fundraiser(a uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.runs where act_id = a and status in ('open','live','closed'));
$$;
revoke all on function public.act_has_public_fundraiser(uuid) from public;
grant execute on function public.act_has_public_fundraiser(uuid) to anon, authenticated, service_role;

drop policy "public read acts" on public.acts;
create policy "public read acts" on public.acts for select to anon, authenticated
  using (type is not null or public.act_has_public_fundraiser(id));

commit;
