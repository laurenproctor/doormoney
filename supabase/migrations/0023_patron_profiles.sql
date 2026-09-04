-- Optional public patron profiles.
--
-- A patron may show who they are and some of what they have put behind musicians. Everything here
-- is off until the patron turns it on, twice over: the profile itself is unpublished, and every
-- placement and backing is invisible until that one row is ticked. Turning one on turns nothing
-- else on. No amount ever reaches a public column. See docs/DECISIONS.md, decision 11.
--
-- The username is the address (doormoney.com/patron/<username>), the same word that is a
-- musician's board address, out of the same namespace. It can move once every twelve months, and
-- the word it leaves behind is kept for good so nobody else can pick it up and inherit the links.

-- ---------------------------------------------------------------
-- When the current username was claimed. The twelve months run from here.
-- ---------------------------------------------------------------
alter table profiles add column if not exists username_set_at timestamptz;

comment on column profiles.username_set_at is
  'When the current username was claimed. The next change is allowed twelve calendar months after it.';

-- Accounts that already hold a username get the birthday of the account, which is the closest
-- honest answer: nothing recorded when the word was taken, because nothing could change it before.
update profiles set username_set_at = created_at
 where username is not null and username_set_at is null;

-- profiles.public_profile came in with 0021 as a placeholder and was never read. Publication now
-- lives on patron_profiles.published, which is the row that knows what publishing would show. The
-- column stays for now rather than being dropped under a running deployment; nothing reads it.
comment on column profiles.public_profile is
  'Superseded by patron_profiles.published (migration 0023). Unused.';

-- ---------------------------------------------------------------
-- Retired usernames, kept for good.
--
-- Two jobs. A word somebody has used is never handed to a stranger, because the links to it are
-- still out there. And an old address still knows where its owner went, so /patron/<old> and
-- /board/<old> can send a visitor on to the current one.
-- ---------------------------------------------------------------
create table if not exists username_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  username text not null unique,
  retired_at timestamptz not null default now()
);
create index if not exists username_history_profile_idx on username_history (profile_id);

alter table username_history enable row level security;
-- No client policies. Redirects are looked up on the server; a browser has no business reading
-- the map from an old word to an account.

-- ---------------------------------------------------------------
-- The profile itself. One per account, and only when the patron asks for one.
-- ---------------------------------------------------------------
create table if not exists patron_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  display_name text not null,
  bio text,
  location text,
  website text,
  interests text[] not null default '{}',
  -- Object path in the private patron-photos bucket. Never a URL: the page signs one per view.
  photo_path text,
  published boolean not null default false,
  published_at timestamptz,
  patron_since timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table patron_profiles is
  'The optional public page a patron may keep. Private until published, and holding no amounts, no email address and no payment detail.';

-- Music preferences: up to eight, each one short, none blank, none said twice. A check constraint
-- cannot hold a subquery, so the rule lives in one immutable function and is called from the check.
create or replace function public.interests_ok(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(p, 1), 0) <= 8
     and not exists (
       select 1 from unnest(coalesce(p, '{}'::text[])) as i
        where btrim(i) = '' or char_length(i) > 40
     )
     and (
       select count(distinct lower(btrim(i))) from unnest(coalesce(p, '{}'::text[])) as i
     ) = coalesce(array_length(p, 1), 0);
$$;

alter table patron_profiles drop constraint if exists patron_profiles_display_name_len;
alter table patron_profiles add constraint patron_profiles_display_name_len
  check (char_length(btrim(display_name)) between 2 and 60);
alter table patron_profiles drop constraint if exists patron_profiles_bio_len;
alter table patron_profiles add constraint patron_profiles_bio_len
  check (bio is null or char_length(bio) <= 240);
alter table patron_profiles drop constraint if exists patron_profiles_location_len;
alter table patron_profiles add constraint patron_profiles_location_len
  check (location is null or char_length(location) <= 80);
-- Only a plain https address ever reaches an href on the public page.
alter table patron_profiles drop constraint if exists patron_profiles_website_shape;
alter table patron_profiles add constraint patron_profiles_website_shape
  check (website is null or website ~ '^https://[^\s/?#]+\.[^\s/?#]+');
alter table patron_profiles drop constraint if exists patron_profiles_interests_ok;
alter table patron_profiles add constraint patron_profiles_interests_ok
  check (public.interests_ok(interests));
-- A published profile has a moment it went up.
alter table patron_profiles drop constraint if exists patron_profiles_published_at_present;
alter table patron_profiles add constraint patron_profiles_published_at_present
  check (not published or published_at is not null);

alter table patron_profiles enable row level security;

-- An account reads and writes its own profile and nobody else's. The public page never touches
-- this table: it reads the sanitised view below, which carries no email address and no account id.
drop policy if exists "own patron profile" on patron_profiles;
create policy "own patron profile" on patron_profiles
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- ---------------------------------------------------------------
-- What the patron has chosen to show. One row per published placement or backing.
--
-- Absence is the default and means private, so a new profile shows nothing, an account that
-- never comes here shows nothing, and deleting a row hides that one thing and only that one.
-- ---------------------------------------------------------------
create table if not exists patron_profile_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  purchase_id uuid references purchases(id) on delete cascade,
  backing_id uuid references backings(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((purchase_id is not null) <> (backing_id is not null))
);

comment on table patron_profile_items is
  'Per-activity opt-in. A row here means this one placement or backing may appear on this patron''s public page. No row means it may not.';

create unique index if not exists patron_profile_items_purchase_idx on patron_profile_items (purchase_id) where purchase_id is not null;
create unique index if not exists patron_profile_items_backing_idx on patron_profile_items (backing_id) where backing_id is not null;
create index if not exists patron_profile_items_profile_idx on patron_profile_items (profile_id);

alter table patron_profile_items enable row level security;

drop policy if exists "own profile items" on patron_profile_items;
create policy "own profile items" on patron_profile_items
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- ---------------------------------------------------------------
-- What the public may read.
--
-- profiles holds email addresses, so it is never opened up. These two views run as their owner,
-- like lot_buyers and run_backers before them, and select only the columns a visitor may see.
-- The account id is not among them: the views are keyed by username, which is the public word.
-- ---------------------------------------------------------------
drop view if exists public_patron_profiles;
create view public_patron_profiles with (security_invoker = false) as
  select
    p.username,
    pp.display_name,
    pp.bio,
    pp.location,
    pp.website,
    pp.interests,
    pp.photo_path,
    pp.patron_since,
    pp.published_at
  from patron_profiles pp
  join profiles p on p.id = pp.profile_id
  where pp.published and p.username is not null;

grant select on public_patron_profiles to anon, authenticated;

-- The activity a patron has published, and nothing else about it. No amount, no payment status,
-- no email address, no mark, no record link, no transaction id.
--
-- Anonymity survives publication. A spot won through a bid the patron asked to keep anonymous is
-- not here at all, whatever they tick: an anonymous bid stays anonymous everywhere it already is.
drop view if exists public_patron_activity;
create view public_patron_activity with (security_invoker = false) as
  select
    p.username,
    'placement'::text as kind,
    a.name as act_name,
    a.slug as act_slug,
    r.title as run_title,
    r.status::text as run_status,
    coalesce(l.label, s.name) as detail,
    pu.created_at as supported_at
  from patron_profile_items i
  join profiles p on p.id = i.profile_id
  join patron_profiles pp on pp.profile_id = i.profile_id
  join purchases pu on pu.id = i.purchase_id
  join lots l on l.id = pu.lot_id
  join surfaces s on s.key = l.surface_key
  join runs r on r.id = l.run_id
  join acts a on a.id = r.act_id
  where pp.published
    and p.username is not null
    and pu.payment_status in ('held', 'released', 'partially_refunded')
    and not exists (
      select 1 from bids b
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
    bk.created_at as supported_at
  from patron_profile_items i
  join profiles p on p.id = i.profile_id
  join patron_profiles pp on pp.profile_id = i.profile_id
  join backings bk on bk.id = i.backing_id
  join runs r on r.id = bk.run_id
  join acts a on a.id = r.act_id
  where pp.published
    and p.username is not null
    and bk.payment_status in ('held', 'released', 'partially_refunded');

grant select on public_patron_activity to anon, authenticated;

-- ---------------------------------------------------------------
-- Claiming and changing the username, in one transaction.
--
-- Every rule that matters is here rather than in the form: one word across profiles and acts, one
-- change a year, retired words never reissued, and a musician's board address moving with their
-- handle so the one-word promise holds. An advisory lock on the word itself serialises two
-- requests racing for it, so the check and the write cannot be split by a second claimant.
-- ---------------------------------------------------------------
create or replace function public.claim_username(p_user_id uuid, p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_set_at timestamptz;
  v_act_id uuid;
begin
  if p_username is null or p_username !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$' then
    return 'invalid';
  end if;

  -- Serialise every claim on this word. Held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtext('doormoney.username:' || p_username));

  select username, username_set_at into v_current, v_set_at
    from profiles where id = p_user_id for update;
  if not found then
    return 'no_account';
  end if;

  -- Already theirs. Saying the same word again is not a change and does not restart the year.
  if v_current is not distinct from p_username then
    return 'ok';
  end if;

  if v_current is not null then
    perform pg_advisory_xact_lock(hashtext('doormoney.username:' || v_current));
    if v_set_at is not null and now() < v_set_at + interval '12 months' then
      return 'too_soon';
    end if;
  end if;

  -- Held by another account, as a handle or as a board address, or retired by one before.
  if exists (select 1 from profiles where username = p_username and id <> p_user_id)
     or exists (select 1 from acts where slug = p_username and owner_id is distinct from p_user_id)
     or exists (select 1 from username_history where username = p_username and profile_id <> p_user_id)
  then
    return 'taken';
  end if;

  if v_current is not null then
    insert into username_history (profile_id, username)
    values (p_user_id, v_current)
    on conflict (username) do nothing;
  end if;

  update profiles set username = p_username, username_set_at = now() where id = p_user_id;

  -- One word, both addresses. An account with an act moves its board in the same transaction, so
  -- the pair can never drift; the word it left behind redirects, because it is in the history now.
  select id into v_act_id from acts where owner_id = p_user_id order by created_at limit 1;
  if v_act_id is not null then
    update acts set slug = p_username where id = v_act_id;
  end if;

  return 'ok';
exception
  when unique_violation then
    return 'taken';
end;
$$;

revoke all on function public.claim_username(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_username(uuid, text) to service_role;

-- ---------------------------------------------------------------
-- Profile photos.
--
-- A private bucket, so hiding a profile hides its photograph too: nothing is readable without a
-- signed URL, and the server only signs one for a profile that is published (or for the patron
-- looking at their own). Paths are scoped to the account and carry a random name, so knowing one
-- photo never leads to another. No storage policy is added, which leaves the bucket closed to
-- anon and authenticated alike; reads and writes go through the service role on the server.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patron-photos', 'patron-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
