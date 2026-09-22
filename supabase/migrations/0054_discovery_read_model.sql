-- The discovery views learn the rest of what a discovery card shows, and when an offer closes.
--
-- 0053 built the discovery contract: the structured facts a sponsor can narrow by. Building the
-- page on top of it found two gaps, both of which would otherwise be filled by a second and third
-- query against `runs` and `acts` per page load, or worse, by the board loader that discovery is
-- replacing (`listOpenBoards`, one query per organizer plus bids, buyers and backers for each).
--
--   1. A card names the organizer and says what the funding enables and who it reaches. The
--      fundraiser view carried the organizer's slug but not their name, and none of the prose.
--   2. "Closing soon" needs the time an offer actually closes, and that is not `lots.closes_at`
--      alone.
--
-- **Nothing here widens what anybody may read.** Every column added is already granted to `anon` on
-- its own table: `acts.name` since 0022, `runs.purpose`, `audience_description` and
-- `sponsor_promise` since 0041, `runs.bidding_closes_at` and `lots.closes_at` since 0038 and 0022.
-- This puts columns a visitor can already read in one place, so discovery is two queries rather
-- than five. No table, column, policy, grant or row changes; the two views are replaced in place.
--
-- Numbered 0054: 0053 is applied to the hosted project and frozen.
begin;

-- ---------------------------------------------------------------
-- 1. The fundraiser a card draws.
--
--    The three prose fields come along because a card shows what the funding enables and who it
--    reaches, in the organizer's own words. They are *not* filterable and must never be: discovery
--    narrows on the structured tags and nothing else, which is the rule in CLAUDE.md and the whole
--    reason 0053 exists. They are here to be read, not searched.
--
--    `bidding_closes_at` is the fundraiser's own bidding clock. It is the fallback half of
--    `lot_close_time` (0035) and is exposed so a page can say when bidding ends without asking
--    `runs` a second time.
--
--    Columns are appended, never reordered: `create or replace view` allows nothing else, and the
--    existing thirteen keep their names, types and positions.
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
         r.bidding_closes_at
    from public.runs r
    join public.acts a on a.id = r.act_id
   where r.status in ('open','live','closed');

comment on view public.public_fundraiser_discovery is
  'Read-only. The structured facts a published fundraiser offers discovery, plus the words a card shows. Drafts are excluded by status. The prose fields are read, never filtered on: discovery narrows on the structured tags only.';

-- ---------------------------------------------------------------
-- 2. When an offer actually closes.
--
--    `lot_close_time` (migration 0035) is the product's answer, and it is `coalesce(l.closes_at,
--    r.bidding_closes_at)`. That function is security definer and is not callable by `anon`, and
--    every place it is called is a bidding path: placing a bid, closing a lot, rolling one on. So
--    the fallback to the fundraiser's clock is the rule *for an offer sold by bidding*.
--
--    A fixed-price offer is deliberately not given that fallback. It is not on the bidding clock,
--    nothing in the product ever closes it on that date, and borrowing the number would put a
--    deadline on a page that the organizer never set. It carries its own `closes_at` or none.
--
--    The activity end date is never involved. It is when the work happens, not when an offer stops
--    being available, and the two are different facts (docs/DISCOVERY_CONTRACT.md).
--
--    Computed here rather than in TypeScript so the rule has one home, and so a page can filter and
--    order on it in the database instead of after the fact.
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
           as effective_closes_at
    from public.lots l
    join public.runs r on r.id = l.run_id
    join public.acts a on a.id = r.act_id
    join public.surfaces s on s.key = l.surface_key
   where r.status in ('open','live')
     and l.status = 'open';

comment on view public.public_opportunity_discovery is
  'Read-only. Sponsorship options a sponsor could buy right now: open options on an open or live fundraiser. price_cents is the fixed price or the reserve, the same column either way; mode says which. effective_closes_at is lot_close_time''s rule, applied to bidding only. No bid, no buyer, no fee.';

-- ---------------------------------------------------------------
-- 3. The grants, restated.
--
--    `create or replace view` keeps the privileges the view already had, so these change nothing.
--    They are written out because the rule here is that the file touching a view says what the
--    browser may do with it, and because a view is a read path and never a write path: it is
--    `security_invoker = false`, so a write through it would reach the base tables with row level
--    security switched off (migration 0030).
-- ---------------------------------------------------------------
revoke insert, update, delete, truncate on public.public_fundraiser_discovery  from anon, authenticated;
revoke insert, update, delete, truncate on public.public_opportunity_discovery from anon, authenticated;
grant select on public.public_fundraiser_discovery  to anon, authenticated;
grant select on public.public_opportunity_discovery to anon, authenticated;

-- ---------------------------------------------------------------
-- 4. Nothing here opened a category, a policy or a payment.
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fundraiser_categories where key in ('hospitality','other') and publish_enabled) then
    raise exception '0054 must not enable publishing for a draft-only category.';
  end if;
  if exists (select 1 from public.delivery_policies where category_key in ('hospitality','other')) then
    raise exception '0054 must not give a draft-only category a delivery policy.';
  end if;
end $$;

commit;
