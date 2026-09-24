-- ---------------------------------------------------------------
-- One stored card, one bid.
--
-- A bid carries the SetupIntent that stored its card (migration 0028), and the close charges that
-- card for that bid with nobody present. Since 2026-09-23 placeBid refuses a SetupIntent that
-- already sits on a bid, so that what the close charges is always the card the patron confirmed
-- for that exact bid. That refusal was a read before the insert. This makes it the database's,
-- for every role and every caller, so two requests carrying the same SetupIntent cannot both land.
--
-- Partial, because a bid placed on a Door Money with no Stripe key carries no SetupIntent, and
-- every bid before 0028 carries none either.
-- ---------------------------------------------------------------
create unique index if not exists bids_setup_intent_idx
  on public.bids (stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;
