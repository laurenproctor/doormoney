-- A patron's profile customization (migration 0050). Every suite rolls back its fixtures.
--
-- Asked of the database directly, because each has to hold when the application is not the caller.
-- Which categories a patron may list is its own switch, and turning it on for hospitality opened
-- nothing else. The tag is text with a length, the light is one of the design system's themes, and
-- the header is a path and never an address. The public reads all three through the view only,
-- only for a published profile, and may write none of it. No browser role can set any of them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e5000000-0000-4000-8000-000000000001','custom-owner@example.com','{"roles":["patron"]}'),
 ('e5000000-0000-4000-8000-000000000002','custom-private@example.com','{"roles":["patron"]}');
update profiles set username='kettle-custom' where id='e5000000-0000-4000-8000-000000000001';
update profiles set username='quiet-custom' where id='e5000000-0000-4000-8000-000000000002';
insert into patron_profiles (profile_id,display_name,published,published_at,patron_since) values
 ('e5000000-0000-4000-8000-000000000001','Kettle St. Coffee',true,now(),now()),
 ('e5000000-0000-4000-8000-000000000002','Quiet Patron',false,null,now());

-- ---------------------------------------------------------------
-- The preference switch, and what it did not open
-- ---------------------------------------------------------------
select results_eq($$select key from fundraiser_categories where preference_enabled order by key$$,
  $$values ('film'),('hospitality'),('music'),('sports'),('theater')$$,
  'a patron may list the four that publish, and hospitality');
select is((select preference_enabled from fundraiser_categories where key='other'),false,
  'the other category is not a preference: Other on the profile is a typed tag');
select results_eq($$select key from fundraiser_categories where publish_enabled order by key$$,
  $$values ('film'),('music'),('sports'),('theater')$$,
  'and the same four publish as before: listing hospitality published nothing');
select is((select count(*)::int from delivery_policies where category_key in ('hospitality','other')),0,
  'nor did it give either a delivery policy');
select lives_ok($$insert into patron_profile_categories (profile_id,category_key) values ('e5000000-0000-4000-8000-000000000001','hospitality')$$,
  'the service role records that a patron supports hospitality');

-- ---------------------------------------------------------------
-- The constraints, as the service role meets them
-- ---------------------------------------------------------------
select lives_ok($$update patron_profiles set custom_tag='Community radio', theme='teal', header_path='e5000000-0000-4000-8000-000000000001/header-a.jpg'
  where profile_id='e5000000-0000-4000-8000-000000000001'$$,'a tag, a light and a header path are saved');
select throws_ok($$update patron_profiles set custom_tag='' where profile_id='e5000000-0000-4000-8000-000000000001'$$,'23514',null,'an empty tag is nothing, and nothing is null');
select throws_ok($$update patron_profiles set custom_tag=repeat('x',41) where profile_id='e5000000-0000-4000-8000-000000000001'$$,'23514',null,'the tag has a length');
select throws_ok($$update patron_profiles set custom_tag=E'two\nlines' where profile_id='e5000000-0000-4000-8000-000000000001'$$,'23514',null,'and is one line');
select throws_ok($$update patron_profiles set theme='#ff00ff' where profile_id='e5000000-0000-4000-8000-000000000001'$$,'23514',null,'a typed color is refused: the light is a theme name');
select throws_ok($$update patron_profiles set theme='mono' where profile_id='e5000000-0000-4000-8000-000000000001'$$,'23514',null,'mono is the legal pages'' light, not a profile''s');
select lives_ok($$update patron_profiles set theme=null where profile_id='e5000000-0000-4000-8000-000000000002'$$,'never chosen is null, and the page is lit in the default');
select throws_ok($$update patron_profiles set header_path=repeat('x',201) where profile_id='e5000000-0000-4000-8000-000000000001'$$,'23514',null,'a header path has a length');
update patron_profiles set custom_tag='Hidden tag', theme='red' where profile_id='e5000000-0000-4000-8000-000000000002';

select is((select 'image/gif' = any(allowed_mime_types) from storage.buckets where id='patron-photos'),true,'the private photo bucket takes a GIF');
select is((select public from storage.buckets where id='patron-photos'),false,'and is still private');

-- ---------------------------------------------------------------
-- What a visitor reads, and cannot do
-- ---------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims','',true);
select results_eq($$select custom_tag, theme, header_path from public_patron_profiles where username='kettle-custom'$$,
  $$values ('Community radio'::text,'teal'::text,'e5000000-0000-4000-8000-000000000001/header-a.jpg'::text)$$,
  'a published profile shows its tag, its light and its header path');
select ok((select 'hospitality' = any(category_keys) and 'Restaurants & hospitality' = any(category_labels) from public_patron_profiles where username='kettle-custom'),
  'and hospitality among what it supports, under the registry''s name');
select is_empty($$select 1 from public_patron_profiles where username='quiet-custom'$$,'a private profile shows none of it');
select throws_ok($$update public_patron_profiles set theme='lime'$$,'55000',null,'the view is a read path: a visitor cannot relight a page');
select throws_ok($$select custom_tag from patron_profiles$$,'42501',null,'and cannot read the table behind it');
select throws_ok($$select preference_enabled from fundraiser_categories$$,'42501',null,'nor a category''s switches: a name and a key, as before');
reset role;

-- ---------------------------------------------------------------
-- What a signed-in account reads, and cannot do
-- ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select custom_tag, theme from patron_profiles$$,$$values ('Hidden tag'::text,'red'::text)$$,'a patron reads their own tag and light, and nobody else''s');
select throws_ok($$update patron_profiles set theme='lime' where profile_id='e5000000-0000-4000-8000-000000000002'$$,'42501',null,
  'and writes none of it: the server action does, after it has proven the session (0029)');
select throws_ok($$update patron_profiles set header_path='e5000000-0000-4000-8000-000000000001/header-a.jpg' where profile_id='e5000000-0000-4000-8000-000000000002'$$,'42501',null,
  'so nobody can point their header at somebody else''s object');
select throws_ok($$update fundraiser_categories set preference_enabled=true where key='other'$$,'42501',null,'nor switch a category on');
select results_eq($$select key from fundraiser_categories where preference_enabled order by key$$,
  $$values ('film'),('hospitality'),('music'),('sports'),('theater')$$,
  'the profile form reads the list under the account''s own session');
select throws_ok($$insert into patron_profile_categories (profile_id,category_key) values ('e5000000-0000-4000-8000-000000000002','hospitality')$$,'42501',null,
  'and a category is still recorded by the server, never by the browser');
reset role;

select * from finish();
rollback;
