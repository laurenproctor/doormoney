-- The offer contract: what the sponsor is actually buying, on the lot that sells it.
--
-- A `lots` row has carried the commercial terms since 0001 (price, sale method, spots, exclusive)
-- and nothing about what the sponsor receives. docs/PRODUCT_CONTRACT.md, "Offer requirements for
-- Phases 3 and 4", asks for more than that before a purchase: placement and format, appearances and
-- when, audience, who pays production, exclusivity scope, sponsor materials and approval with
-- deadlines, deliverables, the evidence each one will be documented by, and the cancellation and
-- refund terms. This adds the column that holds all of it, and nothing else about a lot changes.
--
-- Five things this is careful about:
--
--   Nothing is backfilled. The column defaults to '{}', so every existing music lot and every old
--   purchase reads as an organizer who has not written terms yet. That is the truth about them.
--   An empty document is never an error and never a placeholder: src/lib/offer-terms.ts reads
--   missing, null and '{}' as the same empty offer.
--
--   lots.exclusive stays. It has existed since 0001, no code has ever set it, and it is in the
--   public column grants. It is the legacy half of one fact, so the richer exclusivity section and
--   the boolean are kept in step by the save action and neither is allowed to become the only
--   answer. Nothing here rewrites it.
--
--   The terms freeze with the rest. 0035 froze a lot's price, mode, take-it-now number and template
--   the moment somebody bid on it or paid for it. The offer contract is a term of sale in exactly
--   the same way, so it joins that trigger. offer_version is untouched: it still counts offers made
--   to a bidder, and a purchase still records the version it paid for.
--
--   The snapshot carries them. 0045 writes purchase_snapshots once, by trigger, and nothing may
--   edit it. purchased_offer_of is replaced so a new purchase's immutable copy includes the offer
--   contract as it stood. Snapshots already written are not touched: they are immutable, they were
--   accurate when they were written, and a lot with no terms had none to record.
--
--   The public read path is a view. The document is sponsor-facing by design, but anon reads it
--   through public_offer_terms, which names the sections one at a time. A section added to the
--   TypeScript shape and not to that function is simply not published, which is the failure this
--   wants: a workflow field that leaks into the document reaches nobody.
--
-- Numbered 0056. 0055 is taken by the ledger on feat/phase-4-ledger, which is unmerged and holds no
-- column this file reads.
begin;

-- ---------------------------------------------------------------
-- 1. The column.
--
--    jsonb rather than columns: eleven sections, each optional, each of which will grow. A category
--    registry is rows because a category is data; an offer's shape is one document because every
--    part of it is the organizer's own words about one purchase.
-- ---------------------------------------------------------------
alter table public.lots
  add column offer_terms jsonb not null default '{}'::jsonb
    check (jsonb_typeof(offer_terms) = 'object');

comment on column public.lots.offer_terms is
  'The offer contract: placement, appearances, delivery window, audience, production, exclusivity, sponsor materials, approval, deliverables, evidence method and the cancellation and refund notes. Sponsor-facing only. Empty means the organizer has not written terms, never an error. Shape in src/lib/offer-terms.ts. Added in 0056.';

-- Keep it a document and not a database. A stored offer is capped so one row cannot be used as
-- storage, and the reserved names below are the workflow state that lives in its own tables:
-- purchases.mark_status, deliverables, evidence, payout_schedule, and anything with money or a
-- Stripe id on it. A sponsor reads this whole document, so nothing private may be written into it.
alter table public.lots
  add constraint lots_offer_terms_is_sponsor_facing check (
    length(offer_terms::text) <= 16384
    and not (offer_terms ?| array[
      'internal','notes_internal','evidence','delivery_state','deliverable_state','mark_status',
      'payout','payouts','purchase','purchases','patron','sponsor_id','stripe','fee_cents','amount_cents'])
  );

-- ---------------------------------------------------------------
-- 2. Grants.
--
--    lots carries a column list (0022), so a new column is unreadable and unwritable from the
--    browser until it is named. The organizer writes their own under the policy 0005 gave them
--    (owns_run), which is also what lets them read a draft's terms back into the form.
--
--    anon is not given the column. Its read path is the view in section 5, which is narrower than
--    the table and keeps the published shape in one greppable place, the way 0053 did for
--    discovery. A signed-in stranger reads only a published fundraiser's lots, because "public read
--    lots" has required run_has_left_draft since 0048, and what they read is what a sponsor is
--    meant to read before paying.
-- ---------------------------------------------------------------
grant select (offer_terms) on public.lots to authenticated;
grant insert (offer_terms), update (offer_terms) on public.lots to authenticated;

-- ---------------------------------------------------------------
-- 3. A lot's terms freeze with its price.
--
--    Replaces the 0035 function, adding offer_terms and exclusive to the tuple it compares. Nothing
--    else about it moves: same name, same trigger, same message, same hint. An update that does not
--    change any of these still passes, which is why the save action sends a column only when its
--    value actually changed.
-- ---------------------------------------------------------------
create or replace function public.freeze_lot_terms()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.price_cents, new.mode, new.buy_now_cents, new.surface_key, new.offer_terms, new.exclusive)
     is distinct from (old.price_cents, old.mode, old.buy_now_cents, old.surface_key, old.offer_terms, old.exclusive)
     and (exists (select 1 from bids where lot_id = old.id) or exists (select 1 from purchases where lot_id = old.id)) then
    raise exception 'lot_terms_frozen' using errcode = 'check_violation',
      hint = 'A spot with a bid or a payment on it keeps its price, its mode, its take-it-now number, its placement and the terms of its offer.';
  end if;
  return new;
end;
$$;

comment on function public.freeze_lot_terms() is
  'A lot with a bid or a payment on it keeps the terms somebody relied on: price, sale method, take-it-now number, template, the offer contract and exclusivity. Added in 0035, widened in 0056.';

-- ---------------------------------------------------------------
-- 4. The purchased offer carries the terms it was bought under.
--
--    Replaces the 0045 function. Same name, same signature, same trigger: snapshot_purchase calls
--    it and is unchanged, so a purchase still gets exactly one snapshot, written once, immutable.
--    Two keys are added under 'opportunity'. Music purchases get them too, and for music they say
--    an empty document and false, which is what music's lots hold and what music has always
--    promised: its delivery policy, not a per-offer contract, is what it was sold under.
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
-- 5. What the public may read.
--
--    The sections are named one at a time rather than the document being passed through, so
--    publishing something new is a deliberate act in a migration. jsonb_strip_nulls drops the
--    sections a lot does not carry, so an offer with a placement and nothing else is a document
--    with a placement and nothing else, and a reader is never handed a null to draw as a gap.
-- ---------------------------------------------------------------
create function public.sponsor_facing_offer_terms(terms jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when coalesce(jsonb_typeof(terms), 'null') <> 'object' or terms = '{}'::jsonb then '{}'::jsonb
    else jsonb_strip_nulls(jsonb_build_object(
      'version',           terms->'version',
      'sponsor_materials', terms->'sponsor_materials',
      'placement',         terms->'placement',
      'appearances',       terms->'appearances',
      'delivery_window',   terms->'delivery_window',
      'audience',          terms->'audience',
      'production',        terms->'production',
      'exclusivity',       terms->'exclusivity',
      'approval',          terms->'approval',
      'deliverables',      terms->'deliverables',
      'cancellation',      terms->'cancellation',
      'refund',            terms->'refund'))
  end;
$$;
grant execute on function public.sponsor_facing_offer_terms(jsonb) to anon, authenticated, service_role;

comment on function public.sponsor_facing_offer_terms(jsonb) is
  'The sections of an offer contract a sponsor may read, named one at a time. A section not listed here is not published. Added in 0056.';

-- Built with (security_invoker = false) like every other public view here, so it can select past
-- row level security, which is also why every write on it is revoked and never granted back
-- (migration 0030). It carries no patron, bid, amount, fee, Stripe id, evidence or delivery state.
-- A draft publishes nothing: the fundraiser has to have left draft, the same rule as 0048.
create view public.public_offer_terms with (security_invoker = false) as
  select l.id as lot_id,
         l.run_id,
         l.surface_key,
         l.exclusive,
         public.sponsor_facing_offer_terms(l.offer_terms) as offer_terms
    from public.lots l
   where public.run_has_left_draft(l.run_id);

comment on view public.public_offer_terms is
  'Read-only. The offer contract for one sponsorship option, as a sponsor may read it, on fundraisers that have left draft. Added in 0056.';

revoke all on public.public_offer_terms from public, anon, authenticated;
grant select on public.public_offer_terms to anon, authenticated;
revoke insert, update, delete, truncate on public.public_offer_terms from anon, authenticated;
grant select on public.public_offer_terms to service_role;

commit;
