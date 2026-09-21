-- Hospitality is a draft-only category (migration 0047). Every suite rolls back its fixtures.
--
-- Four things are asked of the database directly, because each has to hold when the application is
-- not the caller. An organizer can save a private hospitality draft and price its own options on
-- it. That draft cannot leave draft status, for any role. Nobody without a session can see it, its
-- organizer or its options. And nothing on it can be bought, in any Stripe mode, because the
-- category has no delivery policy. The last block shows what opening it would take, so the two
-- switches stay two switches.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e7000000-0000-4000-8000-000000000001','hospitality-venue@example.com','{"roles":["organizer"]}'),
 ('e7000000-0000-4000-8000-000000000002','hospitality-sponsor@example.com','{"roles":["patron"]}');
insert into acts (id,owner_id,name,slug,type) values
 ('e7000000-0000-4000-8000-00000000000a','e7000000-0000-4000-8000-000000000001','The Copper Room','copper-room-hospitality',null);
insert into patrons (id,name,contact_email,profile_id) values
 ('e7000000-0000-4000-8000-0000000000c1','Harbor Gin','hospitality-sponsor@example.com','e7000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------
-- The category, as the migration leaves it
-- ---------------------------------------------------------------
select results_eq($$select label, draft_enabled, publish_enabled from fundraiser_categories where key='hospitality'$$,
  $$values ('Hospitality', true, false)$$,
  'hospitality takes drafts and cannot publish');
select is((select detail_keys from fundraiser_categories where key='hospitality'), array['venue_kind','format'],
  'two optional details, neither of them restaurant-only');
select is((select count(*)::int from delivery_policies where category_key='hospitality'),0,
  'it has no delivery policy, proposed or active');
select ok((public.current_delivery_policy('hospitality')).category_key is null,
  'so the policy a purchase would be sold under does not exist');
select is((select count(*)::int from fundraiser_categories where publish_enabled),4,
  'the four launch categories are still the only ones that publish');

select results_eq($$select key from surfaces where category_key='hospitality' order by sort$$,
  $$values ('sponsored_martini_cart'),('sponsored_table_plaque'),('sponsored_restaurant_space'),('chef_residency'),('dinner_series'),('community_meal_program')$$,
  'the six hospitality templates');
select is((select count(*)::int from surfaces where category_key='hospitality' and (default_price_cents is not null or applies_to is not null)),0,
  'none suggests a price, and none carries a music act type');
select is((select count(*)::int from surfaces where category_key='hospitality' and not active),0,'all six can start a new opportunity');

-- ---------------------------------------------------------------
-- A private draft, written as the organizer
-- ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Inserted the way the application does: a browser session may not choose a row's id (0022).
select lives_ok($$insert into runs (act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise,category_details) values
  ('e7000000-0000-4000-8000-00000000000a','Martini cart','copper-cart','draft','hospitality',
   'The cart, its glassware and staff training.','Guests in the dining room.','A name on the cart.','{"venue_kind":"Restaurant","format":"Sponsored experience"}')$$,
  'an organizer saves a hospitality draft, with both details');
select lives_ok($$insert into runs (act_id,title,slug,status,category_key) values
  ('e7000000-0000-4000-8000-00000000000a','','copper-empty','draft','hospitality')$$,
  'and one with nothing answered at all: no detail is required of anybody');
select throws_ok($$update runs set category_details='{"sport":"Soccer"}' where slug='copper-cart'$$,
  '23514',null,'another category''s detail is refused');
select throws_ok($$update runs set kind='residency', show_count=4 where slug='copper-cart'$$,
  '23514',null,'and so are music''s fields, even for a chef residency');

-- The columns the options editor sends. A lot's status is not the organizer's to set (0022).
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode)
  select id,'sponsored_martini_cart',250000,'fixed' from runs where slug='copper-cart'$$,
  'the organizer prices a hospitality option on the draft, at their own price');
select throws_ok($$insert into lots (run_id,surface_key,price_cents,mode)
  select id,'kick_head',120000,'fixed' from runs where slug='copper-cart'$$,
  '23514','opportunity_category_mismatch','a music option cannot sit on a hospitality draft');

-- ---------------------------------------------------------------
-- It cannot be published, by the organizer or by anybody
-- ---------------------------------------------------------------
select throws_ok($$update runs set status='open' where slug='copper-cart'$$,
  '23514','this category is not enabled for publishing','the organizer cannot publish it, however complete it is');
select throws_ok($$update runs set status='live' where slug='copper-cart'$$,
  '23514','this category is not enabled for publishing','nor skip straight to live');
select throws_ok($$insert into runs (act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise) values
  ('e7000000-0000-4000-8000-00000000000a','Dinner series','copper-dinners','open','hospitality','Ingredients.','Guests.','A name on the menu.')$$,
  '23514','this category is not enabled for publishing','nor create one already open');
reset role;

select throws_ok($$update runs set status='open' where slug='copper-cart'$$,
  '23514','this category is not enabled for publishing','the service role is refused too: the gate is a trigger, not a policy');
select is((select status::text from runs where slug='copper-cart'),'draft','it is still a draft');

-- A team cannot put a hospitality option on its season either.
insert into runs (id,act_id,title,slug,status,category_key) values
 ('e7000000-0000-4000-8000-000000000012','e7000000-0000-4000-8000-00000000000a','Spring season','copper-season','draft','sports');
select throws_ok($$insert into lots (run_id,surface_key,price_cents,mode,status) values
  ('e7000000-0000-4000-8000-000000000012','dinner_series',90000,'fixed','open')$$,
  '23514','opportunity_category_mismatch','a hospitality option cannot sit on another category''s fundraiser');

-- ---------------------------------------------------------------
-- Nobody without a session can find it
-- ---------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*)::int from runs where category_key='hospitality'),0,'a visitor sees no hospitality fundraiser');
select is((select count(*)::int from acts where slug='copper-room-hospitality'),0,'nor the venue, which has nothing published');
select is((select count(*)::int from lots where surface_key='sponsored_martini_cart'),0,'nor the options priced on the draft (0048)');
select is((select count(*)::int from lots l join surfaces s on s.key=l.surface_key where s.category_key='hospitality'),0,'no hospitality option is readable at all');
select is((select count(*)::int from lot_buyers),(select count(*)::int from lot_buyers lb join lots l on l.id=lb.lot_id join surfaces s on s.key=l.surface_key where s.category_key<>'hospitality'),'and the public buyer view has nothing to say about it');
select throws_ok($$select publish_enabled from fundraiser_categories where key='hospitality'$$,
  '42501',null,'a visitor may read a category''s name and nothing about its switches');
reset role;

-- Another organizer cannot see the draft either.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from runs where slug='copper-cart'),0,'another signed-in account does not see the draft');
reset role;

-- ---------------------------------------------------------------
-- Nothing on it can be bought
-- ---------------------------------------------------------------
select throws_ok($$select begin_lot_purchase((select l.id from lots l join runs r on r.id=l.run_id where r.slug='copper-cart'),'e7000000-0000-4000-8000-0000000000c1',250000,37500)$$,
  '23514','no_delivery_policy','a hospitality option cannot be bought: the category has no delivery policy');
select is((select count(*)::int from purchases where lot_id=(select l.id from lots l join runs r on r.id=l.run_id where r.slug='copper-cart')),0,'no purchase row was left behind');
select is((select count(*)::int from payout_schedule ps join purchases p on p.id=ps.purchase_id where p.lot_id=(select l.id from lots l join runs r on r.id=l.run_id where r.slug='copper-cart')),0,
  'and nothing was scheduled to be paid out');

-- ---------------------------------------------------------------
-- What opening it would take: two switches, and each one alone opens nothing
-- ---------------------------------------------------------------
update fundraiser_categories set publish_enabled=true where key='hospitality';
select throws_ok($$select begin_lot_purchase((select l.id from lots l join runs r on r.id=l.run_id where r.slug='copper-cart'),'e7000000-0000-4000-8000-0000000000c1',250000,37500)$$,
  '23514','no_delivery_policy','publishing switched on alone still sells nothing');
update fundraiser_categories set publish_enabled=false where key='hospitality';
insert into delivery_policies (category_key,version,release_rule) values ('hospitality',1,'evidence');
select throws_ok($$update runs set status='open' where slug='copper-cart'$$,
  '23514','this category is not enabled for publishing','and a policy alone still publishes nothing');

select * from finish();
rollback;
