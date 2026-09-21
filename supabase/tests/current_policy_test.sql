-- Which policy a purchase is sold under (migration 0046): the newest one switched on, and only
-- failing that a proposal. Every suite rolls back its fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into acts (id,owner_id,name,slug,type) values ('e7000000-0000-4000-8000-00000000000a',null,'Second Stage','second-stage-policy',null);
insert into runs (id,act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise) values
 ('e7000000-0000-4000-8000-000000000010','e7000000-0000-4000-8000-00000000000a','Winter production','winter-policy','open','theater','Rights.','Ninety seats.','A program credit.');
insert into lots (id,run_id,surface_key,price_cents,mode,status) values
 ('e7000000-0000-4000-8000-0000000000a1','e7000000-0000-4000-8000-000000000010','playbill_credit',50000,'fixed','open'),
 ('e7000000-0000-4000-8000-0000000000a2','e7000000-0000-4000-8000-000000000010','foyer_banner',60000,'fixed','open'),
 ('e7000000-0000-4000-8000-0000000000a3','e7000000-0000-4000-8000-000000000010','curtain_speech',20000,'fixed','open'),
 ('e7000000-0000-4000-8000-0000000000a4','e7000000-0000-4000-8000-000000000010','production_posts',10000,'fixed','open');
create function pg_temp.version_for(p_lot uuid) returns int language sql as $$
  select s.policy_version from purchase_snapshots s join purchases p on p.id = s.purchase_id where p.lot_id = p_lot;
$$;

-- Music: somebody drafts version 2 beside the active version 1.
insert into delivery_policies (category_key,version,status,release_rule) values ('music',2,'proposed','calendar');
select is((public.current_delivery_policy('music')).version,1,'a draft of music version 2 does not become the policy music is sold under');
select lives_ok($$select begin_lot_purchase('b1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001',3000,450)$$,'a music purchase still goes through');
select is(pg_temp.version_for('b1000000-0000-0000-0000-000000000003'),1,'and is recorded under the version that is switched on');
update delivery_policies set status='active' where category_key='music' and version=2;
select is((public.current_delivery_policy('music')).version,2,'switching version 2 on is what makes it current');
select is(pg_temp.version_for('b1000000-0000-0000-0000-000000000003'),1,'and the purchase already made keeps the version it was bought under');

-- Theater: nothing switched on, so the newest proposal is what test mode verifies.
insert into delivery_policies (category_key,version,status,release_rule) values ('theater',2,'proposed','evidence');
select begin_lot_purchase('e7000000-0000-4000-8000-0000000000a1','c1000000-0000-0000-0000-000000000001',50000,7500);
select is(pg_temp.version_for('e7000000-0000-4000-8000-0000000000a1'),2,'with none active, the newest proposal is used');
update delivery_policies set status='active' where category_key='theater' and version=1;
select begin_lot_purchase('e7000000-0000-4000-8000-0000000000a2','c1000000-0000-0000-0000-000000000001',60000,9000);
select is(pg_temp.version_for('e7000000-0000-4000-8000-0000000000a2'),1,'an active version 1 outranks a proposed version 2');

-- Retired sells nothing.
update delivery_policies set status='retired' where category_key='theater';
select throws_ok($$select begin_lot_purchase('e7000000-0000-4000-8000-0000000000a3','c1000000-0000-0000-0000-000000000001',20000,3000)$$,
  '23514','no_delivery_policy','a category whose policies are all retired cannot be bought');
select is_empty($$select 1 from information_schema.role_routine_grants where routine_schema='public' and routine_name='current_delivery_policy' and grantee in ('anon','authenticated','PUBLIC')$$,
  'and no browser role can call the function');

select * from finish();
rollback;
