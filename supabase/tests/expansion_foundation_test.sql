-- Draft category, ownership and compatibility contract. Every suite rolls back its fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e2000000-0000-4000-8000-000000000001','foundation-owner@example.com','{"roles":["patron"]}'),
 ('e2000000-0000-4000-8000-000000000002','foundation-other@example.com','{"roles":["organizer"]}');
insert into acts (id,owner_id,name,slug,type) values
 ('e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','Foundation organizer','foundation-organizer',null);
select is((select city from acts where slug='foundation-organizer'),null::text,'no invented city');
select ok((select roles @> array['patron','organizer'] from profiles where id='e2000000-0000-4000-8000-000000000001'),'ownership adds organizer without losing patron');
select ok((select roles @> array['organizer'] from profiles where id='e2000000-0000-4000-8000-000000000002'),'signup accepts organizer');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into runs(act_id,category_key,slug) select 'e2000000-0000-4000-8000-000000000003',key,'draft-'||key from fundraiser_categories$$,'all four categories save minimal drafts under the owner session');
select is((select count(*) from runs where act_id='e2000000-0000-4000-8000-000000000003' and kind is null and show_count is null and starts_on is null and ends_on is null and title=''),4::bigint,'no fabricated music fields or dates');
select lives_ok($$update runs set purpose='Equipment rental',sponsor_promise='Logo in the credits',audience_description='Festival audiences',goal_cents=125099,goal_currency='USD',activity_mode='hybrid',activity_locations='[{"city":"Accra","country_code":"GH"},{"city":"London","country_code":"GB"}]',timezone='Africa/Accra',delivery_due_at='2026-12-01T18:00:00+01:00',category_details='{"format":"Short film"}' where slug='draft-film'$$,'owner saves goals, promises, multi-city activity and a deadline');
select lives_ok($$update runs set activity_mode='online',activity_locations='[]',timezone='Asia/Tokyo' where slug='draft-theater'$$,'online-only activity needs no invented physical location');
select lives_ok($$update runs set category_key='film' where slug='draft-sports'$$,'an unattached private draft can change category');
select is((select extract(hour from delivery_due_at at time zone 'UTC')::int from runs where slug='draft-film'),17,'deadline retains its absolute instant');
select throws_ok($$update runs set category_details='{"sport":"Football"}' where slug='draft-film'$$,'23514',null,'category rejects unrelated details');
select throws_ok($$update runs set kind='tour' where slug='draft-film'$$,'23514',null,'nonmusic cannot acquire a tour placeholder');
select throws_ok($$update runs set status='open' where slug='draft-film'$$,'23514',null,'nonmusic remains draft-only');
select throws_ok($$update runs set timezone='Made/Up' where slug='draft-film'$$,'23514',null,'invalid time zone fails');
select throws_ok($$update runs set goal_cents=-1 where slug='draft-film'$$,'23514',null,'negative goal fails');
select throws_ok($$update runs set fundraising_starts_on='2026-12-02',fundraising_ends_on='2026-12-01' where slug='draft-film'$$,'23514',null,'fundraising dates have an order');
select throws_ok($$update runs set category_key='unregistered' where slug='draft-film'$$,'23514',null,'unknown category fails');
select throws_ok($$insert into fundraiser_categories(key,label) values ('injected','Injected')$$,'42501',null,'owner cannot expand the registry');
select throws_ok($$update runs set category_locked=false where slug='draft-film'$$,'42501',null,'owner cannot reset history lock');
select throws_ok($$update acts set stripe_payouts_enabled=true where slug='foundation-organizer'$$,'42501',null,'neutral profile cannot change payout flags');

select set_config('request.jwt.claims','{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from runs where act_id='e2000000-0000-4000-8000-000000000003'),0::bigint,'another owner cannot see drafts');
with changed as (update runs set title='Stolen' where slug='draft-film' returning id) select is(count(*),0::bigint,'another owner cannot update drafts') from changed;
select throws_ok($$insert into runs(act_id,category_key,slug) values ('e2000000-0000-4000-8000-000000000003','film','stolen')$$,'42501',null,'another owner cannot insert under this organizer');

reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*) from runs where act_id='e2000000-0000-4000-8000-000000000003'),0::bigint,'anonymous readers cannot see drafts');
select is((select count(*) from acts where slug='foundation-organizer'),0::bigint,'neutral organizer profile stays private');
select is((select count(*) from acts where slug='gutter-hymns'),1::bigint,'existing music profile stays public');
select throws_ok($$select sponsor_promise from runs$$,'42501',null,'new draft metadata is not added to anonymous column grants');
reset role;

insert into fundraiser_categories(key,label,detail_keys) values ('community','Community',array['project']);
select lives_ok($$insert into runs(act_id,category_key,slug,category_details) values ('e2000000-0000-4000-8000-000000000003','community','draft-community','{"project":"Garden"}')$$,'a fifth category needs registry data, not a schema enum change');
update fundraiser_categories set draft_enabled=false where key='community';
select throws_ok($$insert into runs(act_id,category_key,slug) values ('e2000000-0000-4000-8000-000000000003','community','disabled-community')$$,'23514',null,'disabled category refuses new drafts');
select throws_ok($$update runs set status='open' where slug='draft-film'$$,'23514',null,'service writes cannot bypass the category rollout gate');
select throws_ok($$update runs set category_key='film',kind=null,show_count=null where id=(select id from runs where status='open' limit 1)$$,'23514',null,'published music cannot be recategorized');
select throws_ok($$update acts set type=null where slug='gutter-hymns'$$,'23514',null,'existing published music profile cannot disappear');
select throws_ok($$update runs set kind='tour',starts_on='2026-12-01',ends_on='2026-12-02',show_count=2,status='open' where slug='draft-music'$$,'23514',null,'a neutral profile cannot enter the legacy music payment flow');

select * from finish();
rollback;
