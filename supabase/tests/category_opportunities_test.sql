-- Category-aware sponsorship opportunities (migration 0044): an opportunity belongs to its
-- fundraiser's category, the organizer's price is the price, and a fifth category is rows, not an
-- enum. Kept in its own file, like the other expansion suites. Every suite rolls back its fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e4400000-0000-4000-8000-000000000001','opportunity-owner@example.com','{"roles":["organizer"]}'),
 ('e4400000-0000-4000-8000-000000000002','opportunity-other@example.com','{"roles":["organizer"]}');
insert into acts (id,owner_id,name,slug,type) values
 ('e4400000-0000-4000-8000-00000000000a','e4400000-0000-4000-8000-000000000001','Second Stage','second-stage-opps',null),
 ('e4400000-0000-4000-8000-00000000000b','e4400000-0000-4000-8000-000000000002','Harbor FC','harbor-fc-opps',null);
insert into runs (id,act_id,title,slug,status,category_key) values
 ('e4400000-0000-4000-8000-000000000010','e4400000-0000-4000-8000-00000000000a','Winter production','winter-opps','draft','theater'),
 ('e4400000-0000-4000-8000-000000000011','e4400000-0000-4000-8000-00000000000a','The short','short-opps','draft','film'),
 ('e4400000-0000-4000-8000-000000000012','e4400000-0000-4000-8000-00000000000a','A recording','recording-opps','draft','music'),
 ('e4400000-0000-4000-8000-000000000013','e4400000-0000-4000-8000-00000000000b','Spring season','season-opps','draft','sports');

-- ---------------------------------------------------------------
-- Existing music: nothing moved.
-- ---------------------------------------------------------------
select is((select count(*)::int from lots where run_id in ('22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444')),16,
  'every existing music opportunity is still there');
select is((select count(*)::int from lots l join surfaces s on s.key=l.surface_key join runs r on r.id=l.run_id where s.category_key<>r.category_key),0,
  'and every one of them already names an option from its own fundraiser''s category');
select results_eq(
  $$select price_cents, mode::text, status::text from lots where id='a1000000-0000-0000-0000-000000000001'$$,
  $$values (120000, 'auction', 'sold')$$,
  'a sold music opportunity kept its price, its sale method and its status');
select is((select count(*)::int from lots where template_snapshot is null),0,'every opportunity records the template it was chosen from');
-- Rosie asks $40 for a spot whose template suggests $60. The suggestion is on the record; the price is hers.
select results_eq(
  $$select price_cents, (template_snapshot->>'suggested_price_cents')::int from lots where id='b1000000-0000-0000-0000-000000000002'$$,
  $$values (4000, 6000)$$,
  'the organizer''s price stands beside the suggestion it was chosen over, and wins');
select is((select count(*)::int from surfaces where category_key='music' and (default_price_cents is null or applies_to is null)),0,
  'every music template keeps its suggested price and its act types');
select is((select count(*)::int from surfaces where category_key<>'music' and (default_price_cents is not null or applies_to is not null)),0,
  'and no other category was given a price or an act type');

-- The lifecycle the auction and payment code drives still runs under the new trigger. The full
-- settlement paths are auctions_test.sql, which runs against this same schema.
select lives_ok($$update lots set status='pending_funding', funding_deadline=now()+interval '48 hours' where id='a1000000-0000-0000-0000-000000000002'$$,
  'an existing music opportunity still moves through its lifecycle');
select lives_ok($$update lots set status='open', funding_deadline=null where id='a1000000-0000-0000-0000-000000000002'$$,'and back');

-- ---------------------------------------------------------------
-- All four starting categories can define opportunities, by either sale method.
-- ---------------------------------------------------------------
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000010','foyer_banner',75000,'fixed')$$,'theater, fixed price');
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000010','playbill_credit',20000,'auction')$$,'theater, bidding');
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000011','end_credit',50000,'fixed')$$,'film, fixed price');
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000011','special_thanks',10000,'auction')$$,'film, bidding');
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000013','jersey_front',300000,'fixed')$$,'sports, fixed price');
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000013','fixture_posts',15000,'auction')$$,'sports, bidding');
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000012','posts_email',45000,'fixed')$$,'music, at the organizer''s own price');
select set_eq($$select unnest(enum_range(null::sale_mode))::text$$, $$values ('fixed'),('auction')$$,
  'fixed price and bidding are the sale methods, and no category is one');
select is((select template_snapshot->>'suggested_price_cents' from lots where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='foyer_banner'),
  null,'a theater opportunity records that no price was suggested, not a zero');

-- ---------------------------------------------------------------
-- An opportunity cannot be attached to the wrong fundraiser category. Service role included.
-- ---------------------------------------------------------------
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000010','kick_head',120000)$$,
  '23514','opportunity_category_mismatch','a kick drum head cannot go on a theater production');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000012','jersey_front',120000)$$,
  '23514','opportunity_category_mismatch','a jersey front cannot go on a music fundraiser');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000013','end_credit',120000)$$,
  '23514','opportunity_category_mismatch','a film credit cannot go on a season');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000011','foyer_banner',120000)$$,
  '23514','opportunity_category_mismatch','foyer signage cannot go on a film');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('22222222-2222-2222-2222-222222222222','curtain_speech',120000)$$,
  '23514','opportunity_category_mismatch','nor can anything outside music go on a published music fundraiser');
select throws_ok($$update lots set surface_key='kick_head' where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='foyer_banner'$$,
  '23514','opportunity_category_mismatch','an opportunity cannot be repointed at another category''s template');
select throws_ok($$update lots set run_id='e4400000-0000-4000-8000-000000000011' where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='foyer_banner'$$,
  '23514','opportunity_category_mismatch','or moved onto a fundraiser in another category');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000010','no_such_option',1000)$$,
  '23503',null,'an option that does not exist is refused as before');
-- The third side of the triangle, held since 0038: the fundraiser cannot move out from under them.
select throws_ok($$update runs set category_key='film' where id='e4400000-0000-4000-8000-000000000010'$$,
  '23514',null,'a fundraiser with opportunities cannot change category');
select throws_ok($$update surfaces set category_key='film' where key='foyer_banner'$$,
  '23514',null,'and a template in use cannot change category');
select lives_ok($$update surfaces set category_key='film' where key='set_dressing'$$,'a template nobody has used can still be moved');
update surfaces set category_key='theater' where key='set_dressing';

-- ---------------------------------------------------------------
-- The organizer's own session: what they may write, and what they may not see.
-- ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e4400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000010','curtain_speech',30000,'fixed')$$,
  'an organizer adds an opportunity from their own category');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000010','kick_head',120000)$$,
  '23514','opportunity_category_mismatch','and is refused one from another, whatever their form sent');
select throws_ok($$insert into lots (run_id,surface_key,price_cents,template_snapshot) values ('e4400000-0000-4000-8000-000000000010','production_posts',1000,'{"name":"Anything"}')$$,
  '42501',null,'an organizer cannot hand in their own record of what they chose from');
select throws_ok($$update lots set template_snapshot='{}' where run_id='e4400000-0000-4000-8000-000000000010'$$,'42501',null,'or rewrite it afterwards');
select throws_ok($$select template_snapshot from lots$$,'42501',null,'or read it: it is in no grant');
select lives_ok($$update lots set price_cents=32000 where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='curtain_speech'$$,
  'they change their own price freely');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000013','jersey_front',1000)$$,
  '42501',null,'and cannot add an opportunity to somebody else''s fundraiser, right category or not');
select throws_ok($$update surfaces set default_price_cents=1 where key='curtain_speech'$$,'42501',null,'an organizer cannot edit a template');
reset role;

set local role anon;
select set_config('request.jwt.claims','',true);
select lives_ok($$select key, name, category_key, group_key, default_price_cents, active, version from surfaces$$,'templates are public, their status included');
select throws_ok($$select template_snapshot from lots$$,'42501',null,'what an organizer chose from is not');
select throws_ok($$update surfaces set active=false$$,'42501',null,'anon retires nothing');
reset role;

-- ---------------------------------------------------------------
-- Template, opportunity: rewording one does not reword the other.
-- ---------------------------------------------------------------
select is((select template_snapshot->>'name' from lots where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='curtain_speech'),
  'Curtain speech','the opportunity recorded the template''s words when it was made');
update surfaces set name='Pre-show announcement', version=2 where key='curtain_speech';
select results_eq(
  $$select template_snapshot->>'name', (template_snapshot->>'version')::int from lots where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='curtain_speech'$$,
  $$values ('Curtain speech', 1)$$,
  'rewording the template does not reword what that organizer chose');
update lots set template_snapshot='{"name":"Rewritten"}', price_cents=33000 where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='curtain_speech';
select results_eq(
  $$select template_snapshot->>'name', price_cents from lots where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='curtain_speech'$$,
  $$values ('Curtain speech', 33000)$$,
  'not even the service role replaces the record, though the price still moves');

-- Retiring a template stops new opportunities and strands nothing.
update surfaces set active=false where key='playbill_credit';
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000010','playbill_credit',20000)$$,
  '23514','sponsorship_option_retired','a retired template starts nothing new');
select lives_ok($$update lots set price_cents=25000 where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='playbill_credit'$$,
  'an opportunity already made from it still takes a new price');
select lives_ok($$update lots set status='sold' where run_id='e4400000-0000-4000-8000-000000000010' and surface_key='playbill_credit'$$,
  'and can still sell');

-- ---------------------------------------------------------------
-- A fifth category is rows. No enum, no union, no release.
-- ---------------------------------------------------------------
select is_empty($$select column_name from information_schema.columns where table_schema='public'
   and ((table_name='surfaces' and column_name in ('category_key','group_key','default_period')) or (table_name='runs' and column_name='category_key'))
   and data_type<>'text'$$,
  'a category, a section and a period are text: adding one rewrites no enum');
insert into fundraiser_categories (key,label) values ('dance','Dance');
select lives_ok($$insert into surfaces (key,name,group_key,category_key,default_period,seen_by,sort) values
  ('studio_wall','Studio wall','studio','dance','term','every class, every week',401),
  ('recital_program_dance','Recital program','online','dance','term',null,402)$$,
  'a new category brings its own templates, sections and periods');
insert into runs (id,act_id,title,slug,status,category_key) values
 ('e4400000-0000-4000-8000-000000000014','e4400000-0000-4000-8000-00000000000a','Spring term','term-opps','draft','dance');
select lives_ok($$insert into lots (run_id,surface_key,price_cents,mode) values ('e4400000-0000-4000-8000-000000000014','studio_wall',30000,'auction')$$,
  'and its fundraisers price them');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000010','studio_wall',30000)$$,
  '23514','opportunity_category_mismatch','which a theater production cannot borrow');
select throws_ok($$insert into lots (run_id,surface_key,price_cents) values ('e4400000-0000-4000-8000-000000000014','kick_head',30000)$$,
  '23514','opportunity_category_mismatch','and which cannot borrow music''s');
select throws_ok($$insert into surfaces (key,name,group_key,category_key,applies_to,default_period) values ('studio_band','X','studio','dance','{soloist}','term')$$,
  '23514',null,'a music act type stays a music idea in the fifth category too');
select is((select publish_enabled from fundraiser_categories where key='dance'),false,
  'and defining opportunities does not open publishing: that is still a deliberate switch');

select * from finish();
rollback;
