-- A discovery card learns what its organizer looks like and where one option puts the sponsor.
--
-- 0054 gave the discovery views the words a card shows. Redesigning the card found two more gaps,
-- and each would otherwise be filled by a per-card read against `acts` or `public_offer_terms`,
-- which is the N+1 the discovery read model exists to avoid.
--
--   1. A card has no image. The organizer's public photo (`acts.photo_url`) is the only image the
--      product holds that is public, organizer-supplied and not evidence. A show photo is music's
--      own and is documentation of a date; a patron photo is private and signed. So the card gets
--      the organizer's photo, named as the organizer's: it says who is raising, not what the work
--      looks like, and no page may present it as documentation of the project or its delivery.
--   2. A card previews the sponsorship options that matched, and the one thing a sponsor wants to
--      know about an option is where they appear. That is `placement.description` in the offer
--      contract (0056). It is read through `sponsor_facing_offer_terms`, the same projection every
--      other public reader goes through, so a section the function does not publish cannot reach
--      this view either. One text column, not the document.
--
-- **Nothing here widens what anybody may read.** `acts.photo_url` has been in `anon`'s column list
-- since 0022. `sponsor_facing_offer_terms` is the public projection since 0056 and `anon` reads it
-- through `public_offer_terms` already, on the same fundraisers this view shows: an open or live
-- fundraiser has left draft. No table, column, policy, grant or row changes; the two views are
-- replaced in place, and every existing column keeps its name, type and position, because
-- `create or replace view` allows nothing else.
--
-- What it deliberately does not do: no image for the fundraiser itself, because the product holds
-- none and a stand-in would be an invented one; no reach, no current bid, no bidder, no amount
-- anybody paid; and no change to which categories may publish or be bought.
--
-- Numbered 0059: 0058 is applied to the hosted project and frozen.
begin;

-- ---------------------------------------------------------------
-- 1. The fundraiser a card draws, plus the organizer's photo.
--
--    Appended after `bidding_closes_at`. Null where the organizer has not added one, and the page
--    draws nothing in its place: no stock image, no initials, no placeholder.
-- ---------------------------------------------------------------
create or replace view public.public_fundraiser_discovery with (security_invoker = false) as
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
         r.created_at,
         a.name as organizer_name,
         r.purpose,
         r.audience_description,
         r.sponsor_promise,
         r.bidding_closes_at,
         a.photo_url as organizer_photo_url
    from public.runs r
    join public.acts a on a.id = r.act_id
   where r.status in ('open','live','closed');

comment on view public.public_fundraiser_discovery is
  'Read-only. The structured facts a published fundraiser offers discovery, plus the words a card shows and the organizer''s public photo. Drafts are excluded by status. The prose fields are read, never filtered on: discovery narrows on the structured tags only. organizer_photo_url is the organizer''s own image, not documentation of the work.';

-- ---------------------------------------------------------------
-- 2. Where one option puts the sponsor.
--
--    `sponsor_facing_offer_terms` strips nulls and names the public sections one at a time, so an
--    offer with no placement yields null here and an offer whose organizer wrote one yields their
--    own words. Appended after `effective_closes_at`.
-- ---------------------------------------------------------------
create or replace view public.public_opportunity_discovery with (security_invoker = false) as
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
         l.created_at,
         case when l.mode = 'auction' then coalesce(l.closes_at, r.bidding_closes_at) else l.closes_at end
           as effective_closes_at,
         nullif(btrim(public.sponsor_facing_offer_terms(l.offer_terms)->'placement'->>'description'), '')
           as placement_description
    from public.lots l
    join public.runs r on r.id = l.run_id
    join public.acts a on a.id = r.act_id
    join public.surfaces s on s.key = l.surface_key
   where r.status in ('open','live')
     and l.status = 'open';

comment on view public.public_opportunity_discovery is
  'Read-only. Sponsorship options a sponsor could buy right now: open options on an open or live fundraiser. price_cents is the fixed price or the reserve, the same column either way; mode says which. effective_closes_at is lot_close_time''s rule, applied to bidding only. placement_description is the offer contract''s placement, through the public projection. No bid, no buyer, no fee.';

-- ---------------------------------------------------------------
-- 3. The grants, restated.
--
--    `create or replace view` keeps the privileges the view already had, so these change nothing.
--    They are written out because the file touching a view says what the browser may do with it,
--    and because a view is a read path and never a write path: it is `security_invoker = false`,
--    so a write through it would reach the base tables with row level security switched off
--    (migration 0030).
-- ---------------------------------------------------------------
revoke insert, update, delete, truncate on public.public_fundraiser_discovery  from anon, authenticated;
revoke insert, update, delete, truncate on public.public_opportunity_discovery from anon, authenticated;
grant select on public.public_fundraiser_discovery  to anon, authenticated;
grant select on public.public_opportunity_discovery to anon, authenticated;

-- ---------------------------------------------------------------
-- 4. Nothing here opened a category, a policy or a payment.
--
--    Two view definitions and their grants. The file names no category and touches no row of
--    fundraiser_categories or delivery_policies, so a draft-only category is exactly as draft-only
--    after this as before it.
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fundraiser_categories c
              where c.publish_enabled
                and not exists (select 1 from public.delivery_policies p where p.category_key = c.key)) then
    raise exception '0059 found a category that may publish with no delivery policy, which it must not have created.';
  end if;
end $$;

commit;
