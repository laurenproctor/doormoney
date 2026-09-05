-- What the Data API allows and refuses, for each kind of caller.
--
-- Run with `npm run test:db:docker` (one throwaway Postgres, no Supabase stack, and what CI runs)
-- or with `supabase test db` against a local stack.
--
-- These are the Phase 1 gate. Every "refuses" test here failed before migration 0022: each one is a
-- hole that was reproduced against a local stack, not a hypothetical.
--
-- The four callers: an anonymous visitor (anon), the musician who owns the act (authenticated with
-- their own uid), a different musician (authenticated with someone else's uid), and the service role
-- the server uses for webhooks and payouts.

begin;
create extension if not exists pgtap with schema extensions;
-- `supabase test db` provides this schema; creating it keeps the file runnable under plain psql too.
create schema if not exists tests;
select plan(37);

-- ---------------------------------------------------------------
-- Fixtures. The seed gives us two acts, their lots, bids and patrons.
-- ---------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@example.com','x',now(),now(),now()),
       ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@example.com','x',now(),now(),now())
on conflict (id) do nothing;

update acts set owner_id='11111111-1111-1111-1111-111111111111' where slug='gutter-hymns';
update acts set owner_id='22222222-2222-2222-2222-222222222222' where slug='rosie-bassoon';
update acts set stripe_account_id='acct_secret', stripe_payouts_enabled=true where slug='gutter-hymns';
update lots set funding_token='tok_secret' where id=(select id from lots order by id limit 1);
-- A patron who asked to stay anonymous still has a real name on the row.
update patrons set name='Dana Whitfield' where id=(select patron_id from bids where anonymous order by id limit 1);

create or replace function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
end; $$;

create or replace function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end; $$;

-- ===============================================================
-- An anonymous visitor
-- ===============================================================
select tests.as_anon();

select throws_ok(
  'select stripe_account_id from acts limit 1', '42501',
  null, 'anon cannot read an act''s Connect account id');

select throws_ok(
  'select stripe_payouts_enabled from acts limit 1', '42501',
  null, 'anon cannot read an act''s payout flag');

select throws_ok(
  'select funding_token from lots limit 1', '42501',
  null, 'anon cannot read a lot''s funding token');

select throws_ok(
  'select patron_id from bids limit 1', '42501',
  null, 'anon cannot read the patron behind a bid');

select throws_ok(
  'select name from patron_names limit 1', '42501',
  null, 'anon cannot read the patron roster');

-- A bid carries the card that pays it if it wins (migration 0028). The grant on bids names its
-- columns one by one, so these were never added to it; this is the assertion that keeps it so.
select throws_ok(
  'select stripe_payment_method_id from bids limit 1', '42501',
  null, 'anon cannot read the card saved against a bid');

select throws_ok(
  'select stripe_customer_id from patrons limit 1', '42501',
  null, 'anon cannot read a patron''s Stripe customer');

-- The boards render off this one. Migration 0022 revoked acts.owner_id from anon, and the owner
-- policy on runs from 0005 asked its question inline, so it needed that column to evaluate at all;
-- Postgres has to evaluate every permissive policy before it can OR them, so "public read runs"
-- never got a look in and every board went to 404. Migration 0023 moved the policy behind
-- owns_act(), a security definer. This is the assertion that was missing when that shipped.
select lives_ok(
  'select id, slug, title from runs',
  'anon can still read a run, which is what makes a board render');

select lives_ok(
  'select slug, name, city from acts',
  'anon can still read the public part of an act');

select lives_ok(
  'select id, price_cents, status from lots',
  'anon can still read a lot''s public terms');

select lives_ok(
  'select amount_cents, anonymous from bids',
  'anon can still read bid amounts for the board');

-- Stronger than it was. This used to assert that anon read zero rows, which was true because of
-- RLS while the table grant stayed wide open. Migration 0028 revoked the grant, so the read is now
-- refused outright and a future policy cannot quietly hand out an email address or a customer id.
select throws_ok(
  'select count(*) from patrons', '42501',
  null, 'anon cannot read the patrons table at all');

select is(
  (select count(*)::int from purchases), 0,
  'anon reads no rows from purchases');

select is(
  (select count(*)::int from payout_schedule), 0,
  'anon reads no rows from the payout schedule');

select is(
  (select count(*)::int from backings), 0,
  'anon reads no rows from backings');

-- The masked view is the only route to a bidder's name, and it masks.
select lives_ok(
  'select patron_name from public_bids limit 1',
  'anon can read the masked public bid view');

select is(
  (select count(*)::int from public_bids where anonymous and patron_name is not null), 0,
  'no anonymous bid carries a name in the public view');

select isnt(
  (select patron_name from public_bids where not anonymous and patron_name is not null limit 1), null,
  'a bid that is not anonymous still shows its patron''s name');

reset role;

-- ===============================================================
-- The musician who owns the act
-- ===============================================================
select tests.as_user('11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$update acts set stripe_account_id='acct_attacker' where slug='gutter-hymns'$$, '42501',
  null, 'a musician cannot rewrite their own Stripe account id');

select throws_ok(
  $$update acts set stripe_payouts_enabled=true where slug='gutter-hymns'$$, '42501',
  null, 'a musician cannot turn their own payouts on');

select throws_ok(
  $$update acts set founding=true where slug='gutter-hymns'$$, '42501',
  null, 'a musician cannot grant themselves founding status');

select throws_ok(
  $$update acts set owner_id='22222222-2222-2222-2222-222222222222' where slug='gutter-hymns'$$, '42501',
  null, 'a musician cannot hand their act to another account');

select throws_ok(
  $$update profiles set email='someone@else.example' where id=auth.uid()$$, '42501',
  null, 'a musician cannot change the email their account signs in with');

select lives_ok(
  $$update acts set name='Gutter Hymns', bio='A band.' where slug='gutter-hymns'$$,
  'a musician can still edit their act''s own description');

select throws_ok(
  $$update lots set status='sold' where run_id in (select id from runs where act_id=(select id from acts where slug='gutter-hymns'))$$, '42501',
  null, 'a musician cannot mark their own lot sold');

select throws_ok(
  $$update lots set winner_bid_id=null where run_id in (select id from runs where act_id=(select id from acts where slug='gutter-hymns'))$$, '42501',
  null, 'a musician cannot choose the winner of their own auction');

select throws_ok(
  $$update lots set funding_token='tok_mine' where run_id in (select id from runs where act_id=(select id from acts where slug='gutter-hymns'))$$, '42501',
  null, 'a musician cannot mint a funding token');

select throws_ok(
  $$update runs set status='cancelled' where act_id=(select id from acts where slug='gutter-hymns')$$, '23514',
  null, 'a musician cannot cancel a run through the Data API');

select throws_ok(
  $$insert into acts (owner_id, slug, name, type, city) values ('11111111-1111-1111-1111-111111111111','admin','Admin','soloist','New York')$$,
  '23514', null, 'a reserved word cannot be taken as a board address');

select throws_ok(
  $$update profiles set username='dashboard' where id=auth.uid()$$,
  '23514', null, 'a reserved word cannot be taken as a handle');

select throws_ok(
  $$insert into acts (owner_id, slug, name, type, city) values ('11111111-1111-1111-1111-111111111111','second-act','Second','soloist','New York')$$,
  '23505', null, 'an account cannot hold a second act');

reset role;

-- ===============================================================
-- A different musician
-- ===============================================================
select tests.as_user('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from acts where slug='gutter-hymns' and name='Gutter Hymns'), 1,
  'another musician can see a public act, as any visitor can');

select lives_ok(
  $$update acts set name='Hijacked' where slug='gutter-hymns'$$,
  'an update against someone else''s act runs');

select is(
  (select name from acts where slug='gutter-hymns'), 'Gutter Hymns',
  'but it changes nothing: row ownership refused it');

reset role;

-- ===============================================================
-- Constraints that hold for everyone
-- ===============================================================
select throws_ok(
  $$delete from lots where id in (select lot_id from bids limit 1)$$,
  '23503', null, 'a lot with bids on it cannot be deleted, even by the service role');

-- ===============================================================
-- The service role still does its job
-- ===============================================================
set local role service_role;

select lives_ok(
  $$update acts set stripe_account_id='acct_from_webhook', stripe_payouts_enabled=true where slug='gutter-hymns'$$,
  'the service role can still write Stripe state from a webhook');

select lives_ok(
  $$update runs set status='cancelled' where act_id=(select id from acts where slug='gutter-hymns')$$,
  'the service role can still cancel a run');

reset role;

select * from finish();
rollback;
