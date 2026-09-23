-- One organizer, two fundraisers open at once: a payment on one changes nothing on the other.
--
-- No migration belongs to this suite. It runs the functions that move payment state today
-- (begin_lot_purchase and fulfil_lot_purchase, migration 0035) and reads the public views the
-- widget and the fundraiser page draw from, with a second fundraiser under the same organizer, so
-- that "which fundraiser" is never answered by "which organizer". The application side of the same
-- rule is tests/checkout-route.test.ts, tests/exact-fulfillment.test.ts and tests/payment-returns.test.ts.
-- Every suite rolls back its fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Gutter Hymns already has "Fall run" open (A, from the seed). "Winter residency" (B) opens beside
-- it, with a later start date, which makes it what "the organizer's current fundraiser" means.
insert into runs (id, act_id, slug, kind, title, starts_on, ends_on, show_count, status, verification_methods) values
 ('e5000000-0000-4000-8000-00000000000b','11111111-1111-1111-1111-111111111111','winter-residency','residency','Winter residency','2026-12-01','2026-12-29',8,'open',array['end_of_run_record']);
-- These spots carry no offer terms, as every spot did before migration 0060, and their fundraiser is
-- already public, so they are marked grandfathered the way 0060 marks the real ones (0061 refuses the
-- shape otherwise). The test is about what it was about, not about offer terms.
insert into lots (id, run_id, surface_key, price_cents, mode, status, terms_grandfathered) values
 ('e5000000-0000-4000-8000-0000000000b1','e5000000-0000-4000-8000-00000000000b','kick_head',90000,'fixed','open', true),
 ('e5000000-0000-4000-8000-0000000000a1','22222222-2222-2222-2222-222222222222','amp_grille',30000,'fixed','open', true);

select is((select count(*)::int from runs where act_id='11111111-1111-1111-1111-111111111111' and status in ('open','live')),2,
  'one organizer has two fundraisers open');
select is((select id::text from runs where act_id='11111111-1111-1111-1111-111111111111' and status in ('open','live') order by starts_on desc limit 1),
  'e5000000-0000-4000-8000-00000000000b','and "the current one" is B, which is not the one a fan of the fall run is reading');
select is((select count(distinct slug) from acts where id='11111111-1111-1111-1111-111111111111'),1::bigint,
  'both share one organizer address, so the address cannot tell them apart');

-- ---------------------------------------------------------------
-- A sponsorship on A.
-- ---------------------------------------------------------------
select lives_ok($$select begin_lot_purchase('e5000000-0000-4000-8000-0000000000a1','c1000000-0000-0000-0000-000000000001',30000,4500)$$,
  'a sponsor starts paying for a spot on A');
select is((select status::text from lots where id='e5000000-0000-4000-8000-0000000000a1'),'pending_funding','A''s spot is held for them');
select is((select status::text from lots where id='e5000000-0000-4000-8000-0000000000b1'),'open','B''s spot is not');

select is((select fulfil_lot_purchase(id,'pi_exact_a','ch_exact_a','cs_exact_a') from purchases where lot_id='e5000000-0000-4000-8000-0000000000a1'),
  'sold','the payment for A settles');
select is((select status::text from lots where id='e5000000-0000-4000-8000-0000000000a1'),'sold','A''s spot is sold');
select is((select status::text from lots where id='e5000000-0000-4000-8000-0000000000b1'),'open','B''s spot is still open');
select is((select count(*)::int from purchases p join lots l on l.id=p.lot_id where l.run_id='e5000000-0000-4000-8000-00000000000b'),0,
  'and no purchase exists on B');
select is((select r.id::text from purchases p join lots l on l.id=p.lot_id join runs r on r.id=l.run_id where p.stripe_checkout_session_id='cs_exact_a'),
  '22222222-2222-2222-2222-222222222222','the purchase resolves to A through its own lot, which is how a record finds its fundraiser');

-- A duplicate or retried webhook.
select is((select fulfil_lot_purchase(id,'pi_exact_a','ch_exact_a','cs_exact_a') from purchases where lot_id='e5000000-0000-4000-8000-0000000000a1'),
  'already','the same payment delivered twice changes nothing');
select is((select count(*)::int from purchases where lot_id='e5000000-0000-4000-8000-0000000000a1'),1,'and there is still one purchase');
select results_eq(
  $$select amount_cents, fee_cents from purchases where lot_id='e5000000-0000-4000-8000-0000000000a1'$$,
  $$values (30000, 4500)$$,'at the amount and the fifteen percent it was started with');

-- ---------------------------------------------------------------
-- A backing on A.
-- ---------------------------------------------------------------
insert into backings (id, run_id, patron_id, tier, amount_cents, fee_cents, display_name, payment_status) values
 ('e5000000-0000-4000-8000-0000000000f1','22222222-2222-2222-2222-222222222222','c1000000-0000-0000-0000-000000000001','thank_you',2500,375,'Exact Dana','held');

set local role anon;
select set_config('request.jwt.claims','',true);
-- What the widget and the fundraiser page read: keyed by fundraiser, never by organizer.
select is((select count(*)::int from run_backers where run_id='22222222-2222-2222-2222-222222222222' and display_name='Exact Dana'),1,
  'A''s widget counts the fan who backed A');
select is((select count(*)::int from run_backers where run_id='e5000000-0000-4000-8000-00000000000b'),0,
  'B''s widget does not, though both are Gutter Hymns');
select is((select count(*)::int from lot_buyers where lot_id='e5000000-0000-4000-8000-0000000000a1'),1,'A''s page names its sponsor');
select is((select count(*)::int from lot_buyers lb join lots l on l.id=lb.lot_id where l.run_id='e5000000-0000-4000-8000-00000000000b'),0,
  'B''s page names none');
select lives_ok($$select id, run_id from lots where id='e5000000-0000-4000-8000-0000000000a1'$$,
  'a lot''s fundraiser is a public column, which is what lets a return notice be checked without the service role');
-- An exact widget can be asked for a closed or an open fundraiser by id, and never for a draft.
select is((select count(*)::int from runs where id='e5000000-0000-4000-8000-00000000000b' and act_id='11111111-1111-1111-1111-111111111111'),1,
  'a fundraiser is found by its id under its own organizer');
select is((select count(*)::int from runs where id='e5000000-0000-4000-8000-00000000000b' and act_id='33333333-3333-3333-3333-333333333333'),0,
  'and not under somebody else''s address');
reset role;

select * from finish();
rollback;
