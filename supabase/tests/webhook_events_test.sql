-- What a webhook event row allows and refuses (migration 0039).
--
-- Run with `npm run test:db:docker` (what CI runs) or `supabase test db` against a local stack.
--
-- Two things are under test. The first is the boundary: the payload holds email addresses and
-- amounts, so nothing in a browser reads or writes a byte of it. The second is the state machine:
-- a row that says it is finished carries the time it finished, and a row still waiting for a
-- worker does not, because "settled" and "waiting" were the distinction the old three-column
-- table could not make at all.

begin;
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
select plan(19);

-- ---------------------------------------------------------------
-- Nothing in a browser touches this table.
-- ---------------------------------------------------------------
set local role anon;
select throws_ok('select * from stripe_events limit 1', '42501', null, 'anon cannot read the Stripe event log');
select throws_ok(
  $$insert into stripe_events (id, type) values ('evt_forged', 'charge.refunded')$$,
  '42501', null, 'anon cannot invent an event');
select throws_ok(
  $$update stripe_events set status = 'processed'$$,
  '42501', null, 'anon cannot mark an event handled');
select throws_ok('delete from stripe_events', '42501', null, 'anon cannot delete an event');
select throws_ok('truncate stripe_events', '42501', null, 'nor truncate them all');
reset role;

set local role authenticated;
select throws_ok('select * from stripe_events limit 1', '42501', null, 'a signed-in account cannot read it either');
select throws_ok(
  $$update stripe_events set last_error = null$$,
  '42501', null, 'nor clear an error off one');
reset role;

-- ---------------------------------------------------------------
-- The service role, which is what the webhook and the worker are.
-- ---------------------------------------------------------------
set local role service_role;

select lives_ok(
  $$insert into stripe_events (id, type, payload, api_version)
    values ('evt_test_1', 'charge.refunded', '{"id":"evt_test_1","type":"charge.refunded"}'::jsonb, '2014-03-13')$$,
  'the webhook can write an event down');

select is((select status::text from stripe_events where id = 'evt_test_1'), 'received',
  'a new event starts received, which is stored and not yet claimed');
select is((select attempts from stripe_events where id = 'evt_test_1'), 0, 'with no attempts behind it');
select is((select settled_at from stripe_events where id = 'evt_test_1'), null, 'and nothing settled');
select is((select payload->>'type' from stripe_events where id = 'evt_test_1'), 'charge.refunded',
  'the payload is kept whole, so a failed event can be replayed from what Stripe sent');

-- ---------------------------------------------------------------
-- A row that says it is finished carries the time it finished.
-- ---------------------------------------------------------------
select throws_ok(
  $$update stripe_events set status = 'processed' where id = 'evt_test_1'$$,
  '23514', null, 'an event cannot be processed without the moment it was');
select throws_ok(
  $$update stripe_events set status = 'retryable', settled_at = now() where id = 'evt_test_1'$$,
  '23514', null, 'and one still waiting for a worker cannot claim to be settled');
select lives_ok(
  $$update stripe_events set status = 'processed', settled_at = now() where id = 'evt_test_1'$$,
  'settling records both at once');

select throws_ok(
  $$update stripe_events set attempts = -1 where id = 'evt_test_1'$$,
  '23514', null, 'attempts cannot run backwards past zero');

-- ---------------------------------------------------------------
-- When the row last moved is the trigger's to say, not a caller's.
--
-- now() is fixed for the length of a transaction, so the insert below backdates updated_at by hand
-- and the update is what brings it forward. Inside one transaction there is no other way to tell
-- the trigger fired.
-- ---------------------------------------------------------------
insert into stripe_events (id, type, updated_at) values ('evt_test_2', 'transfer.created', '2020-01-01T00:00:00Z');
update stripe_events set last_error = 'something' where id = 'evt_test_2';
select ok((select updated_at from stripe_events where id = 'evt_test_2') > '2020-01-02T00:00:00Z'::timestamptz,
  'any write brings updated_at forward, which is what tells a worker a row has stalled');

update stripe_events set updated_at = '2019-01-01T00:00:00Z' where id = 'evt_test_2';
select ok((select updated_at from stripe_events where id = 'evt_test_2') > '2020-01-02T00:00:00Z'::timestamptz,
  'and a caller cannot backdate it to hide a row from the reclaim');

-- The six states the worker branches on. A seventh added without touching src/lib/stripeEvents.ts
-- would be a state nothing handles.
select is((select count(*)::int from pg_enum where enumtypid = 'stripe_event_status'::regtype), 6,
  'the event states are the six the worker knows');

reset role;

select * from finish();
rollback;
