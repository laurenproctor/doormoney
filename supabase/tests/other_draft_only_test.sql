-- Other is a draft-only category (migration 0049). Every suite rolls back its fixtures.
--
-- Other is for a project no named category fits. It is a controlled way in, not a way round the
-- explanation, so the database is asked five things directly, because each has to hold when the
-- application is not the caller. An organizer can save a private draft in it, using the shared
-- fields and nothing else. It has no details, no templates and no suggested price, so no other
-- category's words or options can ride along. It cannot leave draft status, for any role. Nobody
-- without a session can see it. And it cannot be sold: there is no delivery policy, and with no
-- template there is no option to buy. The last block shows that neither switch alone opens it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e9000000-0000-4000-8000-000000000001','other-organizer@example.com','{"roles":["organizer"]}'),
 ('e9000000-0000-4000-8000-000000000002','other-bystander@example.com','{"roles":["patron"]}');
insert into acts (id,owner_id,name,slug,type) values
 ('e9000000-0000-4000-8000-00000000000a','e9000000-0000-4000-8000-000000000001','Harbor Reading Room','harbor-reading-room-other',null);

-- ---------------------------------------------------------------
-- The category, as the migration leaves it
-- ---------------------------------------------------------------
select results_eq($$select label, draft_enabled, publish_enabled from fundraiser_categories where key='other'$$,
  $$values ('Other', true, false)$$,
  'other takes drafts and cannot publish');
select is((select detail_keys from fundraiser_categories where key='other'), array[]::text[],
  'it has no details of its own: the shared fields are the whole form');
select is((select count(*)::int from surfaces where category_key='other'),0,
  'it has no sponsorship option templates, so no placement and no price is suggested');
select is((select count(*)::int from delivery_policies where category_key='other'),0,
  'it has no delivery policy, proposed or active');
select ok((public.current_delivery_policy('other')).category_key is null,
  'so the policy a purchase would be sold under does not exist');
select is((select count(*)::int from fundraiser_categories where publish_enabled),5,
  'the four launch categories and digital workers may publish; Other remains draft-only');

-- ---------------------------------------------------------------
-- A private draft, written as the organizer, in the shared fields
-- ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select lives_ok($$insert into runs (act_id,title,slug,status,category_key,purpose,description,audience_description,sponsor_promise,activity_mode,goal_cents,goal_currency) values
  ('e9000000-0000-4000-8000-00000000000a','Winter reading series','harbor-winter','draft','other',
   'Room hire and printing for six readings.','Six evenings of new writing.','Readers who come to the evenings, and the mailing list.','A name on the printed program.','hybrid',300000,'USD')$$,
  'an organizer saves an Other draft with the purpose, the audience and the sponsor promise in their own words');
select lives_ok($$insert into runs (act_id,title,slug,status,category_key) values
  ('e9000000-0000-4000-8000-00000000000a','','harbor-empty','draft','other')$$,
  'and one with nothing answered yet: a draft holds what is known so far');
select throws_ok($$update runs set category_details='{"format":"Reading series"}' where slug='harbor-winter'$$,
  '23514',null,'no detail key is allowed, so no other category''s field can ride along');
select throws_ok($$update runs set kind='residency', show_count=6 where slug='harbor-winter'$$,
  '23514',null,'and music''s fields are refused');

-- Every option is some category's template, and none is Other's.
select throws_ok($$insert into lots (run_id,surface_key,price_cents,mode)
  select id,'kick_head',120000,'fixed' from runs where slug='harbor-winter'$$,
  '23514','opportunity_category_mismatch','a music option cannot sit on an Other draft');
select throws_ok($$insert into lots (run_id,surface_key,price_cents,mode)
  select id,'dinner_series',90000,'fixed' from runs where slug='harbor-winter'$$,
  '23514','opportunity_category_mismatch','nor a hospitality one: Other borrows nobody''s templates');

-- ---------------------------------------------------------------
-- It cannot be published, by the organizer or by anybody
-- ---------------------------------------------------------------
select throws_ok($$update runs set status='open' where slug='harbor-winter'$$,
  '23514','this category is not enabled for publishing','the organizer cannot publish it, however well it is explained');
select throws_ok($$insert into runs (act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise) values
  ('e9000000-0000-4000-8000-00000000000a','Spring series','harbor-spring','open','other','Room hire.','Readers.','A name on the program.')$$,
  '23514','this category is not enabled for publishing','nor create one already open');
reset role;

select throws_ok($$update runs set status='open' where slug='harbor-winter'$$,
  '23514','this category is not enabled for publishing','the service role is refused too: the gate is a trigger, not a policy');
select is((select status::text from runs where slug='harbor-winter'),'draft','it is still a draft');

-- ---------------------------------------------------------------
-- Nobody without a session can find it, and it is not a sponsor preference
-- ---------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*)::int from runs where category_key='other'),0,'a visitor sees no Other fundraiser');
select is((select count(*)::int from acts where slug='harbor-reading-room-other'),0,'nor the organizer, who has nothing published');
select is((select label from fundraiser_categories where key='other'),'Other','a visitor may read its name');
select throws_ok($$select publish_enabled from fundraiser_categories where key='other'$$,
  '42501',null,'and nothing about its switches');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from runs where slug='harbor-winter'),0,'another signed-in account does not see the draft');
reset role;

-- ---------------------------------------------------------------
-- What opening it would take: two switches, and each one alone opens nothing
-- ---------------------------------------------------------------
insert into delivery_policies (category_key,version,release_rule) values ('other',1,'evidence');
select throws_ok($$update runs set status='open' where slug='harbor-winter'$$,
  '23514','this category is not enabled for publishing','a policy alone still publishes nothing');
delete from delivery_policies where category_key='other';
update fundraiser_categories set publish_enabled=true where key='other';
select is((select count(*)::int from lots l join runs r on r.id=l.run_id where r.category_key='other'),0,
  'and publishing switched on alone still sells nothing: with no template there is no option to buy');
select is((public.current_delivery_policy('other')).category_key is null, true,
  'nor is there a policy to buy one under');

select * from finish();
rollback;
