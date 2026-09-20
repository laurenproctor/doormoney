-- Neutral organizer and patron profiles.
--
-- Migration 0038 let an organizer exist without a music act type, and 0041 let a fundraiser outside
-- music publish. Neither gave the profile anything else to say about itself, so a theater company's
-- public page had a name and a bio and nothing that was not a music field. The patron side had the
-- same gap from the other direction: a profile could only be a person with music preferences.
--
-- Everything here is additive. No existing column is renamed, retyped or backfilled with a guess,
-- and no category is written onto a profile: category belongs to the fundraiser (decision 17).
-- What a profile may say is what it is, where it is, who it reaches and where else to find it.
--
-- Nothing here assumes an account owns exactly one organizer profile. acts_one_per_owner (0022)
-- still holds that today and this migration neither relies on it nor adds to it. Whether it stays
-- is decision 20, and it is open.
begin;

-- ---------------------------------------------------------------
-- 1. Links, shared by both kinds of profile.
--
--    Up to six, each a label and a plain https address. Checked here rather than only in the form,
--    for the reason migration 0024 gives for interests_ok: a form is a courtesy and a constraint
--    is the rule. plpgsql so each step can refuse a shape before the next one reads it.
-- ---------------------------------------------------------------
create function public.profile_links_ok(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 6 then return false; end if;
  for item in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(item) as k where k not in ('label','url')) > 0 then return false; end if;
    if jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'url') is distinct from 'string' then return false; end if;
    if char_length(item->>'label') > 40 or char_length(item->>'url') > 200 then return false; end if;
    -- The same shape patron_profiles.website is held to: only a plain https address reaches an href.
    if (item->>'url') !~ '^https://[^\s/?#]+\.[^\s/?#]+' then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.profile_links_ok(jsonb) from public;
grant execute on function public.profile_links_ok(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. The organizer profile. Still the acts table, still the same ids, slugs and owners.
--
--    entity_kind says what the organizer is, not what they raise money for. It is null for every
--    existing row: a soloist is probably a person and a band is probably a group, and "probably"
--    is a guess. acts.type stays exactly as it is, as music's own field.
-- ---------------------------------------------------------------
alter table public.acts
  add column entity_kind text check (entity_kind in
    ('person','group','team','company','collective','nonprofit','production_company','school','other')),
  add column audience_description text check (length(audience_description) <= 600),
  add column links jsonb not null default '[]' check (public.profile_links_ok(links));

comment on column public.acts.entity_kind is
  'What the organizer is: a person, a team, a company. Never a category, and never authorization.';
comment on column public.acts.audience_description is
  'The audience or community the organizer reaches, in their own words. Optional.';
comment on column public.acts.links is
  'Up to six {label,url} links, https only. acts.website and acts.instagram are unchanged.';
comment on column public.acts.type is
  'Music act type. Null for an organizer with no music act. Not a category and not an entity kind.';

-- Grants on acts are column lists (0022), so a new column is unreachable until it is named.
-- The owner may write all three. Row level security already scopes the write to their own row.
grant insert (entity_kind, audience_description, links), update (entity_kind, audience_description, links)
  on public.acts to authenticated;
-- Migration 0038 kept region and country_code private "until the category-aware public profiles
-- are implemented". This is that. Rows are still decided by the "public read acts" policy (0041):
-- a music act, or an organizer with a published fundraiser. A profile with neither stays unseen.
grant select (region, country_code, entity_kind, audience_description, links) on public.acts to anon;
grant select (entity_kind, audience_description, links) on public.acts to authenticated;

-- ---------------------------------------------------------------
-- 3. The patron profile. A person or an organization, without asking a person business questions:
--    profile_kind is optional and null means nobody said.
-- ---------------------------------------------------------------
alter table public.patron_profiles
  add column profile_kind text check (profile_kind in
    ('individual','business','brand','nonprofit','community','other')),
  add column links jsonb not null default '[]' check (public.profile_links_ok(links));

comment on column public.patron_profiles.profile_kind is
  'What the patron is: an individual, a business, a brand. Optional, and never a payment identity.';
comment on column public.patron_profiles.interests is
  'Interests in the patron''s own words. Rows saved before migration 0043 were asked for as music preferences and are kept as typed; they are not categories.';

-- 0029 took every browser write off this table and left a column list to read. Same rule here.
grant select (profile_kind, links) on public.patron_profiles to authenticated;

-- ---------------------------------------------------------------
-- 4. The categories a patron is open to supporting.
--
--    A table rather than a text[] so the registry decides what a category is: a key that is not in
--    fundraiser_categories cannot be stored, and a fifth category needs no change here. Kept apart
--    from interests on purpose. "Jazz" typed in 2026 is not a vote for the music category, and
--    reading it as one would be a silent conversion.
-- ---------------------------------------------------------------
create table public.patron_profile_categories (
  profile_id uuid not null references public.patron_profiles(profile_id) on delete cascade,
  category_key text not null references public.fundraiser_categories(key),
  created_at timestamptz not null default now(),
  primary key (profile_id, category_key)
);
comment on table public.patron_profile_categories is
  'Per-patron category preferences. Descriptive only: a row here grants nothing and buys nothing.';

alter table public.patron_profile_categories enable row level security;
-- The patron reads their own and writes nothing, the way patron_profiles works since 0029: the
-- server action writes with the service role after it has proven the session.
revoke all on public.patron_profile_categories from public, anon, authenticated;
grant select on public.patron_profile_categories to authenticated;
grant all on public.patron_profile_categories to service_role;
create policy "own supported categories" on public.patron_profile_categories
  for select to authenticated using (auth.uid() = profile_id);

-- ---------------------------------------------------------------
-- 5. What the public may read.
--
--    Both views keep every column they had, in the same order, and gain theirs at the end, which
--    is what lets them be replaced rather than dropped under a running deployment. security_invoker
--    is restated because a replace takes the options it is given and no others.
--
--    Still no amount, no email address, no Stripe id, no payment status and no account id. The
--    category labels come from the registry, which anon cannot read directly and does not need to.
-- ---------------------------------------------------------------
create or replace view public.public_patron_profiles with (security_invoker = false) as
  select
    p.username,
    pp.display_name,
    pp.bio,
    pp.location,
    pp.website,
    pp.interests,
    pp.photo_path,
    pp.patron_since,
    pp.published_at,
    pp.profile_kind,
    pp.links,
    coalesce((select array_agg(c.key order by c.key)
                from public.patron_profile_categories pc
                join public.fundraiser_categories c on c.key = pc.category_key
               where pc.profile_id = pp.profile_id), '{}'::text[]) as category_keys,
    coalesce((select array_agg(c.label order by c.key)
                from public.patron_profile_categories pc
                join public.fundraiser_categories c on c.key = pc.category_key
               where pc.profile_id = pp.profile_id), '{}'::text[]) as category_labels
  from public.patron_profiles pp
  join public.profiles p on p.id = pp.profile_id
  where pp.published and p.username is not null;

-- The fundraiser's category, so the page can say "team" where it used to say "musician" for
-- everything. Public already: 0041 grants runs.category_key to anon for published fundraisers.
create or replace view public.public_patron_activity with (security_invoker = false) as
  select
    p.username,
    'placement'::text as kind,
    a.name as act_name,
    a.slug as act_slug,
    r.title as run_title,
    r.status::text as run_status,
    coalesce(l.label, s.name) as detail,
    pu.created_at as supported_at,
    r.category_key
  from public.patron_profile_items i
  join public.profiles p on p.id = i.profile_id
  join public.patron_profiles pp on pp.profile_id = i.profile_id
  join public.purchases pu on pu.id = i.purchase_id
  join public.lots l on l.id = pu.lot_id
  join public.surfaces s on s.key = l.surface_key
  join public.runs r on r.id = l.run_id
  join public.acts a on a.id = r.act_id
  where pp.published
    and p.username is not null
    and pu.payment_status in ('held', 'released', 'partially_refunded')
    and not exists (
      select 1 from public.bids b
       where b.lot_id = l.id and b.patron_id = pu.patron_id and b.anonymous
    )
  union all
  select
    p.username,
    'backing'::text as kind,
    a.name as act_name,
    a.slug as act_slug,
    r.title as run_title,
    r.status::text as run_status,
    bk.tier as detail,
    bk.created_at as supported_at,
    r.category_key
  from public.patron_profile_items i
  join public.profiles p on p.id = i.profile_id
  join public.patron_profiles pp on pp.profile_id = i.profile_id
  join public.backings bk on bk.id = i.backing_id
  join public.runs r on r.id = bk.run_id
  join public.acts a on a.id = r.act_id
  where pp.published
    and p.username is not null
    and bk.payment_status in ('held', 'released', 'partially_refunded');

-- A view is a read path and never a write path (0030). A replace keeps the grants it had; these
-- are stated again so the file that reshapes a view also says what the browser may do with it.
revoke insert, update, delete, truncate on public.public_patron_profiles from anon, authenticated;
revoke insert, update, delete, truncate on public.public_patron_activity from anon, authenticated;
grant select on public.public_patron_profiles to anon, authenticated;
grant select on public.public_patron_activity to anon, authenticated;

-- ---------------------------------------------------------------
-- 6. Category names, for public pages.
--
--    An organizer's page now lists fundraisers in more than one category and has to name each
--    one. The name comes from the registry rather than from a second list in TypeScript, so a
--    fifth category is named correctly the day it is inserted. Two columns and no more: whether a
--    category may draft or publish, and which detail keys it allows, stay with signed-in accounts.
-- ---------------------------------------------------------------
grant select (key, label) on public.fundraiser_categories to anon;
create policy "category names" on public.fundraiser_categories for select to anon using (true);

commit;
