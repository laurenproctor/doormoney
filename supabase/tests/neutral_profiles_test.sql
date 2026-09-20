-- Neutral organizer and patron profiles (migration 0043): what a profile may say about itself, who
-- may write it, and what the public may read. Kept in its own file, like account_photo_test.sql.
-- Every suite rolls back its fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e4300000-0000-4000-8000-000000000001','neutral-owner@example.com','{"roles":["patron"]}'),
 ('e4300000-0000-4000-8000-000000000002','neutral-other@example.com','{"roles":["patron"]}');
insert into acts (id,owner_id,name,slug,type) values
 ('e4300000-0000-4000-8000-000000000003','e4300000-0000-4000-8000-000000000001','Second Stage','second-stage',null),
 ('e4300000-0000-4000-8000-000000000004','e4300000-0000-4000-8000-000000000002','Harbor FC','harbor-fc',null);

-- ---------------------------------------------------------------
-- Nothing existing was guessed at, and a category is on no profile.
-- ---------------------------------------------------------------
select is((select count(*) from acts where slug in ('gutter-hymns','rosie-bassoon') and entity_kind is null and links = '[]'::jsonb and audience_description is null),
  2::bigint,'existing music profiles were not backfilled with a guess');
select is((select type::text from acts where slug='gutter-hymns'),'touring_band','the music act type is untouched');
select is_empty($$select table_name || '.' || column_name from information_schema.columns
   where table_schema='public' and table_name in ('acts','patron_profiles','profiles') and column_name ~ 'category'$$,
  'no profile and no account carries a category: it belongs to the fundraiser');

-- ---------------------------------------------------------------
-- The constraints, as the service role meets them.
-- ---------------------------------------------------------------
select lives_ok($$update acts set entity_kind='production_company', audience_description='Ninety seats a night.',
  links='[{"label":"Season","url":"https://secondstage.example/season"},{"label":"","url":"https://vimeo.com/secondstage"}]'
  where slug='second-stage'$$,'an organizer says what it is, who it reaches and where else to find it');
select throws_ok($$update acts set entity_kind='theater' where slug='second-stage'$$,'23514',null,'a category is not a kind of organizer');
select throws_ok($$update acts set entity_kind='musician' where slug='second-stage'$$,'23514',null,'nor is a role');
select throws_ok($$update acts set audience_description=repeat('x',601) where slug='second-stage'$$,'23514',null,'the audience line has a length');
select throws_ok($$update acts set links='{"label":"x","url":"https://a.example"}' where slug='second-stage'$$,'23514',null,'links must be a list');
select throws_ok($$update acts set links='[{"label":"x","url":"http://plain.example"}]' where slug='second-stage'$$,'23514',null,'a link is https');
select throws_ok($$update acts set links='[{"label":"x","url":"javascript:alert(1)"}]' where slug='second-stage'$$,'23514',null,'a script is not a link');
select throws_ok($$update acts set links='[{"url":"https://a.example"}]' where slug='second-stage'$$,'23514',null,'a link carries a label, even an empty one');
select throws_ok($$update acts set links='[{"label":"x","url":"https://a.example","onclick":"x"}]' where slug='second-stage'$$,'23514',null,'a link carries nothing else');
select throws_ok($$update acts set links='["https://a.example"]' where slug='second-stage'$$,'23514',null,'a bare string is not a link');
select throws_ok($$update acts set links=(select jsonb_agg(jsonb_build_object('label','','url','https://s'||n||'.example')) from generate_series(1,7) n) where slug='second-stage'$$,
  '23514',null,'seven links is one too many');
select throws_ok($$update acts set links=jsonb_build_array(jsonb_build_object('label',repeat('x',41),'url','https://a.example')) where slug='second-stage'$$,'23514',null,'a label has a length');

-- ---------------------------------------------------------------
-- The owner's own session.
-- ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e4300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$update acts set entity_kind='company', audience_description='The house, and the mailing list.', links='[]' where slug='second-stage'$$,
  'the owner edits the neutral fields on their own profile');
select is((select entity_kind from acts where slug='second-stage'),'company','and reads them back');
with changed as (update acts set entity_kind='team' where slug='harbor-fc' returning id)
select is(count(*),0::bigint,'another organizer''s profile is out of reach') from changed;
select throws_ok($$update acts set stripe_payouts_enabled=true where slug='second-stage'$$,'42501',null,'the new grants open nothing else on the row');
reset role;

-- ---------------------------------------------------------------
-- What the public may read of an organizer.
-- ---------------------------------------------------------------
update acts set region='England', country_code='GB', entity_kind='production_company',
  links='[{"label":"Season","url":"https://secondstage.example/season"}]' where slug='second-stage';

set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*) from acts where slug='second-stage'),0::bigint,'a neutral profile with nothing published is still unseen');
reset role;

-- One organizer, two categories. Neither one is written onto the profile.
insert into runs (act_id,category_key,slug,title,purpose,audience_description,sponsor_promise,status) values
 ('e4300000-0000-4000-8000-000000000003','theater','winter','Winter production','Rights and a rehearsal room.','Ninety seats a night.','A program credit.','open'),
 ('e4300000-0000-4000-8000-000000000003','film','short','The short','Two shooting days.','Festival and online audiences.','An end credit.','open');
select is((select count(distinct category_key) from runs where act_id='e4300000-0000-4000-8000-000000000003' and status='open'),
  2::bigint,'one organizer raises in two categories at once');

set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*) from acts where slug='second-stage'),1::bigint,'a published fundraiser makes the organizer public');
select lives_ok($$select slug, name, type, entity_kind, city, region, country_code, bio, audience_description, links, photo_url, instagram, website from acts$$,
  'the public organizer columns are readable, region and country included');
select is((select links->0->>'url' from acts where slug='second-stage'),'https://secondstage.example/season','the links reach the page');
select is((select city from acts where slug='second-stage'),null::text,'and nobody was given a city');
select throws_ok($$select owner_id from acts$$,'42501',null,'the owner is still not public');
select throws_ok($$select stripe_account_id from acts$$,'42501',null,'nor is the Connect account');
select is((select count(*) from acts where slug='harbor-fc'),0::bigint,'an organizer with nothing published stays unseen');
select is((select count(*) from acts where slug='gutter-hymns'),1::bigint,'an existing music profile is public as before');
select throws_ok($$update acts set entity_kind='other' where slug='second-stage'$$,'42501',null,'anon writes nothing');

-- Category names, and nothing else about a category.
select is((select label from fundraiser_categories where key='sports'),'Sports teams','anon can name a category from the registry');
select throws_ok($$select publish_enabled from fundraiser_categories$$,'42501',null,'but not read whether it may publish');
select throws_ok($$select detail_keys from fundraiser_categories$$,'42501',null,'nor its detail keys');
select throws_ok($$insert into fundraiser_categories(key,label) values ('injected','Injected')$$,'42501',null,'nor add one');
select throws_ok($$select category_key from patron_profile_categories$$,'42501',null,'and a patron''s choices are not a public table');
reset role;

-- ---------------------------------------------------------------
-- The patron profile: a person or an organization, supporting any category.
-- ---------------------------------------------------------------
update profiles set username='kettle-st-neutral' where id='e4300000-0000-4000-8000-000000000001';
update profiles set username='quiet-patron' where id='e4300000-0000-4000-8000-000000000002';
insert into patron_profiles (profile_id, display_name, profile_kind, location, links, interests, published, published_at) values
 ('e4300000-0000-4000-8000-000000000001','Kettle St. Coffee','business','Online','[{"label":"Menu","url":"https://kettlest.example/menu"}]',array['Jazz','Film'],true,now()),
 ('e4300000-0000-4000-8000-000000000002','Quiet Patron',null,null,'[]','{}',false,null);
select throws_ok($$update patron_profiles set profile_kind='music' where profile_id='e4300000-0000-4000-8000-000000000001'$$,'23514',null,'a category is not a kind of patron');
select throws_ok($$update patron_profiles set links='[{"label":"x","url":"http://plain.example"}]' where profile_id='e4300000-0000-4000-8000-000000000001'$$,'23514',null,'patron links are held to the same rule');

insert into patron_profile_categories (profile_id, category_key) values
 ('e4300000-0000-4000-8000-000000000001','theater'),
 ('e4300000-0000-4000-8000-000000000001','sports'),
 ('e4300000-0000-4000-8000-000000000002','film');
select throws_ok($$insert into patron_profile_categories (profile_id, category_key) values ('e4300000-0000-4000-8000-000000000001','dance')$$,
  '23503',null,'a category the registry does not hold cannot be supported');
insert into fundraiser_categories(key,label) values ('dance','Dance');
select lives_ok($$insert into patron_profile_categories (profile_id, category_key) values ('e4300000-0000-4000-8000-000000000001','dance')$$,
  'a fifth category needs a registry row and nothing else');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e4300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from patron_profile_categories),3::bigint,'a patron reads their own choices and nobody else''s');
select throws_ok($$insert into patron_profile_categories (profile_id, category_key) values ('e4300000-0000-4000-8000-000000000001','film')$$,
  '42501',null,'and writes none from the browser, like the rest of the profile');
select is((select profile_kind from patron_profiles where profile_id=auth.uid()),'business','the patron reads their own kind');
reset role;

set local role anon;
select set_config('request.jwt.claims','',true);
select results_eq($$select profile_kind, links->0->>'url', category_keys, category_labels, interests from public_patron_profiles where username='kettle-st-neutral'$$,
  $$values ('business'::text, 'https://kettlest.example/menu'::text, array['dance','sports','theater'], array['Dance','Sports teams','Theater'], array['Jazz','Film'])$$,
  'a published profile shows its kind, its links and its categories by name, and Film typed as an interest is not a category');
select is((select count(*) from public_patron_profiles where username='quiet-patron'),0::bigint,'an unpublished profile shows nothing, categories included');
reset role;

-- The activity view names each fundraiser's own category, and neither view is a write path.
select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='public_patron_activity' and column_name='category_key'),
  'published activity carries the fundraiser''s category');
select is((select count(*) from public_patron_activity where category_key is null),0::bigint,'and every row has one, music included');
select is_empty($$select table_name || ':' || privilege_type from information_schema.role_table_grants
   where table_schema='public' and table_name in ('public_patron_profiles','public_patron_activity')
     and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')$$,
  'replacing the views left them read-only: the four write privileges 0030 revoked are still gone');

select * from finish();
rollback;
