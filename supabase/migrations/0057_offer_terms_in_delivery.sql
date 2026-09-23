-- What was promised becomes what is owed.
--
-- 0056 put the offer contract on the lot and copied it into the purchase snapshot. It stopped
-- there: a purchase under the evidence rule still got exactly one deliverable, named after the
-- option, whatever the offer actually promised. So an offer that said "name on the program, a
-- mention in the matchday post, and a photograph of each" became one row called "Jersey front",
-- and the organizer had one thing to document instead of three.
--
-- This closes that. Two functions are replaced, both by name, both called by the same unchanged
-- trigger:
--
--   purchased_offer_of   adds the offer terms' own schema version beside the terms, so a reader in
--                        two years knows which shape the immutable copy it is holding was written
--                        in without having to dig into the document.
--   snapshot_purchase    builds one deliverable per promise, from the snapshot it has just written
--                        and never from the live lot. An offer that names none keeps the single
--                        row it has always had.
--
-- What does not change:
--
--   Music. Its policy is the calendar rule, which writes no deliverable rows at all, so nothing
--   about how or when a music purchase is paid moves. Its lots carry no terms either.
--   Old snapshots. They are immutable, they were accurate when they were written, and nothing here
--   reads or rewrites one. Only purchases made from now on are built this way.
--   The release arithmetic. src/lib/delivery.ts already divides the organizer's net across however
--   many deliverables a purchase has (deliverableShares), lays each share for the next Friday, and
--   goes through the same 0031 materials gate and the same idempotency key. Three deliverables is
--   three shares of the same money, not three payments of it.
--   The state machine. No status, no kind and no column is added. A deliverable is still pending,
--   delivered or waived, and evidence is still private by default, item by item.
--
-- Numbered 0057, after 0056 on this branch. 0055 is the ledger on feat/phase-4-ledger, which is
-- unmerged and holds no column either file reads.
begin;

-- ---------------------------------------------------------------
-- 1. The immutable copy says which shape it is in.
--
--    Same name, same signature, same callers. One key added beside the terms 0056 put there.
-- ---------------------------------------------------------------
create or replace function public.purchased_offer_of(p_purchase public.purchases)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'amount_cents', p_purchase.amount_cents,
    'fee_cents', p_purchase.fee_cents,
    'opportunity', jsonb_build_object(
      'lot_id', l.id, 'label', l.label, 'template_key', l.surface_key, 'price_cents', l.price_cents,
      'sale_method', l.mode, 'buy_now_cents', l.buy_now_cents,
      'offer_version', to_jsonb(l)->'offer_version',
      -- The offer contract exactly as it stood when the money was taken. Editing the lot afterwards
      -- is refused outright by freeze_lot_terms, and could not reach this row in any case.
      'offer_terms', coalesce(to_jsonb(l)->'offer_terms', '{}'::jsonb),
      -- The shape that document was written in. Null where the offer carried no terms at all, which
      -- is every music lot and every lot made before 0056: an absent version is the legacy offer.
      'offer_terms_version', to_jsonb(l)->'offer_terms'->'version',
      'exclusive', l.exclusive,
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
-- 2. One deliverable per promise, from the snapshot.
--
--    Read out of `offer`, which is the jsonb that was just written to purchase_snapshots, so the
--    rows the organizer is asked to document are built from the immutable copy and not from a lot
--    somebody could still be editing. A later edit to lots.offer_terms reaches neither.
--
--    A promise with no title is not a promise, so it is skipped, and the positions are numbered
--    over what survives rather than over the array, which keeps them 1..n with no gaps.
--
--    A due date is trusted only when it looks like one. The shape is validated in TypeScript before
--    it is stored (src/lib/offer-terms.ts), but a trigger that raises on a malformed date would
--    refuse the purchase itself, and a sponsor's payment must never fail over a typo in a date
--    field. Anything else falls back to the fundraiser's own delivery deadline, which is what every
--    purchase used before this.
-- ---------------------------------------------------------------
create or replace function public.snapshot_purchase()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  policy public.delivery_policies;
  offer jsonb;
  category text;
  promises jsonb;
  fallback_due timestamptz;
  fallback_title text;
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
  if policy.release_rule <> 'evidence' then
    return new;
  end if;

  fallback_due := (offer->'fundraiser'->>'delivery_due_at')::timestamptz;
  fallback_title := coalesce(offer->'opportunity'->>'label', offer->'opportunity'->'template'->>'name', 'Sponsorship');
  promises := offer->'opportunity'->'offer_terms'->'deliverables';

  if jsonb_typeof(promises) = 'array' and jsonb_array_length(promises) > 0 then
    insert into public.deliverables (purchase_id, position, title, due_at)
    select new.id,
           row_number() over (order by ord)::int,
           left(btrim(item->>'title'), 200),
           case when item->>'due_on' ~ '^\d{4}-\d{2}-\d{2}$'
                then ((item->>'due_on') || ' 00:00:00+00')::timestamptz
                else fallback_due end
      from jsonb_array_elements(promises) with ordinality as t(item, ord)
     where coalesce(btrim(item->>'title'), '') <> '';
  end if;

  -- The offer named nothing, or named nothing usable: the single row every evidence purchase had
  -- before this, under the option's own name.
  if not exists (select 1 from public.deliverables where purchase_id = new.id) then
    insert into public.deliverables (purchase_id, position, title, due_at)
      values (new.id, 1, fallback_title, fallback_due);
  end if;

  return new;
end;
$$;
revoke all on function public.snapshot_purchase() from public, anon, authenticated;

comment on function public.snapshot_purchase() is
  'Writes a purchase''s immutable snapshot, then the deliverables it owes: one per promise in the offer terms that snapshot holds, or one named after the option where the offer named none. Added in 0045, widened in 0057.';

commit;
