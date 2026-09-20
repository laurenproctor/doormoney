-- A sponsorship opportunity belongs to its fundraiser's category, and the database says so.
--
-- Migration 0040 gave every option a category. Nothing checked it. lots.surface_key is a foreign
-- key to any option at all, and the save action walked the whole catalog whatever the fundraiser
-- was, so a crafted form could put a kick drum head on a theater production, or a jersey front on
-- a tour. The page would then promise a sponsor something the organizer's category cannot deliver.
--
-- Three things, kept apart because they are different things (docs/PRODUCT_CONTRACT.md):
--   a template        surfaces   what Door Money suggests: a name, where it is seen, maybe a price
--   an opportunity    lots       what one organizer chose to offer, at their own price
--   a purchased offer purchases  what one sponsor bought, at the lot's offer_version (0035)
--
-- This migration works on the first two and leaves the third alone. Nothing here touches purchases,
-- bids, payout_schedule, amounts, fees or a single Stripe id. Every existing lot is a music option on
-- a music fundraiser, so every existing lot already passes the rule being added.
--
-- Numbered 0044: 0043 (neutral profiles) is applied to the hosted project and lives on its own
-- branch. The two touch different tables and neither depends on the other.
begin;

-- ---------------------------------------------------------------
-- 0. Refuse to install a rule the data already breaks.
--
--    A guard added over rows that violate it would sit there looking enforced. If this raises, the
--    rows it names need a person: which category was meant is not something to guess.
-- ---------------------------------------------------------------
do $$
declare bad int;
begin
  select count(*) into bad
    from public.lots l
    join public.surfaces s on s.key = l.surface_key
    join public.runs r on r.id = l.run_id
   where s.category_key <> r.category_key;
  if bad > 0 then
    raise exception '% existing lots name an option from a different category than their fundraiser. Resolve them by hand before applying 0044.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------
-- 1. Templates say what they are, and can be retired without being deleted.
--
--    A lot keeps a foreign key to its option for good, so an option can never be dropped once it
--    has been offered. Retiring one takes it off the list for new opportunities and leaves every
--    existing lot, purchase and record reading exactly as it did.
-- ---------------------------------------------------------------
alter table public.surfaces
  add column active boolean not null default true,
  add column version int not null default 1 check (version >= 1);

comment on table public.surfaces is
  'Sponsorship option templates, per category. A template suggests; it never promises. The organizer''s lot is the offer.';
comment on column public.surfaces.active is
  'Whether new opportunities may be made from this template. False retires it without touching lots that already use it.';
comment on column public.surfaces.version is
  'Bumped when a template''s words change, so an opportunity can say which wording its organizer chose from.';
comment on column public.surfaces.group_key is
  'The section an option is drawn in. Free text on purpose: a new category brings its own sections without a schema change.';

-- ---------------------------------------------------------------
-- 2. What the organizer chose from, recorded when they chose it.
--
--    A lot points at its template by key, so rewording the template would silently reword every
--    opportunity already offered under it, and later every purchase. The snapshot is the template
--    as it stood when this opportunity was made. Phase 4 builds the purchased-offer snapshot from
--    it; nothing reads it yet, which is the point of adding it before anything can be bought.
--
--    Written by the trigger below and by nothing else: it is in no insert or update grant, so an
--    organizer cannot hand in a snapshot of a template they never chose from.
-- ---------------------------------------------------------------
alter table public.lots add column template_snapshot jsonb;

comment on column public.lots.template_snapshot is
  'The template as it stood when the organizer made this opportunity. Set by guard_lot_category, never by a client. Suggested price included for the record only: lots.price_cents is the price.';
comment on column public.lots.price_cents is
  'The organizer''s own price: fixed price, or the reserve for bidding. Always wins over any suggested price.';
comment on column public.lots.mode is
  'How the opportunity is sold: fixed price or bidding. A sale method, never a category.';

create function public.template_snapshot_of(s public.surfaces)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'key', s.key, 'version', s.version, 'category_key', s.category_key, 'name', s.name,
    'group_key', s.group_key, 'default_period', s.default_period, 'seen_by', s.seen_by,
    'suggested_price_cents', s.default_price_cents);
$$;
revoke all on function public.template_snapshot_of(public.surfaces) from public, anon, authenticated;

-- Existing lots get the template as it stands today, and say that is what it is. No template's
-- words have changed since it was seeded (tests/catalog.test.ts holds the two copies equal), so
-- this is the wording those organizers chose from. The flag keeps it honest all the same.
update public.lots l
   set template_snapshot = public.template_snapshot_of(s) || jsonb_build_object('backfilled', true)
  from public.surfaces s
 where s.key = l.surface_key and l.template_snapshot is null;

-- ---------------------------------------------------------------
-- 3. The rule itself.
--
--    Security definer because it has to read a fundraiser's category whoever is writing the lot,
--    including an owner whose column grants never covered runs.category_key by that path. It takes
--    no caller-supplied identity and returns no rows: it compares two keys and refuses.
--
--    The error names no category and no fundraiser beyond the ones the caller already sent.
-- ---------------------------------------------------------------
create function public.guard_lot_category()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare tmpl public.surfaces; run_category text;
begin
  select * into tmpl from public.surfaces where key = new.surface_key;
  if not found then raise exception 'unknown sponsorship option' using errcode = '23503'; end if;
  select category_key into run_category from public.runs where id = new.run_id;
  if not found then raise exception 'unknown fundraiser' using errcode = '23503'; end if;

  if tmpl.category_key <> run_category then
    raise exception 'opportunity_category_mismatch' using errcode = '23514',
      hint = 'A sponsorship option can only be offered on a fundraiser in its own category.';
  end if;

  -- A retired template cannot start a new opportunity. One already offered keeps working: its
  -- price can still change, it can still sell, and its record still reads.
  if not tmpl.active and (tg_op = 'INSERT' or new.surface_key is distinct from old.surface_key) then
    raise exception 'sponsorship_option_retired' using errcode = '23514',
      hint = 'This option is no longer offered for new sponsorships.';
  end if;

  if tg_op = 'INSERT' or new.surface_key is distinct from old.surface_key then
    new.template_snapshot := public.template_snapshot_of(tmpl);
  else
    -- Nobody edits what they chose from, whatever role they hold.
    new.template_snapshot := old.template_snapshot;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_lot_category() from public, anon, authenticated;

-- "lots_category" sorts before "lots_terms_frozen" (0035), so a lot that is both mismatched and
-- frozen is refused for the category first. Either way it is refused.
create trigger lots_category before insert or update on public.lots
  for each row execute function public.guard_lot_category();

-- ---------------------------------------------------------------
-- 4. The other two ways the pair could drift apart.
--
--    A fundraiser cannot change category once it has lots: migration 0038 already refuses that in
--    guard_fundraiser_foundation. A template must not change category under lots that use it.
-- ---------------------------------------------------------------
create function public.guard_template_category()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.category_key is distinct from old.category_key
     and exists (select 1 from public.lots where surface_key = old.key) then
    raise exception 'a sponsorship option in use cannot move to another category' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_template_category() from public, anon, authenticated;
create trigger surfaces_category_in_use before update of category_key on public.surfaces
  for each row execute function public.guard_template_category();

-- ---------------------------------------------------------------
-- 5. Grants, in the file that adds the columns.
--
--    surfaces.active and surfaces.version are public: a template is public, and the editor reads
--    both. lots carries a column list (0022), so template_snapshot is unreadable and unwritable
--    from the browser until it is named, and it is deliberately not named. Phase 4 decides who may
--    read the purchased-offer snapshot built from it.
-- ---------------------------------------------------------------
revoke insert, update, delete, truncate on public.surfaces from anon, authenticated;

create index lots_surface_idx on public.lots(surface_key);

commit;
