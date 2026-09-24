-- Who may hold an option at checkout (migration 0064).
--
-- Run with `npm run test:db:docker` (what CI runs) or `supabase test db` against a local stack.
--
-- Three things are under test. The boundary: the attempts table holds addresses and email
-- addresses, and nothing in a browser reads, writes or calls any of it. The limits: the
-- sixty-first try from one address in ten minutes, the thirty-first on one option, the
-- twenty-sixth open hold from one address and the third for one email are each refused with a
-- word, and the attempt that was refused is counted like any other. The address is loose on
-- purpose (a room at a show shares one) and the email is the key that is tight. And the
-- hand-off: an ordinary request reaches begin_lot_purchase unchanged and gets its refusals back
-- as the same words it raised.

begin;
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
select plan(35);

-- ---------------------------------------------------------------
-- Nothing in a browser touches any of it.
-- ---------------------------------------------------------------
set local role anon;
select throws_ok('select * from checkout_attempts limit 1', '42501', null, 'anon cannot read the attempts log');
select throws_ok(
  $$insert into checkout_attempts (client_ip, lot_id, email) values ('1.1.1.1', 'a1000000-0000-0000-0000-000000000002', 'x@example.com')$$,
  '42501', null, 'anon cannot write an attempt');
select throws_ok('delete from checkout_attempts', '42501', null, 'anon cannot clear the log');
select throws_ok(
  $$select * from begin_lot_purchase_limited('1.1.1.1', 'x@example.com', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 5000, 750)$$,
  '42501', null, 'anon cannot ask for a hold through the function');
select throws_ok('select prune_checkout_attempts()', '42501', null, 'nor prune the log');
reset role;

set local role authenticated;
select throws_ok('select * from checkout_attempts limit 1', '42501', null, 'a signed-in account cannot read it either');
select throws_ok(
  $$select * from begin_lot_purchase_limited('1.1.1.1', 'x@example.com', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 5000, 750)$$,
  '42501', null, 'nor ask for a hold');
reset role;

-- ---------------------------------------------------------------
-- Fixtures: forty fixed-price spots on the seed's open Gutter Hymns fundraiser, born the way
-- auctions_test.sql makes its own (grandfathered, because they carry no offer terms). A room's
-- worth, because the per-address cap is a room's worth.
-- ---------------------------------------------------------------
insert into lots (id, run_id, surface_key, label, price_cents, mode, status, terms_grandfathered)
select ('a4000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, '22222222-2222-2222-2222-222222222222', 'hang_tags', 'Hold test ' || i, 5000, 'fixed', 'open', true
  from generate_series(1, 40) i;

-- One try: the route's call, with the fee it would compute, answered as a word ('ok' for a hold).
create function tests.try(ip text, email text, lot uuid, patron uuid, amount int default 5000, bid uuid default null, at_time timestamptz default now())
returns text language sql as $$
  select coalesce(refusal, 'ok') from begin_lot_purchase_limited(ip, email, lot, patron, amount, (amount * 15 + 99) / 100, bid, null, at_time)
$$;

-- ---------------------------------------------------------------
-- The ordinary path is begin_lot_purchase, exactly as before.
-- ---------------------------------------------------------------
select is(tests.try('203.0.113.1', 'buyer@example.com', 'a4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001'),
  'ok', 'an ordinary request holds the option');
select is((select status::text from lots where id = 'a4000000-0000-0000-0000-000000000001'), 'pending_funding',
  'and the lot is held, by begin_lot_purchase as before');
select is((select count(*)::int from checkout_attempts where client_ip = '203.0.113.1'), 1, 'the attempt is written down');
select is((select p.payment_status::text from checkout_attempts a join purchases p on p.id = a.purchase_id where a.client_ip = '203.0.113.1'),
  'requires_payment', 'and points at the purchase it made');

select is(tests.try('203.0.113.2', 'other@example.com', 'a4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002'),
  'spot_being_taken', 'a second buyer on a held option is refused with the word begin_lot_purchase raised');
select is((select count(*)::int from checkout_attempts where client_ip = '203.0.113.2'), 1, 'and that refused attempt is counted too');
select is((select count(*)::int from purchases where lot_id = 'a4000000-0000-0000-0000-000000000001'), 1, 'and nothing else was written');

-- ---------------------------------------------------------------
-- 1. Attempts from one address: sixty in ten minutes. Loose, because a show shares an address.
-- ---------------------------------------------------------------
-- All fifty-nine land on the one held option, so the per-option backstop (thirty) answers the
-- later ones before the hold decision does. What matters here is that none of the sixty is
-- refused for the address.
select is(
  (select count(*)::int from (select tests.try('203.0.113.2', 'other@example.com', 'a4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002') as word
                                from generate_series(1, 59)) s where word in ('spot_being_taken', 'too_many_on_lot')),
  59, 'fifty-nine more tries from the same address are each answered by something other than the address limit');
select is(tests.try('203.0.113.2', 'other@example.com', 'a4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002'),
  'too_many_from_ip', 'the sixty-first try from one address in ten minutes is refused');
select is((select count(*)::int from checkout_attempts where client_ip = '203.0.113.2'), 61, 'and counted, so a client that keeps trying keeps itself out');
select is(tests.try('203.0.113.2', 'other@example.com', 'a4000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002'),
  'too_many_from_ip', 'whichever option it asks for');
select is(tests.try('203.0.113.2', 'other@example.com', 'a4000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', at_time => now() + interval '11 minutes'),
  'ok', 'eleven minutes on, the window has passed and the address is heard again');
-- That hold was made at a clock eleven minutes ahead; take it off the board so the rest of the
-- suite runs at now().
delete from purchases where lot_id = 'a4000000-0000-0000-0000-000000000002';
update lots set status = 'open', funding_deadline = null where id = 'a4000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------
-- 2. Attempts on one option: thirty in ten minutes, from anywhere.
-- ---------------------------------------------------------------
select is(
  (select count(*)::int from (select tests.try('198.51.100.' || i, 'e' || i || '@example.com', 'a4000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003') as word
                                from generate_series(1, 30) i) s where word in ('ok', 'spot_being_taken')),
  30, 'thirty tries on one option from thirty places each reach the hold decision');
select is(tests.try('198.51.100.99', 'fresh@example.com', 'a4000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003'),
  'too_many_on_lot', 'the thirty-first is refused whoever sends it');
select is(tests.try('198.51.100.99', 'fresh@example.com', 'a4000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000003'),
  'ok', 'and the same sender holds a different option, because the limit was the option''s');

-- ---------------------------------------------------------------
-- 3. Open holds from one address: twenty-five at a time, a room full of buyers on one Wi-Fi.
-- ---------------------------------------------------------------
select is(
  (select count(*)::int from (select tests.try('203.0.113.3', 'h' || i || '@example.com', ('a4000000-0000-0000-0000-0000000000' || lpad((i + 4)::text, 2, '0'))::uuid, 'c1000000-0000-0000-0000-000000000004') as word
                                from generate_series(1, 25) i) s where word = 'ok'),
  25, 'twenty-five patrons behind one address each hold an option under their own email');
select is(tests.try('203.0.113.3', 'h26@example.com', 'a4000000-0000-0000-0000-000000000030', 'c1000000-0000-0000-0000-000000000004'),
  'too_many_holds_ip', 'a twenty-sixth open hold from the same address is refused');
select is((select status::text from lots where id = 'a4000000-0000-0000-0000-000000000030'), 'open', 'and that option was not held');

-- A hold that lapsed is nobody's, and stops counting on its own.
update purchases set expires_at = now() - interval '1 minute' where lot_id = 'a4000000-0000-0000-0000-000000000005';
select is(tests.try('203.0.113.3', 'h26@example.com', 'a4000000-0000-0000-0000-000000000030', 'c1000000-0000-0000-0000-000000000004'),
  'ok', 'once one of the twenty-five has lapsed there is room for another');

-- ---------------------------------------------------------------
-- 4. Open holds for one email: two at a time, from wherever they come. This is the key that is
--    tight, because one buyer is one email whatever address they are on.
-- ---------------------------------------------------------------
select is(tests.try('203.0.113.4', 'two@example.com', 'a4000000-0000-0000-0000-000000000031', 'c1000000-0000-0000-0000-000000000005'), 'ok', 'one hold for an email');
select is(tests.try('203.0.113.5', 'Two@Example.com', 'a4000000-0000-0000-0000-000000000032', 'c1000000-0000-0000-0000-000000000005'), 'ok', 'two, from another address and in other capitals');
select is(tests.try('203.0.113.6', 'two@example.com', 'a4000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000005'),
  'too_many_holds_email', 'a third open hold for the same email is refused');
select is((select status::text from lots where id = 'a4000000-0000-0000-0000-000000000002'), 'open', 'and that option was not held');

-- ---------------------------------------------------------------
-- A buyer paying for an auction they won is not making a hold. The caps on holds are not asked;
-- the attempt is still counted.
-- ---------------------------------------------------------------
update runs set bidding_closes_at = now() + interval '1 hour' where id = '22222222-2222-2222-2222-222222222222';
update lots set closes_at = now() - interval '1 minute' where id = 'a1000000-0000-0000-0000-000000000002';
select is((select outcome from close_auction('a1000000-0000-0000-0000-000000000002')), 'won', 'the seed''s guitar straps close to their top bid');
select is(
  tests.try('203.0.113.3', 'two@example.com', 'a1000000-0000-0000-0000-000000000002',
            (select b.patron_id from lots l join bids b on b.id = l.winner_bid_id where l.id = 'a1000000-0000-0000-0000-000000000002'),
            (select b.amount_cents from lots l join bids b on b.id = l.winner_bid_id where l.id = 'a1000000-0000-0000-0000-000000000002'),
            (select winner_bid_id from lots where id = 'a1000000-0000-0000-0000-000000000002')),
  'ok', 'the winner pays from an address at its hold cap, under an email at its hold cap');
select is((select count(*)::int from checkout_attempts where lot_id = 'a1000000-0000-0000-0000-000000000002'), 1, 'and the attempt is on the log like any other');

-- ---------------------------------------------------------------
-- Housekeeping: a day, and no longer.
-- ---------------------------------------------------------------
insert into checkout_attempts (client_ip, lot_id, email, created_at) values
  ('192.0.2.1', 'a4000000-0000-0000-0000-000000000001', 'old@example.com', now() - interval '2 days'),
  ('192.0.2.2', 'a4000000-0000-0000-0000-000000000001', 'young@example.com', now() - interval '23 hours');
select is(prune_checkout_attempts(), 1, 'pruning drops the attempt older than a day');
select is((select count(*)::int from checkout_attempts where client_ip in ('192.0.2.1', '192.0.2.2')), 1, 'and keeps the one inside it');

select * from finish();
rollback;
