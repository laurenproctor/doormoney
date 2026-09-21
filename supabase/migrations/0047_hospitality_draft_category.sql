-- Hospitality, as a category that can hold private drafts and nothing else.
--
-- Restaurants, bars, hotels and community kitchens can make a clear sponsorship promise: a cart, a
-- table, a residency, a dinner series. Door Money has not sold one, has no delivery policy for one
-- and has not decided what evidence one owes a sponsor. So the category arrives the way migration
-- 0041 says a new category should: able to save a draft, and switched off for everything after.
--
-- What this file does, all of it rows:
--   1. one fundraiser_categories row, draft_enabled and NOT publish_enabled
--   2. six sponsorship option templates in surfaces, with no suggested price
--
-- What it deliberately does not do, and what each omission holds shut:
--   no publish_enabled     guard_fundraiser_foundation (0041) refuses any status but 'draft', for
--                          every role, so no hospitality fundraiser can become public. anon reads
--                          runs only where status is open, live or closed (0001), so a draft and
--                          its organizer's profile stay invisible. The patron category pickers
--                          list publish_enabled categories only, so it is not offered there either.
--   no delivery_policies   snapshot_purchase (0045) raises no_delivery_policy for a category with
--     row                  no policy, in any Stripe mode, whoever inserts the purchase. The
--                          checkout and bid routes ask the same question first and answer 403.
--   no suggested price     Door Money has no sales history here. The organizer's price is the only
--                          number, as it is for sports, film and theater (0040).
--
-- Opening hospitality later is two separate, deliberate acts by the owner: a delivery_policies row
-- (which arrives 'proposed', test mode only) and publish_enabled = true. Neither is in this file,
-- and supabase/tests/hospitality_draft_only_test.sql fails if either appears by accident.
--
-- Additive. No existing row, grant, policy, function or trigger changes, and no new table, so
-- there are no new Data API grants to decide. Music, sports, film and theater are untouched.
begin;

-- ---------------------------------------------------------------
-- 1. The category.
--
--    publish_enabled defaults to false; it is written out so the intent is in the file and not in
--    a default somebody might change. The details are two lines of free text, both optional, and
--    neither assumes a restaurant: a hotel bar or a community kitchen answers them as easily, or
--    leaves them empty. Words for them live in src/lib/categories.ts.
-- ---------------------------------------------------------------
insert into public.fundraiser_categories (key, label, detail_keys, draft_enabled, publish_enabled) values
  ('hospitality', 'Hospitality', array['venue_kind','format'], true, false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- 2. The templates.
--
--    group_key says what is being sponsored, which is the distinction a hospitality sponsor asks
--    about first: a guest experience, a space, an event, or a program of meals. Whether the
--    sponsor's side is cash, product or a service is in the words (src/lib/catalog.ts), because
--    Door Money moves money and nothing else: anything supplied in kind is between the organizer
--    and the sponsor.
--
--    applies_to is null (surfaces_applies_to_is_music, 0040). guard_lot_category (0044) already
--    keeps these off every fundraiser that is not hospitality, and every other category's
--    templates off a hospitality one. Mirrors src/lib/catalog.ts; tests/catalog.test.ts fails if
--    they drift.
-- ---------------------------------------------------------------
insert into public.surfaces (key, name, group_key, category_key, applies_to, default_price_cents, default_period, seen_by, sort) values
('sponsored_martini_cart',     'Sponsored martini cart',     'guest_experience', 'hospitality', null, null, 'season',  'guests at the tables the cart visits',                 401),
('sponsored_table_plaque',     'Sponsored table plaque',     'space',            'hospitality', null, null, 'season',  'guests seated at the table, and those who pass it',     402),
('sponsored_restaurant_space', 'Sponsored restaurant space', 'space',            'hospitality', null, null, 'season',  'guests who use the space, and those who pass it',       403),
('chef_residency',             'Chef residency',             'event',            'hospitality', null, null, 'program', 'guests who book during the residency',                  404),
('dinner_series',              'Dinner series',              'event',            'hospitality', null, null, 'program', 'guests at each dinner in the series',                   405),
('community_meal_program',     'Community meal program',     'community',        'hospitality', null, null, 'program', 'the people the program serves, and its local partners', 406)
on conflict (key) do nothing;

-- Stated again, as 0040 and 0044 do, so the file that adds rows also says what the browser may do
-- with the table: read it, and nothing else.
revoke insert, update, delete, truncate on public.surfaces from anon, authenticated;
revoke insert, update, delete, truncate on public.fundraiser_categories from anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Refuse to finish if the category is anything but draft-only.
--
--    "on conflict do nothing" means a project where somebody already made a hospitality row by
--    hand keeps that row. If that row can publish, or a policy already exists for it, this
--    migration would be reporting a state it did not create. Stop, and let a person look.
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fundraiser_categories where key = 'hospitality' and publish_enabled) then
    raise exception 'hospitality is already enabled for publishing. 0047 adds it as draft-only; resolve that by hand first.';
  end if;
  if exists (select 1 from public.delivery_policies where category_key = 'hospitality') then
    raise exception 'hospitality already has a delivery policy. 0047 adds the category with none; resolve that by hand first.';
  end if;
end $$;

commit;
