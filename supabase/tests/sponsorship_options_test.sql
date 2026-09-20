-- Sponsorship options outside music (migration 0040). Every suite rolls back its fixtures.
--
-- The surfaces table was music-shaped in two ways that would have become silent defaults for every
-- other category: an act type on every row, and a suggested price on every row. These assertions
-- are what keep both optional and keep the act type out of the categories it means nothing to.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is((select count(*)::int from surfaces where category_key='sports'),5,'sports can offer five things');
select is((select count(*)::int from surfaces where category_key='film'),6,'film can offer six things');
select is((select count(*)::int from surfaces where category_key='theater'),5,'theater can offer five things');

select is((select category_key from surfaces where key='kick_head'),'music','an option written before categories existed is music');
select is((select count(*)::int from surfaces where category_key='music' and default_price_cents is null),0,
  'every music option still carries the price it always had');
select is((select count(*)::int from surfaces where category_key<>'music' and default_price_cents is not null),0,
  'no price was invented for a category Door Money has not sold');

select col_is_null('public','surfaces','default_price_cents','a suggested price is optional now');
select col_is_null('public','surfaces','applies_to','an act type is optional now');

select throws_ok(
  $$insert into surfaces (key,name,group_key,category_key,applies_to,default_period)
    values ('x_test','X','stage','theater','{touring_band}','production')$$,
  '23514',null,'a theater option cannot carry a music act type');

select throws_ok(
  $$insert into surfaces (key,name,group_key,category_key,default_period)
    values ('y_test','Y','stage','opera','production')$$,
  '23503',null,'an option cannot name a category the registry does not have');

-- The point of the row: a lot can be priced against it. lots.surface_key is the foreign key that
-- made a TypeScript-only option unusable.
insert into acts (id,owner_id,name,slug,type) values
 ('e3000000-0000-4000-8000-000000000001',null,'Foundation theater','foundation-theater',null);
insert into runs (id,act_id,title,slug,status,category_key) values
 ('e3000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000001','Winter production','winter-production','draft','theater');
select lives_ok(
  $$insert into lots (run_id,surface_key,price_cents)
    values ('e3000000-0000-4000-8000-000000000002','foyer_banner',50000)$$,
  'a theater fundraiser can price a theater option');

select * from finish();
rollback;
