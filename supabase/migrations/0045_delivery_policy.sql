-- Delivery and release, without the logo as everybody's definition of "delivered".
--
-- docs/DELIVERY_POLICY_MATRIX.md is the policy. This is the part of it a database can hold:
--
--   delivery_policies    which rules a category sells under, by version, and whether the owner has
--                        switched that version on
--   purchase_snapshots   what one sponsor bought, as it stood when they bought it, and the policy
--                        version they bought it under. Written once, by a trigger. Never edited.
--   deliverables         what the organizer owes on that purchase
--   evidence             the organizer's documentation that a deliverable happened. Private unless
--                        the organizer publishes that one item.
--
-- Music is not changed. Its policy, version 1, is a description of what the code already does:
-- weekly slices across the fundraiser's dates, held until the sponsor's materials are accepted
-- (migration 0031). A music purchase gets a snapshot and gets no deliverable rows, so nothing
-- about how or when music is paid moves. Decision 19 is decided and unbuilt, and stays unbuilt here.
--
-- Sports, film and theater get version 1 as 'proposed': usable in Stripe's test mode, and not a
-- policy the owner has switched on. Their release rule is evidence, not a calendar, which is the
-- owner's answer of 2026-09-20. The materials gate from 0031 is reused as it stands, because
-- purchases.mark_status has always meant "the organizer accepted what the sponsor sent", and
-- mark_text has always allowed that to be a name with no logo at all.
--
-- Numbered 0045: 0043 and 0044 are applied to the hosted project and live on their own branches.
-- Nothing here reads a column they add. The snapshot picks up lots.template_snapshot (0044) where
-- it exists and builds the same thing from the template row where it does not.
begin;

-- ---------------------------------------------------------------
-- 1. Policies. A registry, like fundraiser_categories: a fifth category needs a row, not a release.
-- ---------------------------------------------------------------
create table public.delivery_policies (
  category_key text not null references public.fundraiser_categories(key),
  version int not null check (version >= 1),
  -- proposed: usable in test mode, not switched on. active: the owner has switched it on.
  status text not null default 'proposed' check (status in ('proposed','active','retired')),
  -- calendar: equal weekly slices across the fundraiser's dates. evidence: released as deliverables
  -- are documented. Both wait for the sponsor's materials to be accepted (migration 0031).
  release_rule text not null check (release_rule in ('calendar','evidence')),
  materials_window_days int not null default 14 check (materials_window_days between 1 and 365),
  -- The matrix's other cells, in words, as the purchase was sold under them.
  terms jsonb not null default '{}' check (jsonb_typeof(terms) = 'object'),
  created_at timestamptz not null default now(),
  primary key (category_key, version)
);
comment on table public.delivery_policies is
  'The delivery and release rules a category sells under, by version. A purchase records its version for good. See docs/DELIVERY_POLICY_MATRIX.md.';

alter table public.delivery_policies enable row level security;
revoke all on public.delivery_policies from public, anon, authenticated;
-- The terms somebody buys under are public. Nothing here is writable from a browser.
grant select on public.delivery_policies to anon, authenticated;
grant all on public.delivery_policies to service_role;
create policy "policies are public" on public.delivery_policies for select to anon, authenticated using (true);

insert into public.delivery_policies (category_key, version, status, release_rule, terms) values
 ('music', 1, 'active', 'calendar', jsonb_build_object(
    'summary', 'Music as built: weekly release across the fundraiser''s dates, held until the sponsor''s name or logo is accepted.',
    'materials', 'A name or logo. One reminder three days after payment.',
    'approval', 'The musician accepts or declines the name or logo.',
    'release', 'Equal Friday slices across the fundraiser''s dates, once the materials are accepted.',
    'evidence', 'What the musician chose for the fundraiser. Organizer-supplied.',
    'organizer_cancellation', 'Every unreleased share is refunded, fee included on that share.',
    'sponsor_cancellation', 'Not offered. A sponsor may flag a placement.',
    'unresolved_materials', 'Held. Open: decision 16.',
    'missed_goal', 'No effect on a purchased sponsorship.')),
 ('sports', 1, 'proposed', 'evidence', '{}'),
 ('film', 1, 'proposed', 'evidence', '{}'),
 ('theater', 1, 'proposed', 'evidence', '{}');
update public.delivery_policies set terms = jsonb_build_object(
    'summary', 'Held until delivered. Released as the organizer documents each deliverable.',
    'materials', 'Whatever the opportunity needs: artwork, a credit line, a name, a product. Due within the materials window.',
    'approval', 'The organizer accepts or declines the materials once. Accepting is not delivery.',
    'release', 'The organizer''s share is released as each deliverable has evidence attached, once the materials are accepted. Never on a calendar.',
    'evidence', 'Organizer-supplied. Private to the sponsor, the organizer and Door Money unless the organizer publishes that item.',
    'organizer_cancellation', 'Every unreleased share is refunded, fee included on that share.',
    'sponsor_cancellation', 'A full refund until the materials are accepted. Not offered after.',
    'unresolved_materials', 'Held. Open: decision 16.',
    'missed_goal', 'No effect on a purchased sponsorship.')
 where release_rule = 'evidence';

-- The policy a new purchase in this category is sold under: the newest one not retired.
create function public.current_delivery_policy(p_category text)
returns public.delivery_policies language sql stable set search_path = '' as $$
  select * from public.delivery_policies
   where category_key = p_category and status <> 'retired'
   order by version desc limit 1;
$$;
revoke all on function public.current_delivery_policy(text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 2. What was bought, as it stood. One row per purchase, for good.
-- ---------------------------------------------------------------
create table public.purchase_snapshots (
  purchase_id uuid primary key references public.purchases(id) on delete cascade,
  policy_category text not null,
  policy_version int not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  backfilled boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (policy_category, policy_version) references public.delivery_policies(category_key, version)
);
comment on table public.purchase_snapshots is
  'The purchased offer and its policy version, written once when the purchase is made. Editing a fundraiser, a profile, a template or a price never reaches it.';

alter table public.purchase_snapshots enable row level security;
-- Holds what somebody paid. Read on the server with the service role, like purchases itself.
revoke all on public.purchase_snapshots from public, anon, authenticated;
grant select, insert on public.purchase_snapshots to service_role;

create function public.purchased_offer_of(p_purchase public.purchases)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'amount_cents', p_purchase.amount_cents,
    'fee_cents', p_purchase.fee_cents,
    'opportunity', jsonb_build_object(
      'lot_id', l.id, 'label', l.label, 'template_key', l.surface_key, 'price_cents', l.price_cents,
      'sale_method', l.mode, 'buy_now_cents', l.buy_now_cents,
      'offer_version', to_jsonb(l)->'offer_version',
      -- What the organizer chose from (migration 0044) where it was recorded, and otherwise the
      -- template as it stands at this moment, which is the same fact taken one step later.
      'template', coalesce(nullif(to_jsonb(l)->'template_snapshot', 'null'::jsonb), jsonb_build_object(
        'key', s.key, 'name', s.name, 'group_key', s.group_key, 'category_key', s.category_key,
        'default_period', s.default_period, 'seen_by', s.seen_by, 'suggested_price_cents', s.default_price_cents))),
    'fundraiser', jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'title', r.title, 'category_key', r.category_key, 'kind', r.kind,
      'starts_on', r.starts_on, 'ends_on', r.ends_on, 'show_count', r.show_count,
      'purpose', r.purpose, 'audience_description', r.audience_description, 'sponsor_promise', r.sponsor_promise,
      'delivery_due_at', r.delivery_due_at, 'timezone', r.timezone, 'category_details', r.category_details,
      'verification_methods', to_jsonb(r.verification_methods), 'verification_other', r.verification_other),
    'organizer', jsonb_build_object('id', a.id, 'slug', a.slug, 'name', a.name, 'city', a.city))
  from public.lots l
  join public.surfaces s on s.key = l.surface_key
  join public.runs r on r.id = l.run_id
  join public.acts a on a.id = r.act_id
  where l.id = p_purchase.lot_id;
$$;
revoke all on function public.purchased_offer_of(public.purchases) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 3. What the organizer owes, and the documentation that it happened.
-- ---------------------------------------------------------------
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  position int not null default 1 check (position >= 1),
  -- original: from the purchased offer. make_good: a replacement the sponsor agreed to.
  kind text not null default 'original' check (kind in ('original','make_good')),
  title text not null check (length(btrim(title)) between 1 and 200),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','delivered','waived')),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (purchase_id, position)
);
create index deliverables_purchase_idx on public.deliverables(purchase_id);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  kind text not null check (kind in ('photo','link','document','note')),
  url text check (url is null or (length(url) <= 500 and url ~ '^https://[^\s/?#]+\.[^\s/?#]+')),
  -- An object path in a private bucket. Never a public URL: a page signs one per view.
  storage_path text check (storage_path is null or length(storage_path) <= 500),
  note text check (note is null or length(note) <= 2000),
  -- Private unless the organizer publishes this one item. A public fundraiser publishes nothing.
  visibility text not null default 'private' check (visibility in ('private','public')),
  shows_minor boolean not null default false,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  check (url is not null or storage_path is not null or note is not null),
  -- An item that shows a minor is never public, whoever asks.
  check (not (shows_minor and visibility = 'public'))
);
create index evidence_deliverable_idx on public.evidence(deliverable_id);
comment on table public.evidence is
  'Organizer-supplied documentation of a deliverable. Door Money checks that it exists, never whether it is good. Private by default, item by item.';

-- Who stands where. Both definer functions answer one yes-or-no about the caller and return no rows.
create function public.organizes_purchase(p_purchase uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.purchases p join public.lots l on l.id = p.lot_id
    join public.runs r on r.id = l.run_id join public.acts a on a.id = r.act_id
    where p.id = p_purchase and a.owner_id = auth.uid());
$$;
create function public.sponsors_purchase(p_purchase uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.purchases p join public.patrons pa on pa.id = p.patron_id
    where p.id = p_purchase and pa.profile_id = auth.uid()
      and p.payment_status in ('held','released','refunded','partially_refunded'));
$$;
revoke all on function public.organizes_purchase(uuid) from public, anon;
revoke all on function public.sponsors_purchase(uuid) from public, anon;
grant execute on function public.organizes_purchase(uuid) to authenticated, service_role;
grant execute on function public.sponsors_purchase(uuid) to authenticated, service_role;

alter table public.deliverables enable row level security;
alter table public.evidence enable row level security;
-- Read by the two parties to the purchase and nobody else. Written by the server only, with the
-- service role, after it has proven the session: the pattern patron_profiles set in 0029. anon
-- holds nothing on either table, so a public fundraiser cannot make either one public.
revoke all on public.deliverables from public, anon, authenticated;
revoke all on public.evidence from public, anon, authenticated;
grant select on public.deliverables to authenticated;
grant select on public.evidence to authenticated;
grant all on public.deliverables to service_role;
grant all on public.evidence to service_role;
create policy "parties read deliverables" on public.deliverables for select to authenticated
  using (public.organizes_purchase(purchase_id) or public.sponsors_purchase(purchase_id));
create policy "parties read evidence" on public.evidence for select to authenticated
  using (removed_at is null and exists (select 1 from public.deliverables d where d.id = deliverable_id
    and (public.organizes_purchase(d.purchase_id) or public.sponsors_purchase(d.purchase_id))));

-- A youth team's evidence is never publishable, whatever a form says (PRODUCT_CONTRACT.md).
create function public.guard_evidence_visibility()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare youth boolean;
begin
  if new.visibility = 'public' then
    select (r.category_details->>'level') = 'youth' into youth
      from public.deliverables d join public.purchases p on p.id = d.purchase_id
      join public.lots l on l.id = p.lot_id join public.runs r on r.id = l.run_id
     where d.id = new.deliverable_id;
    if coalesce(youth, false) then
      raise exception 'evidence_youth_private' using errcode = '23514',
        hint = 'Evidence from a youth team is never published.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_evidence_visibility() from public, anon, authenticated;
create trigger evidence_visibility before insert or update of visibility on public.evidence
  for each row execute function public.guard_evidence_visibility();

-- What the public may see: only an item its organizer published, never one showing a minor, never
-- a removed one, and nothing about who paid, how much, or the purchase it belongs to.
create view public.public_evidence with (security_invoker = false) as
  select l.run_id, l.id as lot_id, d.title as deliverable, e.kind, e.url, e.note, e.created_at
    from public.evidence e
    join public.deliverables d on d.id = e.deliverable_id
    join public.purchases p on p.id = d.purchase_id
    join public.lots l on l.id = p.lot_id
    join public.runs r on r.id = l.run_id
   where e.visibility = 'public' and not e.shows_minor and e.removed_at is null
     and e.storage_path is null
     and p.payment_status in ('held','released','partially_refunded')
     and r.status in ('open','live','closed');
revoke all on public.public_evidence from public, anon, authenticated;
grant select on public.public_evidence to anon, authenticated;

-- ---------------------------------------------------------------
-- 4. A purchase takes its snapshot, its policy version and its deliverables as it is made.
--
--    Security definer, because a purchase is inserted by more than one path and the snapshot has
--    to be written whoever inserts it. A category with no policy cannot be bought at all, which is
--    the fail-closed half of "no live payments before the policy exists".
-- ---------------------------------------------------------------
create function public.snapshot_purchase()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare policy public.delivery_policies; offer jsonb; category text;
begin
  select r.category_key into category from public.lots l join public.runs r on r.id = l.run_id where l.id = new.lot_id;
  policy := public.current_delivery_policy(category);
  if policy.category_key is null then
    raise exception 'no_delivery_policy' using errcode = '23514',
      hint = 'This category has no delivery policy yet, so nothing in it can be bought.';
  end if;
  offer := public.purchased_offer_of(new);
  insert into public.purchase_snapshots (purchase_id, policy_category, policy_version, snapshot)
    values (new.id, policy.category_key, policy.version, offer || jsonb_build_object(
      'policy', jsonb_build_object('category_key', policy.category_key, 'version', policy.version,
        'release_rule', policy.release_rule, 'materials_window_days', policy.materials_window_days, 'terms', policy.terms)));
  -- Music releases on its calendar and owes no deliverable rows: nothing about it changes.
  if policy.release_rule = 'evidence' then
    insert into public.deliverables (purchase_id, position, title, due_at)
      values (new.id, 1, coalesce(offer->'opportunity'->>'label', offer->'opportunity'->'template'->>'name', 'Sponsorship'),
              (offer->'fundraiser'->>'delivery_due_at')::timestamptz);
  end if;
  return new;
end;
$$;
revoke all on function public.snapshot_purchase() from public, anon, authenticated;
create trigger purchases_snapshot after insert on public.purchases
  for each row execute function public.snapshot_purchase();

-- Written once. The one delete allowed is the cascade from an unpaid purchase being dropped.
create function public.purchase_snapshot_is_final()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.purchases where id = old.purchase_id) then
      raise exception 'purchase_snapshot_immutable' using errcode = '23514';
    end if;
    return old;
  end if;
  raise exception 'purchase_snapshot_immutable' using errcode = '23514',
    hint = 'What was bought is never edited. A correction is a new record beside it.';
end;
$$;
revoke all on function public.purchase_snapshot_is_final() from public, anon, authenticated;
create trigger purchase_snapshots_final before update or delete on public.purchase_snapshots
  for each row execute function public.purchase_snapshot_is_final();

-- Every purchase already made is a music purchase under what is now music version 1. The offer is
-- read as it stands today and says so: it was not captured at the time, and is not passed off as if it had been.
insert into public.purchase_snapshots (purchase_id, policy_category, policy_version, snapshot, backfilled)
  select p.id, 'music', 1, public.purchased_offer_of(p) || jsonb_build_object('policy', jsonb_build_object(
           'category_key', 'music', 'version', 1, 'release_rule', 'calendar')), true
    from public.purchases p
    join public.lots l on l.id = p.lot_id join public.runs r on r.id = l.run_id
   where r.category_key = 'music'
  on conflict (purchase_id) do nothing;

-- ---------------------------------------------------------------
-- 5. Evidence-gated release lays one payout row per documented deliverable.
--
--    Additive and nullable: every existing row is a calendar slice and has none. The unique index
--    is what makes "release this deliverable" safe to run twice.
-- ---------------------------------------------------------------
alter table public.payout_schedule add column deliverable_id uuid references public.deliverables(id) on delete set null;
create unique index payout_deliverable_once on public.payout_schedule(deliverable_id) where deliverable_id is not null;

commit;
