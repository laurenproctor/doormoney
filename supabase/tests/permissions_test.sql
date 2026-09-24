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
select plan(130);

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

-- A draft with a priced option, owned by the first account. Migration 0048: a draft's options are
-- as private as the draft, in every category. This one is music, where the hole was oldest.
-- It carries music's own details, so the suites below that cancel every fundraiser of this act can.
insert into runs (id,act_id,title,slug,status,category_key,kind,starts_on,ends_on,show_count)
  select 'a0480000-0000-4000-8000-000000000001', id, 'Unannounced tour', 'unannounced-tour-0048', 'draft', 'music', 'tour', '2027-03-01', '2027-03-20', 12 from acts where slug='gutter-hymns';
-- These spots carry no offer terms, as every spot did before migration 0060, and their fundraiser is
-- already public, so they are marked grandfathered the way 0060 marks the real ones (0061 refuses the
-- shape otherwise). The test is about what it was about, not about offer terms.
insert into lots (id,run_id,surface_key,price_cents,mode, terms_grandfathered) values
  ('a0480000-0000-4000-8000-0000000000a1','a0480000-0000-4000-8000-000000000001','posts_email',77700,'fixed', true);

-- Two accounts with paid history, for the patron profile tests below.
--   user 1 owns Kettle St. Coffee (a placement won in the open) and the anonymous bidder's row.
--   user 2 owns a different patron, so "somebody else's placement" is a real row and not a guess.
update patrons set profile_id='11111111-1111-1111-1111-111111111111'
 where id in ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000008');
update patrons set profile_id='22222222-2222-2222-2222-222222222222'
 where id = 'c1000000-0000-0000-0000-000000000004';

-- Purchases written as history. Migration 0035 guards purchases against inserts that do not pay
-- for a current offer, which these fixtures are not trying to be, so they load as the seed does.
select set_config('doormoney.trusted_load', 'on', true);
insert into purchases (lot_id, patron_id, amount_cents, fee_cents, payment_status) values
  -- Won through the anonymous bid the seed puts on this lot.
  ('a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000008', 36000, 5400, 'held'),
  -- Started and never paid for.
  ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 45000, 6750, 'requires_payment');
select set_config('doormoney.trusted_load', 'off', true);

insert into patron_profiles (profile_id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Kettle St. Coffee'),
  ('22222222-2222-2222-2222-222222222222', 'Ridgewood Wine Co.');

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

-- The catalog of sponsorship options is public to read and closed to write. Migration 0040 adds a
-- column to it, and a column added later inherits nothing, so this is the assertion that says the
-- table did not quietly reopen along with it.
select lives_ok(
  'select key, name, category_key from surfaces',
  'anon can read the sponsorship options, which is what draws them');

select throws_ok(
  $$insert into surfaces (key,name,group_key,default_period) values ('anon_test','X','stage','production')$$,
  '42501', null, 'anon cannot add a sponsorship option');

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

select ok((select count(*) from lots l join runs r on r.id = l.run_id where r.status in ('open','live','closed')) > 0,
  'and the options of a published fundraiser are all still there, which is what draws its page');
select is((select count(*)::int from lots where id='a0480000-0000-4000-8000-0000000000a1'), 0,
  'anon cannot read an option priced on a draft (0048)');
select is((select count(*)::int from lots where price_cents=77700), 0,
  'nor find it by its price');

select lives_ok(
  'select amount_cents, anonymous from bids',
  'anon can still read bid amounts for the board');

-- Stronger than it was. This used to assert that anon read zero rows, which was true because of
-- RLS while the table grant stayed wide open. Migration 0028 revoked the grant, so the read is now
-- refused outright and a future policy cannot quietly hand out an email address or a customer id.
select throws_ok(
  'select count(*) from patrons', '42501',
  null, 'anon cannot read the patrons table at all');

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
select is((select count(*)::int from lots where id='a0480000-0000-4000-8000-0000000000a1'), 1,
  'the organizer still reads the options on their own draft (0048 leaves "owner all lots" alone)');

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
select is((select count(*)::int from lots where id='a0480000-0000-4000-8000-0000000000a1'), 0,
  'another signed-in account cannot read somebody else''s draft options either (0048)');

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

-- ---------------------------------------------------------------
-- The rule the old check was missing, asked directly.
--
-- Asked as the service role: naming a purchase means reading patron_id, which no signed-in
-- account can do any more. owns_patron_activity is security definer, so the answer is the same
-- whoever asks; what is under test is the rule, not the caller.
-- ---------------------------------------------------------------
select is(
  public.owns_patron_activity(
    '11111111-1111-1111-1111-111111111111',
    (select id from purchases where patron_id='c1000000-0000-0000-0000-000000000001' and payment_status='held'),
    null),
  true, 'a placement this account paid for may be published');

select is(
  public.owns_patron_activity(
    '11111111-1111-1111-1111-111111111111',
    (select id from purchases where patron_id='c1000000-0000-0000-0000-000000000004'),
    null),
  false, 'somebody else''s placement may not, which is the hole 0029 closes');

select is(
  public.owns_patron_activity(
    '11111111-1111-1111-1111-111111111111',
    (select id from purchases where patron_id='c1000000-0000-0000-0000-000000000008'),
    null),
  false, 'a placement won through an anonymous bid may not, whatever the patron ticks');

select is(
  public.owns_patron_activity(
    '11111111-1111-1111-1111-111111111111',
    (select id from purchases where payment_status='requires_payment'),
    null),
  false, 'and neither may a checkout nobody finished');

select is(
  public.owns_patron_activity('11111111-1111-1111-1111-111111111111', null, null),
  false, 'a row pointing at nothing is not activity');

reset role;

-- ===============================================================
-- Everything built after 0022, brought inside the same boundary (0029)
-- ===============================================================
select tests.as_anon();

select throws_ok('select * from purchases limit 1',            '42501', null, 'anon cannot read purchases');
select throws_ok('select * from backings limit 1',             '42501', null, 'anon cannot read backings');
select throws_ok('select * from payout_schedule limit 1',      '42501', null, 'anon cannot read the payout schedule');
select throws_ok('select * from stripe_events limit 1',        '42501', null, 'anon cannot read the Stripe event log');
select throws_ok('select * from waitlist limit 1',             '42501', null, 'anon cannot read the waitlist');
select throws_ok('select * from contact_messages limit 1',     '42501', null, 'anon cannot read contact messages');
select throws_ok('select * from newsletter limit 1',           '42501', null, 'anon cannot read the mailing list');
select throws_ok('select * from patron_profiles limit 1',      '42501', null, 'anon cannot read patron profiles, published or not');
select throws_ok('select * from patron_profile_items limit 1', '42501', null, 'anon cannot read what a patron has published');
select throws_ok('select * from username_history limit 1',     '42501', null, 'anon cannot read the retired username map');

reset role;

-- ===============================================================
-- A signed-in account, on the tables it half-owns
-- ===============================================================
select tests.as_user('11111111-1111-1111-1111-111111111111');

-- The one session-side read of purchases: deciding a mark needs its state, never its money.
select lives_ok(
  $$select id, lot_id, mark_status, payment_status from purchases limit 1$$,
  'a musician can still read the state of a mark on their own lot');

select throws_ok(
  'select amount_cents from purchases limit 1', '42501',
  null, 'but not what the patron paid');

select throws_ok(
  'select stripe_payment_intent_id from purchases limit 1', '42501',
  null, 'and not the Stripe payment intent behind it');

select throws_ok('select * from backings limit 1', '42501', null, 'a signed-in account cannot read backings');
select throws_ok('select * from username_history limit 1', '42501', null, 'a signed-in account cannot read the retired username map');
select throws_ok('select * from patron_profile_items limit 1', '42501', null, 'a signed-in account cannot read the published-activity table');

-- The profile itself: readable, and only ever one row of it.
-- The exact column list ownProfile() in src/lib/patronprofile.ts selects. If the grant and the
-- query ever drift apart, the management page stops filling its form in, and this says so first.
select lives_ok(
  $$select display_name, bio, location, website, interests, photo_path, published, patron_since
      from patron_profiles where profile_id = auth.uid()$$,
  'a patron reads every column the management page asks for');

select is(
  (select display_name from patron_profiles), 'Kettle St. Coffee',
  'a patron reads their own profile row');

select is(
  (select count(*)::int from patron_profiles), 1,
  'and only their own: the other account''s profile is not there');

-- Writing it is the server's job. published decides whether a page exists at all, and
-- patron_since is worked out from the first thing this account actually paid for.
select throws_ok(
  $$update patron_profiles set published=true where profile_id=auth.uid()$$, '42501',
  null, 'a patron cannot publish their own profile through the Data API');

select throws_ok(
  $$update patron_profiles set patron_since='2009-01-01' where profile_id=auth.uid()$$, '42501',
  null, 'a patron cannot backdate how long they have been one');

select throws_ok(
  $$insert into patron_profile_items (profile_id, purchase_id)
    values (auth.uid(), (select id from purchases where patron_id='c1000000-0000-0000-0000-000000000004'))$$,
  '42501', null, 'a patron cannot publish anything through the Data API');

reset role;

-- ===============================================================
-- Views are read-only, and nothing bypasses a policy (0030)
-- ===============================================================
select tests.as_anon();

-- The two that were auto-updatable. A write through either reached the base table with row level
-- security switched off, because a definer view runs as its owner and the owner is not policed.
select throws_ok(
  $$update patron_names set name='OWNED'$$, '42501',
  null, 'anon cannot rewrite every patron''s name through patron_names');

select throws_ok(
  $$delete from run_backers$$, '42501',
  null, 'anon cannot delete every fan backing through run_backers');

select throws_ok(
  $$insert into run_backers (run_id, display_name, tier, amount_cents) values (null, 'x', 'thank_you', 1)$$,
  '42501', null, 'anon cannot invent a backing through run_backers');

-- The other four refuse one step earlier, with 55000 rather than 42501: they join or union, so
-- Postgres will not update through them at all and never reaches the privilege check. That is a
-- shape rather than a decision, which is why the grant is gone too. The count below is the part
-- that holds if one of them is ever simplified into an updatable view.
select throws_ok(
  $$update lot_buyers set name='OWNED'$$, '55000',
  null, 'anon cannot write through lot_buyers');

select throws_ok(
  $$update public_bids set patron_name='OWNED'$$, '55000',
  null, 'anon cannot write through public_bids');

select throws_ok(
  $$update public_patron_profiles set bio='OWNED'$$, '55000',
  null, 'anon cannot write through public_patron_profiles');

-- TRUNCATE consults no policy at all, so a grant on it is not defended by one.
select throws_ok(
  $$truncate table bids$$, '42501',
  null, 'anon cannot truncate a table past every policy on it');

select is(
  (select count(*)::int from information_schema.table_privileges
    where table_schema='public' and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
      and table_name in ('lot_buyers','run_backers','public_bids','patron_names','public_patron_profiles','public_patron_activity')),
  0, 'no view carries a write privilege for a browser, whatever its shape');

select is(
  (select count(*)::int from information_schema.table_privileges
    where table_schema='public' and grantee in ('anon','authenticated') and privilege_type='TRUNCATE'),
  0, 'nothing in the schema can be truncated by a browser');

reset role;

-- ===============================================================
-- A sponsorship's money waits for the logo (0031)
--
-- The Friday job asks the same question in src/lib/release.ts. This is the answer underneath it:
-- the rule has to hold for any caller that writes to payout_schedule with the service role, not
-- only for the one query that remembers to filter. /terms promises a declined logo a full refund,
-- and refundDue can only give back what has not already been sent.
-- ===============================================================
set local role service_role;

-- The seed's held purchase carries no logo yet, which is where every sponsorship starts.
insert into payout_schedule (id, act_id, purchase_id, due_on, amount_cents, status)
values (
  'de000000-0000-0000-0000-000000000001',
  (select r.act_id from lots l join runs r on r.id = l.run_id where l.id = 'a1000000-0000-0000-0000-000000000004'),
  (select id from purchases where lot_id = 'a1000000-0000-0000-0000-000000000004'),
  current_date, 5000, 'scheduled');

select throws_ok(
  $$update payout_schedule set status='paid' where id='de000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a sponsorship slice cannot be paid while the logo is still waiting');

select throws_ok(
  $$insert into payout_schedule (act_id, purchase_id, due_on, amount_cents, status)
    values ((select r.act_id from lots l join runs r on r.id = l.run_id where l.id = 'a1000000-0000-0000-0000-000000000004'),
            (select id from purchases where lot_id = 'a1000000-0000-0000-0000-000000000004'),
            current_date, 5000, 'paid')$$,
  '23514', null, 'nor can one be inserted already paid, around the update');

-- Waiting is not skipping: the refused slice keeps its status and its due date, so the first Friday
-- after the yes pays every Friday that went by without one.
select is(
  (select status::text || ' ' || (due_on = current_date)::text from payout_schedule where id='de000000-0000-0000-0000-000000000001'),
  'scheduled true', 'the slice that was refused is still scheduled, and still due on the day it was');

update purchases set mark_status='submitted' where lot_id='a1000000-0000-0000-0000-000000000002';
update purchases set mark_status='declined' where lot_id='a1000000-0000-0000-0000-000000000002';
insert into payout_schedule (id, act_id, purchase_id, due_on, amount_cents, status)
values (
  'de000000-0000-0000-0000-000000000002',
  (select r.act_id from lots l join runs r on r.id = l.run_id where l.id = 'a1000000-0000-0000-0000-000000000002'),
  (select id from purchases where lot_id = 'a1000000-0000-0000-0000-000000000002'),
  current_date, 5000, 'scheduled');

select throws_ok(
  $$update payout_schedule set status='paid' where id='de000000-0000-0000-0000-000000000002'$$,
  '23514', null, 'a declined logo never pays out at all');

-- A backing has no logo for anyone to approve, so the calendar alone releases it (decision 3).
insert into backings (id, run_id, patron_id, tier, amount_cents, fee_cents, display_name, payment_status)
values ('de000000-0000-0000-0000-000000000003',
        (select r.id from lots l join runs r on r.id = l.run_id where l.id = 'a1000000-0000-0000-0000-000000000004'),
        'c1000000-0000-0000-0000-000000000001', 'thank_you', 2500, 375, 'A fan', 'held');
insert into payout_schedule (id, act_id, backing_id, due_on, amount_cents, status)
values ('de000000-0000-0000-0000-000000000004',
        (select r.act_id from lots l join runs r on r.id = l.run_id where l.id = 'a1000000-0000-0000-0000-000000000004'),
        'de000000-0000-0000-0000-000000000003', current_date, 2125, 'scheduled');

select lives_ok(
  $$update payout_schedule set status='paid' where id='de000000-0000-0000-0000-000000000004'$$,
  'a fan backing pays on the calendar, with no logo anywhere in it');

-- The yes is what releases it, and the same slice then moves.
update purchases set mark_status='submitted' where lot_id='a1000000-0000-0000-0000-000000000004';
update purchases set mark_status='approved' where lot_id='a1000000-0000-0000-0000-000000000004';

select lives_ok(
  $$update payout_schedule set status='paid' where id='de000000-0000-0000-0000-000000000001'$$,
  'and the moment the musician approves the logo, the waiting slice pays');

-- The guard fires on the way into paid and nowhere else, so a refund can still skip a paid row.
select lives_ok(
  $$update payout_schedule set status='skipped', paused_reason='refunded' where id='de000000-0000-0000-0000-000000000001'$$,
  'a refund can still move a slice out of paid');

reset role;

-- ===============================================================
-- Refunds Door Money owes are written down, and nobody else can see them (0032)
--
-- The table holds patron money, Stripe idempotency keys and error text. It is also the only record
-- that a refund is owed at all once the request that owed it is gone, so a row that could be
-- rewritten from a browser would be a refund that could be made to disappear.
-- ===============================================================
select tests.as_anon();

select throws_ok('select * from financial_operations limit 1', '42501', null, 'anon cannot read the refunds Door Money owes');
select throws_ok(
  $$insert into financial_operations (kind, purchase_id, reason, idempotency_key)
    values ('refund', (select id from purchases limit 1), 'run_cancelled', 'forged')$$,
  '42501', null, 'anon cannot invent an obligation');
select throws_ok($$delete from financial_operations$$, '42501', null, 'anon cannot delete a refund that is owed');
select throws_ok($$truncate table financial_operations$$, '42501', null, 'nor truncate them all');

-- The ledger (0055), asserted here as well as in supabase/tests/ledger_test.sql, because this file
-- is where the boundary is kept whole and a table missing from it is how migration 0029 found the
-- last hole. Entries carry an amount for every payment on the platform.
select throws_ok('select * from ledger_entries limit 1',   '42501', null, 'anon cannot read the ledger');
select throws_ok('select * from ledger_accounts limit 1',  '42501', null, 'nor the chart of accounts');
select throws_ok('select * from ledger_imbalances limit 1','42501', null, 'nor what is out of balance');
select throws_ok('select * from ledger_balances limit 1',  '42501', null, 'nor the books by account (0065)');
select throws_ok('select * from ledger_payment_balances limit 1', '42501', null, 'nor the books by payment');

reset role;
select tests.as_user('11111111-1111-1111-1111-111111111111');

select throws_ok('select * from financial_operations limit 1', '42501', null, 'a signed-in musician cannot read them either');
select throws_ok('select * from ledger_entries limit 1', '42501', null, 'nor can a signed-in account read the ledger');
select throws_ok(
  $$update financial_operations set status='succeeded'$$,
  '42501', null, 'and cannot mark a refund they owe as already sent');

reset role;
set local role service_role;

-- The shape the queue relies on.
insert into financial_operations (id, kind, purchase_id, reason, idempotency_key)
values ('fa000000-0000-0000-0000-000000000001', 'refund',
        (select id from purchases where lot_id='a1000000-0000-0000-0000-000000000004'),
        'run_cancelled', 'refund_one_run_cancelled');

select throws_ok(
  $$insert into financial_operations (kind, purchase_id, reason, idempotency_key)
    values ('refund', (select id from purchases where lot_id='a1000000-0000-0000-0000-000000000004'),
            'run_cancelled', 'refund_one_run_cancelled')$$,
  '23505', null, 'the same obligation cannot be written down twice');

select throws_ok(
  $$insert into financial_operations (kind, purchase_id, backing_id, reason, idempotency_key)
    values ('refund', (select id from purchases limit 1), (select id from backings limit 1), 'run_cancelled', 'refund_both')$$,
  '23514', null, 'an obligation is against one payment, never two');

-- A settled row is one a worker will not pick up again, and an unsettled one has to stay pickable.
select throws_ok(
  $$update financial_operations set status='succeeded' where id='fa000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a refund cannot be called succeeded without being settled');

-- The bogus updated_at is the point: the trigger has to overwrite whatever a caller passes, and
-- inside one transaction now() is the transaction's start, so it lands back on created_at.
select lives_ok(
  $$update financial_operations set status='succeeded', settled_at=now(), amount_cents=36000, updated_at='2000-01-01'
     where id='fa000000-0000-0000-0000-000000000001'$$,
  'a refund that went through settles with the amount that went back');

select is(
  (select updated_at from financial_operations where id='fa000000-0000-0000-0000-000000000001'),
  (select created_at from financial_operations where id='fa000000-0000-0000-0000-000000000001'),
  'and a caller cannot tell the row when it last moved: the trigger does');

reset role;

-- ===============================================================
-- Money moves one way (0033)
--
-- The transitions the system performs, and every way back. None of the refusals below is reachable
-- through the application today; each is one forgotten WHERE clause, one migration or one
-- hand-written UPDATE from being reachable, and each would be a row saying a patron's money is
-- somewhere it is not.
-- ===============================================================
set local role service_role;
-- History again (see the fixtures at the top): rows born held, which 0035 refuses from anyone else.
select set_config('doormoney.trusted_load', 'on', true);

insert into purchases (id, lot_id, patron_id, amount_cents, fee_cents, payment_status)
values ('55000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006',
        'c1000000-0000-0000-0000-000000000001', 10000, 1500, 'held');

select lives_ok(
  $$update purchases set payment_status='released' where id='55000000-0000-0000-0000-000000000001'$$,
  'a held payment is released once every slice has gone to the musician');

select throws_ok(
  $$update purchases set payment_status='held' where id='55000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'but a released payment cannot be un-released');

select throws_ok(
  $$update purchases set payment_status='requires_payment' where id='55000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'and cannot go back to never having been paid');

select lives_ok(
  $$update purchases set payment_status='refunded', refunded_cents=10000 where id='55000000-0000-0000-0000-000000000001'$$,
  'a refund by hand after the fact is allowed, out of Door Money''s own pocket');

select throws_ok(
  $$update purchases set payment_status='held' where id='55000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a refunded payment is the end of the road');

-- charge.amount_refunded is a running total, so an older event arriving late must not walk it back.
select throws_ok(
  $$update purchases set refunded_cents=500 where id='55000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a refund cannot shrink');

select throws_ok(
  $$update purchases set refunded_cents=10001 where id='55000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'nor can more go back than was ever charged');

-- A fan backing is held to the same rule, on the same function.
insert into backings (id, run_id, patron_id, tier, amount_cents, fee_cents, display_name, payment_status)
values ('55000000-0000-0000-0000-000000000002',
        (select r.id from lots l join runs r on r.id=l.run_id where l.id='a1000000-0000-0000-0000-000000000006'),
        'c1000000-0000-0000-0000-000000000001', 'thank_you', 2500, 375, 'A fan', 'requires_payment');

select throws_ok(
  $$update backings set payment_status='released' where id='55000000-0000-0000-0000-000000000002'$$,
  '23514', null, 'a backing cannot be released without ever being paid for');

-- The logo, which migration 0031 needs to be answered once and for good.
insert into purchases (id, lot_id, patron_id, amount_cents, fee_cents, payment_status)
values ('55000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000007',
        'c1000000-0000-0000-0000-000000000001', 10000, 1500, 'held');
select set_config('doormoney.trusted_load', 'off', true);

select throws_ok(
  $$update purchases set mark_status='approved' where id='55000000-0000-0000-0000-000000000003'$$,
  '23514', null, 'a logo nobody sent cannot be approved');

select lives_ok(
  $$update purchases set mark_status='submitted' where id='55000000-0000-0000-0000-000000000003';
    update purchases set mark_status='approved'  where id='55000000-0000-0000-0000-000000000003';
    update purchases set mark_status='approved'  where id='55000000-0000-0000-0000-000000000003'$$,
  'a logo is sent, answered, and answering it again changes nothing');

select throws_ok(
  $$update purchases set mark_status='declined' where id='55000000-0000-0000-0000-000000000003'$$,
  '23514', null, 'and an approved logo cannot be taken back, which is what 0031 rests on');

reset role;

-- What the two public patron views will actually show (0024)
-- ===============================================================
-- These replace a test in tests/profile.test.ts that read migration 0024 as text and checked the
-- view definitions did not mention amount_cents, email, stripe_ and so on. A grep over a migration
-- is not what serves a request: a later migration can replace a view and the grep goes on passing.
-- What follows asks the database what the views are and what they return.
--
-- Superuser again, because this has to set up the published state that the patron is rightly
-- refused above. It runs last, and the whole file rolls back.
reset role;

-- The shape, exactly. A column added to either view has to be added here on purpose.
select set_eq(
  $$select column_name::text from information_schema.columns
     where table_schema = 'public' and table_name = 'public_patron_profiles'$$,
  $$values ('username'::text),('display_name'),('bio'),('location'),('website'),('interests'),
           ('photo_path'),('patron_since'),('published_at'),
           -- Migration 0043: what the patron is, where else to find them, the categories they support.
           ('profile_kind'),('links'),('category_keys'),('category_labels'),
           -- Migration 0050: a tag in the patron's own words, the header's path in the private bucket, the page's light.
           ('custom_tag'),('header_path'),('theme')$$,
  'public_patron_profiles shows these columns and no others');

select set_eq(
  $$select column_name::text from information_schema.columns
     where table_schema = 'public' and table_name = 'public_patron_activity'$$,
  $$values ('username'::text),('kind'),('act_name'),('act_slug'),('run_title'),('run_status'),
           ('detail'),('supported_at'),
           -- Migration 0043: the fundraiser's own category, already public on a published fundraiser.
           ('category_key')$$,
  'public_patron_activity shows these columns and no others');

-- And the rule behind the shape, so a rename cannot walk one back in.
select is_empty(
  $$select table_name || '.' || column_name from information_schema.columns
     where table_schema = 'public'
       and table_name in ('public_patron_profiles', 'public_patron_activity')
       and column_name ~ '(amount|fee|refunded|email|stripe|payment|intent|funding|token|mark_|profile_id)'$$,
  'no public patron view carries money, an address, a Stripe id or an internal key');

-- Off by default, in the database rather than in a form.
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'patron_profiles' and column_name = 'published'),
  'false', 'a patron profile is unpublished until somebody publishes it');

select is(
  (select public from storage.buckets where id = 'patron-photos'), false,
  'the patron photo bucket is private, so a photo needs a signed link');

-- And no policy on storage.objects opens that bucket back up: the only way to a patron photo is the
-- signed link the server mints, and a permissive select policy naming the bucket would be a second
-- way in. tests/profile.test.ts used to grep migration 0024 for this; the catalog is the thing to ask.
select is_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') || coalesce(with_check, '')) like '%patron-photos%'$$,
  'no storage policy names the patron photo bucket');

-- The handle goes on first, and deliberately before the two assertions below.
--
-- Both views also require a non-null profiles.username, and the accounts in the fixtures above
-- have none: handle_new_user copies it out of the auth user's metadata and these were inserted
-- without any. Asserting the views are empty while that is still true proves nothing about the
-- published flag, which is the thing meant to be under test. With the handle set, published is
-- the only reason left for a row to be missing.
update profiles set username = 'kettle-st' where id = '11111111-1111-1111-1111-111111111111';

select is_empty('select * from public_patron_profiles',
  'an unpublished profile is on no public page, handle or no handle');
select is_empty('select * from public_patron_activity',
  'and neither is anything it has paid for');

update patron_profiles set published = true, published_at = now()
 where profile_id = '11111111-1111-1111-1111-111111111111';

select is((select count(*)::int from public_patron_profiles), 1,
  'publishing puts that profile, and only that profile, on the view');
select is((select username from public_patron_profiles), 'kettle-st', 'under its own handle');

-- Publishing the profile publishes nothing it has bought. Each item is ticked separately.
select is_empty('select * from public_patron_activity',
  'a published profile still shows nothing it has not ticked');

-- Ticking the placement won through an anonymous bid. It stays off the page regardless: an
-- anonymous bid is never publishable, whatever the form that ticked it said.
insert into patron_profile_items (profile_id, purchase_id)
  select '11111111-1111-1111-1111-111111111111', id from purchases
   where patron_id = 'c1000000-0000-0000-0000-000000000008';

select is_empty('select * from public_patron_activity',
  'a placement won with an anonymous bid stays off the page even once it is ticked');

-- The other half of that, without which the three is_empty assertions above would all pass just
-- as well if the view returned nothing to anybody at all. This one was bought in the open.
--
-- It is the second purchase in the fixtures at the top, still requires_payment when it is ticked.
-- Ticked and unpaid, it stays off the page: the view shows only what was actually paid for (held,
-- released or partially refunded), and this is the one assertion that holds that filter, so a
-- later rewrite of the view cannot drop it quietly. The backing arm of the union has no fixture
-- here and is not asserted.
insert into patron_profile_items (profile_id, purchase_id)
  select '11111111-1111-1111-1111-111111111111', id from purchases
   where lot_id = 'a1000000-0000-0000-0000-000000000002'
     and patron_id = 'c1000000-0000-0000-0000-000000000001';

select is_empty('select * from public_patron_activity',
  'a ticked placement that was never paid for stays off the page');

-- Then paid for. Moved from requires_payment to held rather than inserted fresh:
-- purchases_live_lot_idx allows one live purchase per lot, so a second row on the same lot is a
-- duplicate key and the rest of the file never runs.
update purchases set payment_status = 'held'
 where lot_id = 'a1000000-0000-0000-0000-000000000002'
   and patron_id = 'c1000000-0000-0000-0000-000000000001';

select is((select count(*)::int from public_patron_activity), 1,
  'a placement bought in the open, and ticked, is the one thing on the page');
select is((select kind from public_patron_activity), 'placement', 'and it reads as a placement');

-- Migration 0043. The row names its fundraiser's own category, which every fundraiser built
-- before the expansion has: music. And a profile made before 0043 is still a valid one: it says
-- nothing about what kind of patron it is, links nowhere and supports no category it never chose.
select is((select category_key from public_patron_activity), 'music',
  'the activity carries the fundraiser''s category, and an existing fundraiser is music');
select results_eq(
  $$select profile_kind, links, category_keys, category_labels from public_patron_profiles$$,
  $$values (null::text, '[]'::jsonb, '{}'::text[], '{}'::text[])$$,
  'a profile from before 0043 is still valid, and was given no kind and no category it did not choose');
select is_empty('select * from patron_profile_categories',
  'no existing interest was turned into a category');

select * from finish();
rollback;
