-- The publish gate, per category (migration 0041). Every suite rolls back its fixtures.
--
-- src/lib/readiness.ts draws the same lines for the person doing the work. These are the ones that
-- hold when the form is not the caller: publishing is the moment a page becomes public and a
-- sponsorship becomes buyable, so the rule has to live where a direct write also meets it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- One act per owner, so the theater company and the band are two accounts.
insert into auth.users (id,email,raw_user_meta_data) values
 ('e4000000-0000-4000-8000-000000000001','gate-theater@example.com','{"roles":["organizer"]}'),
 ('e4000000-0000-4000-8000-000000000002','gate-band@example.com','{"roles":["musician"]}');
insert into acts (id,owner_id,name,slug,type) values
 ('e4000000-0000-4000-8000-000000000010','e4000000-0000-4000-8000-000000000001','Gate Theater','gate-theater',null),
 ('e4000000-0000-4000-8000-000000000011','e4000000-0000-4000-8000-000000000002','Gate Band','gate-band','touring_band');

insert into runs (id,act_id,title,slug,status,category_key) values
 ('e4000000-0000-4000-8000-000000000020','e4000000-0000-4000-8000-000000000010','Winter production','gate-winter','draft','theater');

-- The three questions, one at a time. Each is the only thing in the way.
select throws_ok(
  $$update runs set status='open' where slug='gate-winter'$$,
  '23514',null,'a theater fundraiser cannot publish with none of the three answered');

update runs set purpose='Rights, set build and rehearsal room.' where slug='gate-winter';
select throws_ok(
  $$update runs set status='open' where slug='gate-winter'$$,
  '23514',null,'the funding purpose alone is not enough');

update runs set audience_description='About 90 a night for three weeks.' where slug='gate-winter';
select throws_ok(
  $$update runs set status='open' where slug='gate-winter'$$,
  '23514',null,'and neither is the audience without the sponsor''s side');

update runs set sponsor_promise='A credit in the program and a name in the foyer.' where slug='gate-winter';
select lives_ok(
  $$update runs set status='open' where slug='gate-winter'$$,
  'all three answered, and a theater fundraiser goes public with no act type, no dates and no city');

select is((select status from runs where slug='gate-winter'),'open','it really is open');
select ok((select category_locked from runs where slug='gate-winter'),'and its category is frozen from here');

-- A name is required of everybody. The column defaults to an empty string for drafts.
insert into runs (id,act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise) values
 ('e4000000-0000-4000-8000-000000000021','e4000000-0000-4000-8000-000000000010','','gate-unnamed','draft','film',
  'Finishing funds.','Festival audiences.','A credit in the end titles.');
select throws_ok(
  $$update runs set status='open' where slug='gate-unnamed'$$,
  '23514',null,'a fundraiser with no name cannot publish, whatever else it answered');

-- Music's gate is untouched: its own details, and a music profile to hang them on.
insert into runs (id,act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise) values
 ('e4000000-0000-4000-8000-000000000022','e4000000-0000-4000-8000-000000000011','Spring run','gate-spring','draft','music',
  'Van and gas.','People who come to the shows.','A logo on the kick drum head.');
select throws_ok(
  $$update runs set status='open' where slug='gate-spring'$$,
  '23514',null,'music still cannot publish without its format, dates and count, however well it answered the rest');

update runs set kind='tour', starts_on='2026-10-03', ends_on='2026-11-02', show_count=18 where slug='gate-spring';
select lives_ok(
  $$update runs set status='open' where slug='gate-spring'$$,
  'and publishes the moment it has them');

insert into runs (id,act_id,title,slug,status,category_key,kind,starts_on,ends_on,show_count) values
 ('e4000000-0000-4000-8000-000000000023','e4000000-0000-4000-8000-000000000011','Autumn run','gate-autumn','draft','music',
  'tour','2026-10-03','2026-11-02',18);
select lives_ok(
  $$update runs set status='open' where slug='gate-autumn'$$,
  'and a music fundraiser is never asked the three questions, which is what keeps the published ones publishable');

-- The registry decides which categories may publish, so a new one is draft-only until somebody says.
insert into fundraiser_categories (key,label,detail_keys) values ('community','Community',array['project']);
insert into runs (id,act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise) values
 ('e4000000-0000-4000-8000-000000000024','e4000000-0000-4000-8000-000000000010','Garden','gate-garden','draft','community',
  'Tools and seed.','The neighborhood.','A name on the gate.');
select is((select publish_enabled from fundraiser_categories where key='community'),false,'a category added in SQL cannot publish by default');
select throws_ok(
  $$update runs set status='open' where slug='gate-garden'$$,
  '23514',null,'and a complete fundraiser in it is still refused');
update fundraiser_categories set publish_enabled=true where key='community';
select lives_ok(
  $$update runs set status='open' where slug='gate-garden'$$,
  'turning it on is the whole change, with no new code and no new column');

select is((select count(*)::int from fundraiser_categories where key in ('music','sports','film','theater') and publish_enabled),4,
  'the four launch categories are the ones turned on');

-- The other half of publishing: a reader with no account can actually reach the page. Migration
-- 0038 made a music act type the whole test for a public profile, and the board reads the act
-- before it reads the fundraiser, so without this a published theater page is a 404.
insert into auth.users (id,email) values ('e4000000-0000-4000-8000-000000000003','gate-drafts@example.com');
insert into acts (id,owner_id,name,slug,type) values
 ('e4000000-0000-4000-8000-000000000012','e4000000-0000-4000-8000-000000000003','Gate Drafts','gate-drafts',null);
insert into runs (id,act_id,title,slug,status,category_key) values
 ('e4000000-0000-4000-8000-000000000025','e4000000-0000-4000-8000-000000000012','Someday','gate-someday','draft','film');

set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*)::int from acts where slug='gate-theater'),1,'a theater company with a published fundraiser has a public profile');
select is((select count(*)::int from runs where slug='gate-winter'),1,'and the fundraiser itself is readable');
select is((select count(*)::int from acts where slug='gate-drafts'),0,'an organizer with nothing published stays private');
select is((select count(*)::int from runs where slug='gate-someday'),0,'and so does their draft');
reset role;

select * from finish();
rollback;
