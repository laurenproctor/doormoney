-- Restaurants & hospitality gets its public name, and Other arrives as a draft-only category.
--
-- Hospitality has been in the registry since 0047 under the label 'Hospitality'. The key stays
-- 'hospitality': a second 'restaurants' key would split its templates, its words and whatever
-- delivery policy it is given later. Only the name a reader sees changes, to the one the
-- marketing pages now use.
--
-- Other is for a project none of the named categories fits, which can still say what the funding
-- enables, who it reaches and what a sponsor receives. It is a controlled way in, not a way round
-- the explanation: it has no templates, no suggested price and no details of its own, so the
-- organizer states the sponsor promise directly in the fields every fundraiser already has.
--
-- What this file does, all of it rows:
--   1. relabels hospitality, only where the label is still exactly the one 0047 wrote
--   2. one fundraiser_categories row for 'other', draft_enabled and NOT publish_enabled
--
-- What it deliberately does not do, and what each omission holds shut, for both categories:
--   no publish_enabled     guard_fundraiser_foundation (0041) refuses any status but 'draft', for
--                          every role. The patron category pickers list publish_enabled categories
--                          only, so neither is offered as a sponsor preference.
--   no delivery_policies   snapshot_purchase (0045) raises no_delivery_policy, in any Stripe mode,
--     row                  and the checkout and bid routes answer 403 before that.
--   no surfaces rows       Other has no sponsorship option templates. Door Money has sold nothing
--     for 'other'          like it and will not invent what one offers or what it costs.
--
-- Opening either later is two separate, deliberate acts by the owner: a delivery_policies row
-- (which arrives 'proposed', test mode only) and publish_enabled = true. Neither is in this file.
--
-- Additive. No grant, policy, function or trigger changes, and no new table, so there are no new
-- Data API grants to decide. Music, sports, film and theater are untouched, and so are
-- hospitality's six templates and every existing fundraiser.
begin;

-- ---------------------------------------------------------------
-- 1. The name.
--
--    Conditional on the label 0047 wrote, so a name somebody has since chosen by hand is kept.
--    Nothing stores a category's label: runs, surfaces and patron_profile_categories hold the key,
--    and every page reads the label from this row (src/lib/category-registry.ts).
-- ---------------------------------------------------------------
update public.fundraiser_categories
   set label = 'Restaurants & hospitality'
 where key = 'hospitality' and label = 'Hospitality';

-- ---------------------------------------------------------------
-- 2. Other.
--
--    publish_enabled defaults to false; it is written out so the intent is in the file and not in
--    a default somebody might change. detail_keys is empty: the shared fields are the whole form,
--    and guard_fundraiser_foundation refuses any detail key on a fundraiser in this category.
-- ---------------------------------------------------------------
insert into public.fundraiser_categories (key, label, detail_keys, draft_enabled, publish_enabled) values
  ('other', 'Other', array[]::text[], true, false)
on conflict (key) do nothing;

-- Stated again, as 0040, 0044 and 0047 do, so the file that adds rows also says what the browser
-- may do with the table: read it, and nothing else.
revoke insert, update, delete, truncate on public.fundraiser_categories from anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Refuse to finish if either category is anything but draft-only.
--
--    "on conflict do nothing" means a project where somebody already made an 'other' row by hand
--    keeps that row. If it can publish, has a policy or has templates, this migration would be
--    reporting a state it did not create. Stop, and let a person look. Hospitality is checked
--    again because this file touches its row.
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fundraiser_categories where key in ('hospitality', 'other') and publish_enabled) then
    raise exception 'hospitality or other is already enabled for publishing. 0049 keeps both draft-only; resolve that by hand first.';
  end if;
  if exists (select 1 from public.delivery_policies where category_key in ('hospitality', 'other')) then
    raise exception 'hospitality or other already has a delivery policy. 0049 adds none; resolve that by hand first.';
  end if;
  if exists (select 1 from public.surfaces where category_key = 'other') then
    raise exception 'other already has sponsorship option templates. 0049 adds the category with none; resolve that by hand first.';
  end if;
end $$;

commit;
