-- What the ledger allows and refuses (migration 0055).
--
-- Run with `npm run test:db:docker` (what CI runs) or `supabase test db` against a local stack.
--
-- Four things are under test.
--
--   The boundary. Entries carry amounts and Stripe object ids for every payment on the platform,
--   so nothing in a browser reads or writes a byte of them.
--
--   Append only, in both layers. The grants withhold update and delete from every role, and the
--   trigger refuses them even where a grant would not. The second layer is tested as the
--   superuser, which grants cannot stop, because that is the only way to show the trigger is
--   doing work rather than sitting behind a privilege check that would have refused anyway.
--
--   The balance. An event whose entries do not sum to zero cannot be written. The constraint is
--   deferred in normal use, so it is set immediate here to see it fire.
--
--   The sample data's opening entries, which are the owner's decision of 2026-09-22: sample rows
--   balance rather than being excluded by name.
--
--   The two ways of reading it (migration 0065): the books by account with the sample data left
--   out, and the books by payment with it in, both read by the service role and nobody else.

begin;
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
select plan(40);

-- The three sample purchases from supabase/seed.sql, held, unrefunded, no slices.
-- 120000/18000, 35000/5250 and 6000/900, so nine opening entries between them.

-- ---------------------------------------------------------------
-- Nothing in a browser touches any of it.
-- ---------------------------------------------------------------
set local role anon;
select throws_ok('select * from ledger_entries limit 1', '42501', null,
  'anon cannot read the ledger');
select throws_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values ((select id from purchases limit 1), 'platform_cash', 1, 'forged')$$,
  '42501', null, 'anon cannot write an entry');
select throws_ok($$update ledger_entries set amount_cents = 0$$, '42501', null,
  'anon cannot restate one');
select throws_ok('delete from ledger_entries', '42501', null, 'anon cannot remove one');
select throws_ok('truncate ledger_entries', '42501', null, 'nor remove them all');
select throws_ok('select * from ledger_accounts limit 1', '42501', null,
  'anon cannot read the chart of accounts');
select throws_ok('select * from ledger_imbalances limit 1', '42501', null,
  'anon cannot read what is out of balance');
select throws_ok('select * from ledger_balances limit 1', '42501', null,
  'nor the books by account');
select throws_ok('select * from ledger_payment_balances limit 1', '42501', null,
  'nor the books by payment');
reset role;

set local role authenticated;
select throws_ok('select * from ledger_entries limit 1', '42501', null,
  'a signed-in account cannot read the ledger either');
select throws_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values ((select id from purchases limit 1), 'platform_fee', -1, 'forged')$$,
  '42501', null, 'nor credit Door Money revenue to itself');
select throws_ok('select * from ledger_accounts limit 1', '42501', null,
  'nor read the chart of accounts');
select throws_ok('select * from ledger_imbalances limit 1', '42501', null,
  'nor read what is out of balance');
select throws_ok('select * from ledger_balances limit 1', '42501', null,
  'nor the books by account');
select throws_ok('select * from ledger_payment_balances limit 1', '42501', null,
  'nor the books by payment');
reset role;

-- Neither view can be written through by anybody, whatever its shape becomes (migration 0030's rule).
select is(has_table_privilege('service_role', 'public.ledger_balances', 'INSERT, UPDATE, DELETE, TRUNCATE'), false,
  'the books by account are a read path for the service role and never a write path');
select is(has_table_privilege('service_role', 'public.ledger_payment_balances', 'INSERT, UPDATE, DELETE, TRUNCATE'), false,
  'and so are the books by payment');

-- ---------------------------------------------------------------
-- The sample data's opening entries.
-- ---------------------------------------------------------------
select is((select count(*)::int from ledger_entries where event_key = 'seed_opening'), 9,
  'three sample purchases opened three accounts each');
select is((select count(*)::int from ledger_entries where event_key = 'seed_opening' and not is_seed), 0,
  'and every one of them says it is sample data');
select is((select sum(amount_cents)::bigint from ledger_entries where event_key = 'seed_opening'), 0::bigint,
  'the opening entries balance');
select is(
  (select sum(amount_cents)::bigint from ledger_entries
    where event_key = 'seed_opening' and account_key = 'platform_cash'),
  161000::bigint,
  'the cash opened at the three sample charges added up');
select is_empty('select * from ledger_imbalances',
  'and nothing anywhere is out of balance');
select is(
  (select balance_cents from ledger_balances where account_key = 'platform_cash'), 0::bigint,
  'the books by account leave the sample data out, so the cash on the platform reads zero');
select is(
  (select balance_cents from ledger_payment_balances
    where purchase_id = (select id from purchases order by amount_cents desc limit 1) and account_key = 'platform_cash'),
  120000::bigint,
  'the books by payment keep it in, so the biggest sample sponsorship shows its own charge');
select is((select kind from ledger_accounts where key = 'organizer_receivable'), 'asset',
  'money refunded by hand beyond what was held has an account to wait in, on the asset side');

-- ---------------------------------------------------------------
-- Append only, layer one: the grants. service_role writes the ledger and may not rewrite it.
-- ---------------------------------------------------------------
set local role service_role;
-- Truncate first. Once this session has written an entry, the deferred balance check is pending
-- and TRUNCATE raises 55006 for that reason before it ever reaches the privilege check, which
-- would leave this assertion passing for the wrong reason.
select throws_ok('truncate ledger_entries', '42501', null,
  'the service role cannot truncate the ledger');
select lives_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values
      ((select id from purchases order by amount_cents desc limit 1), 'unearned_fee',   300, 'release_test'),
      ((select id from purchases order by amount_cents desc limit 1), 'platform_fee',  -300, 'release_test')$$,
  'but it writes a balanced event');
select is(
  (select balance_cents from ledger_balances where account_key = 'platform_fee'), (-300)::bigint,
  'and the books by account count it as revenue, from its own side of the ledger');
select throws_ok($$update ledger_entries set amount_cents = 999 where event_key = 'release_test'$$,
  '42501', null, 'and cannot restate it afterwards');
select throws_ok($$delete from ledger_entries where event_key = 'release_test'$$,
  '42501', null, 'nor delete it');
reset role;

-- ---------------------------------------------------------------
-- Append only, layer two: the trigger. As the superuser, where no grant refuses anything, so a
-- pass here is the trigger and nothing else.
-- ---------------------------------------------------------------
select throws_ok($$update ledger_entries set amount_cents = 999 where event_key = 'release_test'$$,
  '42501', null, 'not even the superuser can restate an entry: the trigger refuses it');
select throws_ok($$delete from ledger_entries where event_key = 'release_test'$$,
  '42501', null, 'nor delete one');

-- ---------------------------------------------------------------
-- The balance, seen firing. Deferred in normal use so a charge's three entries can be written one
-- at a time; immediate here so a single unbalanced statement raises where the test can catch it.
-- ---------------------------------------------------------------
set constraints ledger_entries_balance immediate;
select throws_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values
      ((select id from purchases order by amount_cents desc limit 1), 'platform_cash',      10000, 'lopsided'),
      ((select id from purchases order by amount_cents desc limit 1), 'organizer_liability', -8500, 'lopsided')$$,
  '23514', null,
  'an event that does not sum to zero cannot be written, however plausible the two halves look');
select lives_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values
      ((select id from purchases order by amount_cents desc limit 1), 'platform_cash',       10000, 'balanced'),
      ((select id from purchases order by amount_cents desc limit 1), 'organizer_liability',  -8500, 'balanced'),
      ((select id from purchases order by amount_cents desc limit 1), 'unearned_fee',         -1500, 'balanced')$$,
  'the same event with the fee accounted for goes in');
set constraints ledger_entries_balance deferred;

-- ---------------------------------------------------------------
-- One event writes one entry per account, which is what makes event_key an idempotency key: a
-- webhook delivered twice cannot charge the books twice.
-- ---------------------------------------------------------------
select throws_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values ((select id from purchases order by amount_cents desc limit 1), 'platform_cash', 10000, 'balanced')$$,
  '23505', null,
  'the same account in the same event on the same payment is a duplicate, not a second charge');

-- ---------------------------------------------------------------
-- The shape of an entry.
--
-- One backing, because the seed has none and `(select id from backings limit 1)` is therefore
-- null: the "never to both" assertion passed for the wrong reason until this existed. Rolled back
-- with the rest of the file.
-- ---------------------------------------------------------------
insert into backings (id, run_id, patron_id, tier, amount_cents, fee_cents, display_name, payment_status)
values ('dd000000-0000-0000-0000-0000000000ff', '22222222-2222-2222-2222-222222222222',
        (select id from patrons limit 1), 'thank_you', 2500, 375, 'A backer', 'held');

select throws_ok(
  $$insert into ledger_entries (purchase_id, backing_id, account_key, amount_cents, event_key)
    values ((select id from purchases limit 1), 'dd000000-0000-0000-0000-0000000000ff', 'platform_cash', 1, 'both')$$,
  '23514', null, 'an entry belongs to a purchase or a backing, never to both');
select throws_ok(
  $$insert into ledger_entries (account_key, amount_cents, event_key)
    values ('platform_cash', 1, 'neither')$$,
  '23514', null, 'and never to neither');
select throws_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values ((select id from purchases limit 1), 'platform_cash', 0, 'nothing')$$,
  '23514', null, 'an entry for no money is not an entry');
select throws_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, currency, event_key)
    values ((select id from purchases limit 1), 'platform_cash', 100, 'GBP', 'other_currency')$$,
  '23514', null,
  'the books are in one currency, and a second one arrives as a migration rather than as a row');
select throws_ok(
  $$insert into ledger_entries (purchase_id, account_key, amount_cents, event_key)
    values ((select id from purchases limit 1), 'imagination', 100, 'invented')$$,
  '23503', null, 'an account Door Money does not have cannot be posted to');

select * from finish();
rollback;
