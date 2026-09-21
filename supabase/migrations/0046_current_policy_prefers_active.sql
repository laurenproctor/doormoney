-- The policy a purchase is sold under: the newest one switched on, and only failing that a proposal.
--
-- Migration 0045 chose "the newest version that is not retired". That is right today, when every
-- category has exactly one version, and wrong the first time anybody drafts a second. A proposed
-- music version 2 sitting beside the active version 1 would have been the one every new music
-- purchase was recorded under, live ones included: real money sold under terms nobody had switched
-- on. It would also have been the version the checkout gate asks about, so live music checkout
-- would have closed the moment the draft was inserted.
--
-- The rule now: the newest active version. Where a category has none, the newest proposed one,
-- which is how sports, film and theater are verified in test mode today. A draft of a later
-- version changes nothing until the owner switches it on, and switching it on retires nothing by
-- itself: the older active version simply stops being the newest.
--
-- One function is replaced. No table, row, grant or trigger changes, and no purchase already made
-- is touched: a snapshot is immutable and says which version it was bought under.
begin;

create or replace function public.current_delivery_policy(p_category text)
returns public.delivery_policies language sql stable set search_path = '' as $$
  select * from public.delivery_policies
   where category_key = p_category and status in ('active', 'proposed')
   order by (status = 'active') desc, version desc
   limit 1;
$$;
revoke all on function public.current_delivery_policy(text) from public, anon, authenticated;

commit;
