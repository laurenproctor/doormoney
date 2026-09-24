-- What the auction functions and guards from migration 0035 allow and refuse.
--
-- Run with `npm run test:db:docker` (what CI runs) or `supabase test db` against a local stack.
-- supabase/tests/concurrency_test.sh covers what a single session cannot: two sessions racing on
-- the same lot. This file covers everything else the Phase 3 gate names: a bid below the minimum,
-- a bid after the close, a lot with bids keeping its terms, a close that picks one winner and
-- answers "already" the second time, a winner who did not pay rolling to the next bid, a live
-- checkout holding a roll back, a stale offer refused at fulfilment, a duplicate fulfilment, and
-- a take-it-now refused once the bidding has passed it.
--
-- Runs as postgres. The guards check every insert unless doormoney.trusted_load is on, which the
-- fixtures switch on for the two rows of history they need and off again straight after.

begin;
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
select plan(83);

-- ---------------------------------------------------------------
-- Fixtures. The seed's Gutter Hymns fundraiser, put on a clock we control.
-- ---------------------------------------------------------------
update runs set bidding_closes_at = now() + interval '1 hour' where id = '22222222-2222-2222-2222-222222222222';
update lots set closes_at = null where run_id = '22222222-2222-2222-2222-222222222222';

-- Two fresh lots on it, born under the guards like any lot the dashboard would make.
-- These spots carry no offer terms, as every spot did before migration 0060, and their fundraiser is
-- already public, so they are marked grandfathered the way 0060 marks the real ones (0061 refuses the
-- shape otherwise). The test is about what it was about, not about offer terms.
insert into lots (id, run_id, surface_key, label, price_cents, mode, status, buy_now_cents, terms_grandfathered) values
  ('a3000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'rig_rundown', 'Rig rundown, second cut', 40000, 'auction', 'open', 60000, true),
  ('a3000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'hang_tags', null, 5000, 'fixed', 'open', null, true),
  ('a3000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'riser_fascia', null, 100000, 'auction', 'open', null, true);

-- ---------------------------------------------------------------
-- The arithmetic matches src/lib/money.ts and src/lib/auctions.ts.
-- ---------------------------------------------------------------
select is(bid_step_cents(45000), 2500, 'the step is 5% of the price rounded up to $5');
select is(bid_step_cents(10000), 500, 'and never under $5');
select is(bid_step_cents(100000), 5000, 'a $1,000 lot steps by $50');
select is(bid_step_cents(0), 500, 'even a free lot steps by $5');

-- Guitar straps: reserve $450, top bid $520 from the seed.
select is(minimum_bid_cents('a1000000-0000-0000-0000-000000000002'), 54500, 'the minimum is the top bid plus a step');
select is(minimum_bid_cents('a3000000-0000-0000-0000-000000000003'), 100000, 'with no bids the minimum is the reserve');
select is(top_bid_cents('a3000000-0000-0000-0000-000000000003'), null, 'no bids means no top bid, not a top bid of zero');

-- ---------------------------------------------------------------
-- Placing a bid.
-- ---------------------------------------------------------------
select throws_ok(
  $$select * from place_bid('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 54000)$$,
  '23514', 'bid_below_minimum', 'a bid under the minimum is refused');

select is(
  (select next_minimum_cents from place_bid('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 54500)),
  57000, 'a bid at the minimum goes in and the next minimum is a step above it');

select is((select count(*)::int from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500), 1,
  'and the bid is on the lot');

select throws_ok(
  $$select * from place_bid('a3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 5000)$$,
  '23514', 'not_an_auction', 'a fixed-price spot takes no bids');

select throws_ok(
  $$select * from place_bid('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001', 5000)$$,
  'P0002', 'lot_not_found', 'a lot that is not there is said so');

-- Case spot 1: closed a minute ago.
update lots set closes_at = now() - interval '1 minute' where id = 'a1000000-0000-0000-0000-000000000003';
select throws_ok(
  $$select * from place_bid('a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 100000)$$,
  '23514', 'bidding_closed', 'a bid after the close is refused, however high');

-- The guard stands behind the function: a plain insert meets the same refusals.
select throws_ok(
  $$insert into bids (lot_id, patron_id, amount_cents) values ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 100)$$,
  '23514', 'bid_below_minimum', 'a bid inserted around the function is checked all the same');
select throws_ok(
  $$insert into bids (lot_id, patron_id, amount_cents) values ('a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 100000)$$,
  '23514', 'bidding_closed', 'and so is one after the close');
select throws_ok(
  $$update bids set amount_cents = 1 where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500$$,
  '23514', 'bid_is_final', 'a bid cannot be edited after the fact');

-- ---------------------------------------------------------------
-- A lot with a bid on it keeps its terms.
-- ---------------------------------------------------------------
select throws_ok(
  $$update lots set price_cents = 46000 where id = 'a1000000-0000-0000-0000-000000000002'$$,
  '23514', 'lot_terms_frozen', 'the reserve cannot change once there is a bid');
select throws_ok(
  $$update lots set mode = 'fixed' where id = 'a1000000-0000-0000-0000-000000000002'$$,
  '23514', 'lot_terms_frozen', 'nor the mode');
select throws_ok(
  $$update lots set buy_now_cents = 99000 where id = 'a1000000-0000-0000-0000-000000000002'$$,
  '23514', 'lot_terms_frozen', 'nor the take-it-now number');
select lives_ok(
  $$update lots set label = 'Guitar straps, front line' where id = 'a1000000-0000-0000-0000-000000000002'$$,
  'the label is not a term and can still change');
select lives_ok(
  $$update lots set price_cents = 90000 where id = 'a3000000-0000-0000-0000-000000000003'$$,
  'a lot nobody has bid on can still be repriced');
select throws_ok(
  $$delete from lots where id = 'a1000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'and a lot with bids still cannot be deleted (migration 0022)');

-- ---------------------------------------------------------------
-- Closing.
-- ---------------------------------------------------------------
select is((select outcome from close_auction('a1000000-0000-0000-0000-000000000002')), 'not_due', 'a lot still on its clock does not close');

update lots set closes_at = now() - interval '1 second' where id = 'a1000000-0000-0000-0000-000000000002';
select is((select outcome from close_auction('a1000000-0000-0000-0000-000000000002')), 'won', 'a due lot with a bid at the reserve closes with a winner');
select is(
  (select winner_bid_id from lots where id = 'a1000000-0000-0000-0000-000000000002'),
  (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500),
  'the winner is the top bid');
select is((select status::text from lots where id = 'a1000000-0000-0000-0000-000000000002'), 'pending_funding', 'and the lot is waiting on the money');
select is((select offer_version from lots where id = 'a1000000-0000-0000-0000-000000000002'), 1, 'the first offer is version 1');
select is((select length(funding_token) from lots where id = 'a1000000-0000-0000-0000-000000000002'), 64, 'with a private token for the claim link');
select ok(
  (select funding_deadline between now() + interval '47 hours' and now() + interval '49 hours' from lots where id = 'a1000000-0000-0000-0000-000000000002'),
  'and 48 hours to pay');
select is((select outcome from close_auction('a1000000-0000-0000-0000-000000000002')), 'already', 'closing it again changes nothing');
select is((select offer_version from lots where id = 'a1000000-0000-0000-0000-000000000002'), 1, 'not even the version');
select throws_ok(
  $$select * from place_bid('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000003', 100000)$$,
  '23514', 'bidding_over', 'and a bid on a closed lot is refused');

-- Nothing at the reserve: the riser fascia carries one bid below it, loaded as history.
select set_config('doormoney.trusted_load', 'on', true);
insert into bids (lot_id, patron_id, amount_cents) values ('a3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 1000);
select set_config('doormoney.trusted_load', 'off', true);
update lots set closes_at = now() - interval '1 second' where id = 'a3000000-0000-0000-0000-000000000003';
select is((select outcome from close_auction('a3000000-0000-0000-0000-000000000003')), 'unsold', 'a lot with nothing at the reserve goes unsold');
select is((select status::text from lots where id = 'a3000000-0000-0000-0000-000000000003'), 'unsold', 'and says so');

-- ---------------------------------------------------------------
-- Paying for a won bid: the purchase is bound to the offer.
-- ---------------------------------------------------------------
-- The seed's $520 bid is on the lot but is not the winner.
select throws_ok(
  $$insert into purchases (lot_id, patron_id, amount_cents, fee_cents, bid_id)
    values ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 52000, 7800,
            (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 52000))$$,
  '23514', 'offer_not_current', 'a purchase for a bid that did not win is refused');
select throws_ok(
  $$insert into purchases (lot_id, patron_id, amount_cents, fee_cents, bid_id)
    values ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 50000, 7500,
            (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500))$$,
  '23514', 'amount_not_the_bid', 'a purchase for the winning bid at a different amount is refused');
select throws_ok(
  $$insert into purchases (lot_id, patron_id, amount_cents, fee_cents, bid_id, offer_version)
    values ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 54500, 8175,
            (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500), 0)$$,
  '23514', 'offer_not_current', 'a purchase made under an older offer version is refused');
select throws_ok(
  $$insert into purchases (lot_id, patron_id, amount_cents, fee_cents, bid_id, payment_status)
    values ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 54500, 8175,
            (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500), 'held')$$,
  '23514', 'purchase_starts_unpaid', 'a purchase cannot be born paid');

select lives_ok(
  $$select begin_lot_purchase('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 54500, 8175,
      (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500))$$,
  'the winner can start paying');
select is((select offer_version from purchases where lot_id = 'a1000000-0000-0000-0000-000000000002' and payment_status = 'requires_payment'), 1,
  'and the purchase records the offer version it pays for');
select isnt((select expires_at from purchases where lot_id = 'a1000000-0000-0000-0000-000000000002' and payment_status = 'requires_payment'), null,
  'and when it stops counting as an attempt');
select throws_ok(
  $$select begin_lot_purchase('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 54500, 8175,
      (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500))$$,
  '23505', 'spot_being_taken', 'a second checkout on the same lot is refused while the first is live');

-- ---------------------------------------------------------------
-- Rolling. The deadline passes; a live checkout holds the roll back; then the lot moves on.
-- ---------------------------------------------------------------
select is((select outcome from roll_offer('a1000000-0000-0000-0000-000000000002')), 'not_due', 'a winner still inside their window is not rolled');

update purchases set expires_at = (select funding_deadline from lots where id = 'a1000000-0000-0000-0000-000000000002') + interval '1 hour'
 where lot_id = 'a1000000-0000-0000-0000-000000000002' and payment_status = 'requires_payment';
select is(
  (select outcome from roll_offer('a1000000-0000-0000-0000-000000000002', (select funding_deadline from lots where id = 'a1000000-0000-0000-0000-000000000002') + interval '1 minute')),
  'waiting', 'a checkout still in flight at the deadline is an attempt to pay, and the roll waits');

update purchases set expires_at = (select funding_deadline from lots where id = 'a1000000-0000-0000-0000-000000000002') - interval '1 minute',
       stripe_checkout_session_id = 'cs_test_stale'
 where lot_id = 'a1000000-0000-0000-0000-000000000002' and payment_status = 'requires_payment';
select results_eq(
  $$select outcome, expired_sessions from roll_offer('a1000000-0000-0000-0000-000000000002', (select funding_deadline from lots where id = 'a1000000-0000-0000-0000-000000000002') + interval '1 minute')$$,
  $$values ('rolled', array['cs_test_stale'])$$,
  'once the checkout has expired the roll goes ahead and names the session to expire at Stripe');
select is((select count(*)::int from purchases where lot_id = 'a1000000-0000-0000-0000-000000000002'), 0, 'the expired purchase is gone');
select isnt((select passed_at from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 54500), null, 'the winner who did not pay is marked passed');
select is(
  (select winner_bid_id from lots where id = 'a1000000-0000-0000-0000-000000000002'),
  (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 52000),
  'and the lot is offered to the next bid down');
select is((select offer_version from lots where id = 'a1000000-0000-0000-0000-000000000002'), 2, 'as offer version 2');
select is((select outcome from roll_offer('a1000000-0000-0000-0000-000000000002')), 'not_due', 'with a fresh 48 hours');

-- ---------------------------------------------------------------
-- A stale offer at fulfilment: the money is held, the lot is not sold.
-- ---------------------------------------------------------------
select lives_ok(
  $$select begin_lot_purchase('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 52000, 7800,
      (select id from bids where lot_id = 'a1000000-0000-0000-0000-000000000002' and amount_cents = 52000))$$,
  'the new winner starts paying');
-- Meanwhile the offer moves on (a third bid, loaded as history, and a roll done by hand).
select set_config('doormoney.trusted_load', 'on', true);
insert into bids (id, lot_id, patron_id, amount_cents) values ('d3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000003', 53000);
select set_config('doormoney.trusted_load', 'off', true);
update lots set winner_bid_id = 'd3000000-0000-0000-0000-000000000001', offer_version = 3 where id = 'a1000000-0000-0000-0000-000000000002';

select is(
  (select fulfil_lot_purchase(id, 'pi_stale', 'ch_stale') from purchases where lot_id = 'a1000000-0000-0000-0000-000000000002' and payment_status = 'requires_payment'),
  'stale', 'a payment for an offer that has moved on is not a sale');
select is((select payment_status::text from purchases where lot_id = 'a1000000-0000-0000-0000-000000000002' and stripe_charge_id = 'ch_stale'), 'held',
  'but the money is real and the purchase says so');
select is((select status::text from lots where id = 'a1000000-0000-0000-0000-000000000002'), 'pending_funding', 'the lot stays with its current winner');
select is(
  (select fulfil_lot_purchase(id, 'pi_stale', 'ch_stale') from purchases where lot_id = 'a1000000-0000-0000-0000-000000000002' and stripe_charge_id = 'ch_stale'),
  'already', 'and a second fulfilment of the same purchase does nothing');

-- ---------------------------------------------------------------
-- The whole path, the way it should go: close, pay, sold.
-- ---------------------------------------------------------------
update lots set closes_at = now() - interval '1 second' where id = 'a1000000-0000-0000-0000-000000000006';
select is((select outcome from close_auction('a1000000-0000-0000-0000-000000000006')), 'won', 'the merch table runner closes');
select lives_ok(
  $$select begin_lot_purchase('a1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000004', 61000, 9150,
      (select winner_bid_id from lots where id = 'a1000000-0000-0000-0000-000000000006'))$$,
  'its winner starts paying');
select is(
  (select fulfil_lot_purchase(id, 'pi_good', 'ch_good', 'cs_good') from purchases where lot_id = 'a1000000-0000-0000-0000-000000000006'),
  'sold', 'and the payment sells the lot');
select is((select status::text from lots where id = 'a1000000-0000-0000-0000-000000000006'), 'sold', 'the lot is sold');
select is((select funding_token from lots where id = 'a1000000-0000-0000-0000-000000000006'), null, 'and its claim link is dead');
select is(
  (select fulfil_lot_purchase(id, 'pi_good', 'ch_good', 'cs_good') from purchases where lot_id = 'a1000000-0000-0000-0000-000000000006'),
  'already', 'a duplicate webhook sells nothing twice');
select is((select outcome from close_auction('a1000000-0000-0000-0000-000000000006')), 'already', 'and a late close finds nothing to do');
select is((select outcome from roll_offer('a1000000-0000-0000-0000-000000000006', now() + interval '3 days')), 'already', 'nor does a late roll');

-- ---------------------------------------------------------------
-- Take it now, and the hold it puts on a lot.
-- ---------------------------------------------------------------
select lives_ok(
  $$select * from place_bid('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 40000, false, 'pm_rig', 'seti_rig')$$,
  'a bid at the reserve on the rig rundown, with the card that stored it');
-- One stored card, one bid (migration 0063): the SetupIntent that backs a bid backs no other.
select throws_ok(
  $$select * from place_bid('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 42000, false, 'pm_rig', 'seti_rig')$$,
  '23505', null, 'a second bid carrying the same SetupIntent is refused');
select throws_ok(
  $$insert into bids (lot_id, patron_id, amount_cents, stripe_payment_method_id, stripe_setup_intent_id)
    values ('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 42000, 'pm_rig', 'seti_rig')$$,
  '23505', null, 'and so is one inserted around the function');
select lives_ok(
  $$select begin_lot_purchase('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 60000, 9000)$$,
  'a patron takes it at the take-it-now price while the bidding is below it');
select is((select status::text from lots where id = 'a3000000-0000-0000-0000-000000000001'), 'pending_funding', 'which holds the lot');
select throws_ok(
  $$select * from place_bid('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 45000)$$,
  '23514', 'spot_on_hold', 'and a bid during the hold is told so');

update purchases set expires_at = now() - interval '1 minute' where lot_id = 'a3000000-0000-0000-0000-000000000001';
select is(
  (select outcome from roll_offer('a3000000-0000-0000-0000-000000000001', now())),
  'not_due', 'the hold has its own deadline; before it the roll leaves the lot alone');
update lots set funding_deadline = now() - interval '1 minute' where id = 'a3000000-0000-0000-0000-000000000001';
select is(
  (select outcome from roll_offer('a3000000-0000-0000-0000-000000000001', now())),
  'reopened', 'a take-it-now nobody finished paying for goes back on the board');
select is((select status::text from lots where id = 'a3000000-0000-0000-0000-000000000001'), 'open', 'open again');

select lives_ok(
  $$select * from place_bid('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 60000)$$,
  'a bid reaches the take-it-now number');
select throws_ok(
  $$select begin_lot_purchase('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 60000, 9000)$$,
  '23514', 'bidding_passed_take_it_now', 'after which nobody can take it outright');

-- ---------------------------------------------------------------
-- A fixed price.
-- ---------------------------------------------------------------
select throws_ok(
  $$select begin_lot_purchase('a3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 4000, 600)$$,
  '23514', 'amount_not_the_price', 'a fixed-price spot is paid for at its price');
select lives_ok(
  $$select begin_lot_purchase('a3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 5000, 750)$$,
  'and at its price it goes through');
update purchases set stripe_checkout_session_id = 'cs_fixed_stale', expires_at = now() - interval '1 minute' where lot_id = 'a3000000-0000-0000-0000-000000000002';
select results_eq(
  $$select expire_stale_checkouts('a3000000-0000-0000-0000-000000000002')$$,
  $$values (array['cs_fixed_stale'])$$,
  'an expired checkout is cleared and its session named');
select is((select status::text from lots where id = 'a3000000-0000-0000-0000-000000000002'), 'open', 'and the fixed-price spot is back on the board');

-- ---------------------------------------------------------------
-- None of it is for the browser.
-- ---------------------------------------------------------------
set local role anon;
select throws_ok($$select * from place_bid('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 70000)$$, '42501', null, 'anon cannot place a bid through the function');
select throws_ok($$select * from close_auction('a3000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon cannot close an auction');
select throws_ok($$select * from roll_offer('a3000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon cannot roll an offer');
select throws_ok($$select fulfil_lot_purchase('00000000-0000-0000-0000-000000000000')$$, '42501', null, 'anon cannot fulfil a purchase');
select throws_ok($$select begin_lot_purchase('a3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 5000, 750)$$, '42501', null, 'anon cannot start a purchase');
reset role;

select * from finish();
rollback;
