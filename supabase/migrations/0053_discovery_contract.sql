-- The structured facts a sponsor could one day search on, and nothing else.
--
-- Discovery has to stop guessing. Today the only structured thing a fundraiser carries is its
-- category; everything else a sponsor would want to narrow by (what the money buys, who it
-- reaches, where the activity happens) is prose in `purpose`, `audience_description` and
-- `sponsor_promise`. Reading filters out of prose would invent facts the organizer never stated,
-- which is the one thing docs/PRODUCT_CONTRACT.md is most explicit about.
--
-- So: a registry of discovery facets and tags, two arrays that point into it, a derived country
-- list, an offer-level reach estimate that cannot exist without its stated basis, and two
-- read-only public views that are the whole public discovery surface. The free-text fields are
-- untouched and stay the authoritative description. Structured fields supplement them.
--
-- What this migration deliberately does NOT do:
--   * require any of it for publication. Every fundraiser published so far has none of these, and
--     a gate they would all fail on their next save is not a gate, it is a break. Discovery data is
--     optional and absent renders as absent (docs/DISCOVERY_CONTRACT.md).
--   * touch purchases, purchase_snapshots, deliverables, evidence, payout_schedule, bids, fees or a
--     single Stripe id. Discovery is a read model and is kept away from settlement on purpose.
--   * open a category, a policy or a payment. Nothing here changes draft_enabled, publish_enabled,
--     preference_enabled or delivery_policies.
--
-- Registry-driven throughout: a new facet is a row, a new tag is a row, and a tag's categories are
-- an array of registry keys. No list in code decides any of it, which is the rule migration 0038
-- set for categories and 0040/0044 set for templates.
begin;

-- ---------------------------------------------------------------
-- 1. The facets. What kinds of question discovery may ask.
--
--    Two today. A third (a format facet, say) is one insert plus one column on whatever object
--    should carry it, not a schema redesign and not a union type in TypeScript.
-- ---------------------------------------------------------------
create table public.discovery_facets (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (length(label) between 1 and 80),
  -- The line the organizer form puts above the choices. Second person: a form talks to one person.
  prompt text check (length(prompt) between 1 and 200),
  -- Which objects may carry a tag in this facet. A funding purpose belongs to the fundraiser; who
  -- a placement reaches is a fact about the placement, so it belongs to the template.
  on_fundraiser boolean not null default false,
  on_template boolean not null default false,
  -- How many tags in this facet one object may carry. A long list is not a filter.
  max_tags int not null default 5 check (max_tags between 1 and 20),
  sort int not null default 0,
  constraint discovery_facets_used_somewhere check (on_fundraiser or on_template)
);

comment on table public.discovery_facets is
  'The kinds of structured question discovery may ask. A new facet is a row here, never a union type.';

insert into public.discovery_facets (key, label, prompt, on_fundraiser, on_template, max_tags, sort) values
  ('funding_purpose', 'What the funding pays for',
   'Pick what the money will pay for. This never replaces your own description of it.', true, false, 5, 10),
  ('audience_type', 'Who it reaches',
   'Pick the kinds of people this reaches. Your own description of the audience still says the rest.', true, true, 5, 20);

-- ---------------------------------------------------------------
-- 2. The tags. Keys and labels, from the database, for every facet.
--
--    category_keys narrows a tag to the categories it is honestly about. Null means every category,
--    which is what most of these are: what a van costs and who is in the room are not music ideas.
--    Retiring a tag leaves every object already carrying it alone, exactly as a retired template
--    leaves its lots alone (migration 0044).
-- ---------------------------------------------------------------
create table public.discovery_tags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  facet_key text not null references public.discovery_facets(key),
  label text not null check (length(label) between 1 and 80),
  -- One short line under the label where the label alone leaves a real question.
  help text check (length(help) between 1 and 200),
  category_keys text[] check (category_keys is null or cardinality(category_keys) between 1 and 40),
  active boolean not null default true,
  sort int not null default 0
);
create index discovery_tags_facet_idx on public.discovery_tags(facet_key, sort);

comment on table public.discovery_tags is
  'Discovery keys and their public labels, per facet. category_keys null means every category. Retiring a tag stops it being chosen and changes nothing already chosen.';
comment on column public.discovery_tags.category_keys is
  'The categories this tag is honestly about, as fundraiser_categories keys. Null for a tag that is true of any category.';

-- Postgres cannot put a foreign key on the elements of an array, so the check is a trigger. A tag
-- naming a category that does not exist would quietly never be offered to anybody.
create function public.guard_discovery_tag_categories()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare missing text;
begin
  if new.category_keys is not null then
    select k into missing from unnest(new.category_keys) k
      where not exists (select 1 from public.fundraiser_categories c where c.key = k) limit 1;
    if missing is not null then
      raise exception 'discovery_tag_unknown_category' using errcode = '23503',
        hint = 'A discovery tag can only be narrowed to categories the registry holds.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_discovery_tag_categories() from public, anon, authenticated;
create trigger discovery_tags_categories before insert or update on public.discovery_tags
  for each row execute function public.guard_discovery_tag_categories();

insert into public.discovery_tags (key, facet_key, label, help, category_keys, sort) values
  ('travel',           'funding_purpose', 'Travel',                 'Getting the work and the people to where it happens.',    null, 10),
  ('equipment',        'funding_purpose', 'Equipment',              null,                                                      null, 20),
  ('venue',            'funding_purpose', 'Venue or space',         'Hiring a room, a stage, a pitch, a kitchen.',              null, 30),
  ('production',       'funding_purpose', 'Production',             'Building and staging the work itself.',                   null, 40),
  ('paying_people',    'funding_purpose', 'Paying people',          'Fees for the people who do the work.',                    null, 50),
  ('materials',        'funding_purpose', 'Materials and supplies', null,                                                      null, 60),
  ('promotion',        'funding_purpose', 'Promotion and outreach', null,                                                      null, 70),
  ('post_production',  'funding_purpose', 'Recording and post',     'Recording, editing, mixing, finishing.',                  null, 80),
  ('access',           'funding_purpose', 'Access and free places', 'Keeping places open to people who could not pay.',        null, 90),
  ('running_costs',    'funding_purpose', 'Running costs',          'The ordinary cost of keeping the work going.',            null, 100),

  ('live_audience',    'audience_type',   'People there in person', null,                                                      null, 10),
  ('online_audience',  'audience_type',   'An online audience',     'Followers, subscribers and a mailing list.',              null, 20),
  ('local_community',  'audience_type',   'The surrounding community', null,                                                   null, 30),
  ('field_peers',      'audience_type',   'People working in the field', null,                                                 null, 40),
  ('families',         'audience_type',   'Families',               null,                                                      null, 50),
  ('students',         'audience_type',   'Students',               null,                                                      null, 60),
  ('viewers',          'audience_type',   'People who watch the finished work', null,                                          null, 70),
  -- Two tags that are genuinely one category's and are not offered anywhere else.
  ('matchday_crowd',   'audience_type',   'A matchday crowd',       'The people at a fixture, home or away.',    array['sports'],      80),
  ('guests',           'audience_type',   'Guests eating or drinking', 'The people the venue serves.',           array['hospitality'], 90);

-- Reference data, the way fundraiser_categories is (migration 0043): anybody may read the key and
-- the label, nobody may write. A new table is outside the Data API boundary until its grants say
-- otherwise, so this file decides them.
alter table public.discovery_facets enable row level security;
alter table public.discovery_tags enable row level security;
revoke all on public.discovery_facets from public, anon, authenticated;
revoke all on public.discovery_tags   from public, anon, authenticated;
grant select (key, label, prompt, on_fundraiser, on_template, max_tags, sort) on public.discovery_facets to anon, authenticated;
grant select (key, facet_key, label, help, category_keys, active, sort)       on public.discovery_tags   to anon, authenticated;
grant all on public.discovery_facets to service_role;
grant all on public.discovery_tags   to service_role;
create policy "discovery facets" on public.discovery_facets for select to anon, authenticated using (true);
create policy "discovery tags"   on public.discovery_tags   for select to anon, authenticated using (true);

-- ---------------------------------------------------------------
-- 3. One validator, used by every object that carries tags.
--
--    Refuses an unknown key, a duplicate, an empty string, a tag from the wrong facet, a tag this
--    category may not use, a facet this kind of object may not carry, and more than the facet
--    allows. A tag that is already stored and has since been retired is left alone: `previous` is
--    what the row carried before, and only what is newly added is held to `active`.
--
--    Stable and takes no caller-supplied identity: it reads two registry tables and returns
--    nothing. Not security definer, because both registries are readable by every role anyway.
-- ---------------------------------------------------------------
create function public.validate_discovery_tags(
  p_tags text[], p_previous text[], p_category text, p_scope text
) returns void language plpgsql stable set search_path = public, pg_temp as $$
declare t text; tag public.discovery_tags; facet public.discovery_facets; n int;
begin
  if p_tags is null or cardinality(p_tags) = 0 then return; end if;
  if array_ndims(p_tags) <> 1 then
    raise exception 'discovery_tags_shape' using errcode = '23514', hint = 'Discovery tags are a flat list of keys.';
  end if;

  foreach t in array p_tags loop
    if t is null or btrim(t) = '' then
      raise exception 'discovery_tag_empty' using errcode = '23514', hint = 'A discovery tag cannot be blank.';
    end if;
  end loop;

  if cardinality(p_tags) <> (select count(distinct x) from unnest(p_tags) x) then
    raise exception 'discovery_tag_duplicate' using errcode = '23514', hint = 'Each discovery tag may be chosen once.';
  end if;

  foreach t in array p_tags loop
    select * into tag from public.discovery_tags where key = t;
    if not found then
      raise exception 'discovery_tag_unknown' using errcode = '23514',
        hint = 'That is not a discovery tag. The registry decides which keys exist.';
    end if;
    if not tag.active and not (p_previous is not null and t = any(p_previous)) then
      raise exception 'discovery_tag_retired' using errcode = '23514',
        hint = 'That discovery tag is no longer offered. Anything already using it is unchanged.';
    end if;
    if tag.category_keys is not null and not (p_category = any(tag.category_keys)) then
      raise exception 'discovery_tag_category' using errcode = '23514',
        hint = 'That discovery tag belongs to another category.';
    end if;
    select * into facet from public.discovery_facets where key = tag.facet_key;
    if (p_scope = 'fundraiser' and not facet.on_fundraiser) or (p_scope = 'template' and not facet.on_template) then
      raise exception 'discovery_tag_scope' using errcode = '23514',
        hint = 'That kind of discovery tag does not belong on this.';
    end if;
  end loop;

  for facet in select * from public.discovery_facets loop
    select count(*) into n from unnest(p_tags) x
      join public.discovery_tags dt on dt.key = x where dt.facet_key = facet.key;
    if n > facet.max_tags then
      raise exception 'discovery_tag_too_many' using errcode = '23514',
        detail = facet.key, hint = 'Choosing everything is not a filter. Keep it to the few that are true.';
    end if;
  end loop;
end;
$$;
revoke all on function public.validate_discovery_tags(text[], text[], text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 4. What a fundraiser carries.
--
--    discovery_tags       chosen by the organizer, from the registry
--    activity_country_codes  derived from activity_locations, never handed in
--
--    The country list is derived rather than asked for, so it cannot disagree with the locations it
--    came from, and so an online fundraiser with no location simply has none. It is the fundraiser's
--    activity, which is not the organizer's own country (acts.country_code, migration 0038) and not
--    the audience it reaches (the audience facet above). The product contract asks for all three to
--    be kept apart and this is where that becomes a column.
-- ---------------------------------------------------------------
alter table public.runs
  add column discovery_tags text[] not null default '{}',
  add column activity_country_codes text[] not null default '{}';

comment on column public.runs.discovery_tags is
  'Structured discovery keys from public.discovery_tags: what the funding pays for, and who it reaches. Supplements purpose and audience_description; never replaces them. Optional, including for publication.';
comment on column public.runs.activity_country_codes is
  'The countries in activity_locations, normalized, deduplicated and sorted. Derived by guard_fundraiser_foundation and in no write grant. The activity''s countries, not the organizer''s.';

create index runs_discovery_tags_idx on public.runs using gin (discovery_tags);
create index runs_activity_countries_idx on public.runs using gin (activity_country_codes);

-- ---------------------------------------------------------------
-- 5. What a template carries, and what an offer carries.
--
--    Who a placement reaches is a fact about the placement, not about one organizer: a touchline
--    banner is seen by the people at the fixture whoever is selling it. So the audience tags sit on
--    the template, where Door Money writes them once, and no organizer form has to ask.
--
--    What is genuinely the organizer's, and genuinely per offer, is how many people they expect and
--    why they believe it. The contract is explicit that an estimate carries its basis, so the
--    database refuses one without the other. This is discovery metadata and not part of the
--    purchased offer: purchased_offer_of (migration 0045) is untouched and does not read it.
-- ---------------------------------------------------------------
alter table public.surfaces add column discovery_tags text[] not null default '{}';
comment on column public.surfaces.discovery_tags is
  'Who this placement reaches, as public.discovery_tags keys in the audience facet. Door Money''s words about the placement, not an organizer''s claim.';

alter table public.lots
  add column reach_estimate int check (reach_estimate is null or (reach_estimate >= 0 and reach_estimate <= 1000000000)),
  add column reach_basis text check (reach_basis is null or length(btrim(reach_basis)) between 3 and 500),
  add constraint lots_reach_estimate_has_basis check (reach_estimate is null or reach_basis is not null);

comment on column public.lots.reach_estimate is
  'How many people the organizer expects this offer to reach. An estimate, never a measured result and never a guarantee.';
comment on column public.lots.reach_basis is
  'Why the organizer believes that number, in their own words. Required whenever an estimate is given: an estimate with no basis is a claim.';

-- Door Money's suggestion about each placement, from the section it is drawn in, written once.
--
-- A function rather than a list of updates, because the music templates are seeded in
-- supabase/seed.sql and arrive after every migration has run. The trigger below fills an empty
-- array on insert from the same function, so a database built from migrations and a database built
-- from migrations plus the seed end up saying the same thing. A section this has no answer for
-- gets an empty array and waits for somebody to write it words, which is the honest default: what
-- a placement reaches is a fact, not something to guess from its name.
create function public.default_template_discovery_tags(p_group text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_group
    when 'online'    then array['online_audience']
    when 'screen'    then array['viewers']
    when 'community' then array['live_audience','local_community']
    when 'onstage'   then array['live_audience']
    when 'room'      then array['live_audience']
    when 'field'     then array['live_audience']
    when 'venue'     then array['live_audience']
    when 'stage'     then array['live_audience']
    when 'front_of_house'   then array['live_audience']
    when 'screening'        then array['live_audience']
    when 'guest_experience' then array['live_audience']
    when 'space'     then array['live_audience']
    when 'event'     then array['live_audience']
    else '{}'::text[]
  end;
$$;
revoke all on function public.default_template_discovery_tags(text) from public, anon, authenticated;

update public.surfaces set discovery_tags = public.default_template_discovery_tags(group_key);

-- ---------------------------------------------------------------
-- 6. The rules, in the trigger that already holds every other fundraiser rule.
--
--    Replaced whole (migration 0041's body, plus the discovery paragraphs), because that is what
--    `create or replace function` means here and a second trigger would leave the order of two
--    guards to chance.
-- ---------------------------------------------------------------
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

  -- Discovery (migration 0053). Whatever is provided has to be valid, in a draft as much as on a
  -- public page; none of it is required, in either.
  perform public.validate_discovery_tags(
    new.discovery_tags, case when tg_op = 'UPDATE' then old.discovery_tags else null end,
    new.category_key, 'fundraiser');

  -- The activity's countries, from the locations and from nothing else.
  new.activity_country_codes := coalesce((
    select array_agg(distinct upper(btrim(e->>'country_code')) order by upper(btrim(e->>'country_code')))
      from jsonb_array_elements(new.activity_locations) e
     where coalesce(btrim(e->>'country_code'), '') <> ''
  ), '{}'::text[]);

  -- A public fundraiser that names a place says which country it is in. A place with no country is
  -- not a location anybody can search on, and half a fact on a public page is worse than none.
  -- Online-only activity names no place and is unaffected; so is every fundraiser published so far,
  -- because activity_locations has been empty on all of them since migration 0038 added it.
  if new.status <> 'draft' and exists (
    select 1 from jsonb_array_elements(new.activity_locations) e
     where coalesce(e->>'country_code', '') !~ '^[A-Z]{2}$'
  ) then
    raise exception 'discovery_location_country' using errcode = '23514',
      hint = 'Each activity location on a public fundraiser needs a two-letter country code.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_fundraiser_foundation() from public, anon, authenticated;

-- A template's audience tags are Door Money's and are written by Door Money, but they go through
-- the same validator so a bad row cannot be seeded either.
create function public.guard_template_discovery()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- A template inserted with nothing said takes the section's words. An update saying nothing is
  -- taken at its word: clearing the tags on a placement is a decision somebody can make.
  if tg_op = 'INSERT' and coalesce(cardinality(new.discovery_tags), 0) = 0 then
    new.discovery_tags := public.default_template_discovery_tags(new.group_key);
  end if;
  perform public.validate_discovery_tags(
    new.discovery_tags, case when tg_op = 'UPDATE' then old.discovery_tags else null end,
    new.category_key, 'template');
  return new;
end;
$$;
revoke all on function public.guard_template_discovery() from public, anon, authenticated;
create trigger surfaces_discovery before insert or update on public.surfaces
  for each row execute function public.guard_template_discovery();

-- ---------------------------------------------------------------
-- 7. Grants on the new columns, in the file that adds them.
--
--    runs carries a column list (migration 0038 revoked the blanket select), so a new column is
--    unreadable and unwritable from the browser until it is named here.
--
--      discovery_tags          the organizer reads and writes their own
--      activity_country_codes  the organizer reads it; nobody writes it, the trigger does
--
--    anon gets neither. The public discovery surface is the two views below and nothing else, which
--    is narrower than granting more of the table and keeps the public columns in one greppable
--    place. lots keeps its column list from migration 0022 for the same reason.
--
--    surfaces is different and stays different: a template is public by design and the table has
--    carried a blanket select since migration 0001, so surfaces.discovery_tags is readable by
--    everybody the moment it exists. That is the intent; the write grants are revoked again below.
-- ---------------------------------------------------------------
grant select (discovery_tags, activity_country_codes) on public.runs to authenticated;
grant insert (discovery_tags), update (discovery_tags) on public.runs to authenticated;

grant select (reach_estimate, reach_basis) on public.lots to anon, authenticated;
grant insert (reach_estimate, reach_basis), update (reach_estimate, reach_basis) on public.lots to authenticated;

revoke insert, update, delete, truncate on public.surfaces from anon, authenticated;

-- ---------------------------------------------------------------
-- 8. The public discovery surface: two read-only views, and that is all of it.
--
--    Built `with (security_invoker = false)`, like every other public view here, so they can select
--    past row level security. That also means a write through one would reach the base table with
--    row level security switched off, which is why every write is revoked and never granted back
--    (migration 0030). The default privileges set there already revoke them; said again anyway, so
--    the file that creates a view also says what the browser may do with it.
--
--    Nothing in either view names a patron, a bid, an amount anybody paid, a fee, a Stripe id, an
--    evidence item or a delivery state. Drafts are excluded by status, not by a column list.
-- ---------------------------------------------------------------
create view public.public_fundraiser_discovery with (security_invoker = false) as
  select r.id,
         r.slug,
         a.slug as organizer_slug,
         r.title,
         r.category_key,
         r.status,
         r.activity_mode,
         r.activity_locations,
         r.activity_country_codes,
         r.discovery_tags,
         r.fundraising_starts_on,
         r.fundraising_ends_on,
         r.created_at
    from public.runs r
    join public.acts a on a.id = r.act_id
   where r.status in ('open','live','closed');

comment on view public.public_fundraiser_discovery is
  'Read-only. The structured facts a published fundraiser offers discovery, and nothing else. Drafts are excluded by status. The prose fields stay on runs and are read the way they always were.';

create view public.public_opportunity_discovery with (security_invoker = false) as
  select l.id,
         l.run_id,
         r.slug as fundraiser_slug,
         a.slug as organizer_slug,
         r.category_key,
         coalesce(l.label, s.name) as name,
         s.name as template_name,
         s.seen_by as description,
         l.price_cents,
         l.mode,
         l.buy_now_cents,
         l.closes_at,
         l.status,
         s.discovery_tags as audience_tags,
         l.reach_estimate,
         l.reach_basis,
         l.created_at
    from public.lots l
    join public.runs r on r.id = l.run_id
    join public.acts a on a.id = r.act_id
    join public.surfaces s on s.key = l.surface_key
   where r.status in ('open','live')
     and l.status = 'open';

comment on view public.public_opportunity_discovery is
  'Read-only. Sponsorship options a sponsor could buy right now: open options on an open or live fundraiser. price_cents is the fixed price or the reserve, the same column either way; mode says which. No bid, no buyer, no fee.';

revoke all on public.public_fundraiser_discovery  from public, anon, authenticated;
revoke all on public.public_opportunity_discovery from public, anon, authenticated;
grant select on public.public_fundraiser_discovery  to anon, authenticated;
grant select on public.public_opportunity_discovery to anon, authenticated;

-- ---------------------------------------------------------------
-- 9. Nothing here opened a category, a policy or a payment.
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fundraiser_categories where key in ('hospitality','other') and publish_enabled) then
    raise exception '0053 must not enable publishing for a draft-only category.';
  end if;
  if exists (select 1 from public.delivery_policies where category_key in ('hospitality','other')) then
    raise exception '0053 must not give a draft-only category a delivery policy.';
  end if;
end $$;

commit;
