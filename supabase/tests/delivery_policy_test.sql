-- Delivery policy, purchase snapshots, deliverables and evidence (migration 0045).
-- A theater purchase is carried from payment to a release row, and every privacy and immutability
-- rule is asked of the database directly. Every suite rolls back its fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e6000000-0000-4000-8000-000000000001','delivery-organizer@example.com','{"roles":["organizer"]}'),
 ('e6000000-0000-4000-8000-000000000002','delivery-other@example.com','{"roles":["organizer"]}'),
 ('e6000000-0000-4000-8000-000000000003','delivery-sponsor@example.com','{"roles":["patron"]}');
insert into acts (id,owner_id,name,slug,type) values
 ('e6000000-0000-4000-8000-00000000000a','e6000000-0000-4000-8000-000000000001','Second Stage','second-stage-delivery',null),
 ('e6000000-0000-4000-8000-00000000000b','e6000000-0000-4000-8000-000000000002','Harbor Juniors','harbor-juniors-delivery',null);
insert into runs (id,act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise,delivery_due_at,category_details) values
 ('e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-00000000000a','Winter production','winter-delivery','open','theater','Rights and a rehearsal room.','Ninety seats a night.','A program credit.','2026-12-20T20:00:00Z','{}'),
 ('e6000000-0000-4000-8000-000000000011','e6000000-0000-4000-8000-00000000000b','Spring season','season-delivery','open','sports','Kit and travel.','Families at home fixtures.','A touchline banner.',null,'{"sport":"Soccer","level":"youth"}');
-- These spots carry no offer terms, as every spot did before migration 0060, and their fundraiser is
-- already public, so they are marked grandfathered the way 0060 marks the real ones (0061 refuses the
-- shape otherwise). The test is about what it was about, not about offer terms.
insert into lots (id,run_id,surface_key,price_cents,mode,status, terms_grandfathered) values
 ('e6000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000010','playbill_credit',50000,'fixed','open', true),
 ('e6000000-0000-4000-8000-0000000000b1','e6000000-0000-4000-8000-000000000011','touchline_banner',80000,'fixed','open', true);
insert into patrons (id,name,contact_email,profile_id) values
 ('e6000000-0000-4000-8000-0000000000c1','Kettle St. Coffee','delivery-sponsor@example.com','e6000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------
select results_eq($$select category_key, version, status, release_rule from delivery_policies order by category_key$$,
  $$values ('digital_workers',1,'proposed','evidence'),('film',1,'proposed','evidence'),('music',1,'active','calendar'),('sports',1,'proposed','evidence'),('theater',1,'proposed','evidence')$$,
  'music is active on its calendar; every other category is proposed, on evidence, and not switched on');
select is((select count(*)::int from fundraiser_categories c where c.publish_enabled and not exists (select 1 from delivery_policies p where p.category_key=c.key)),0,
  'every category that can publish has a documented policy');

-- ---------------------------------------------------------------
-- Existing music: a snapshot, its policy version, and nothing else changed
-- ---------------------------------------------------------------
select is((select count(*)::int from purchases p where not exists (select 1 from purchase_snapshots s where s.purchase_id=p.id)),0,
  'every existing purchase has a snapshot');
select is((select count(*)::int from purchase_snapshots where policy_category<>'music' or policy_version<>1),0,
  'and every one of them was bought under music version 1');
select is((select count(*)::int from deliverables),0,'music owes no deliverable rows: it still releases on its calendar');
select is((select count(*)::int from payout_schedule where deliverable_id is not null),0,'and every existing payout row is a calendar slice');

-- ---------------------------------------------------------------
-- A theater purchase: snapshot, policy version, deliverable
-- ---------------------------------------------------------------
select lives_ok($$select begin_lot_purchase('e6000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-0000000000c1',50000,7500)$$,
  'a sponsor starts a theater purchase');
select results_eq(
  $$select policy_category, policy_version, snapshot->'policy'->>'release_rule', backfilled from purchase_snapshots s join purchases p on p.id=s.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1'$$,
  $$values ('theater', 1, 'evidence', false)$$,'it records the policy version it was bought under');
select results_eq(
  $$select snapshot->'fundraiser'->>'title', snapshot->'organizer'->>'name', snapshot->'opportunity'->'template'->>'name', (snapshot->>'amount_cents')::int, (snapshot->>'fee_cents')::int, snapshot->'fundraiser'->>'sponsor_promise'
      from purchase_snapshots s join purchases p on p.id=s.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1'$$,
  $$values ('Winter production','Second Stage','Program credit',50000,7500,'A program credit.')$$,
  'and what was bought: the fundraiser, the organizer, the opportunity, the promise, the amount and the fee');
select results_eq(
  $$select d.title, d.status, d.due_at from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1'$$,
  $$values ('Program credit','pending','2026-12-20T20:00:00Z'::timestamptz)$$,'with one deliverable, due when the fundraiser said');

-- ---------------------------------------------------------------
-- Purchased promises are immutable
-- ---------------------------------------------------------------
update runs set title='Spring production', sponsor_promise='Something smaller.' where id='e6000000-0000-4000-8000-000000000010';
update acts set name='Third Stage' where id='e6000000-0000-4000-8000-00000000000a';
update surfaces set name='Tiny credit' where key='playbill_credit';
select results_eq(
  $$select snapshot->'fundraiser'->>'title', snapshot->'organizer'->>'name', snapshot->'opportunity'->'template'->>'name', snapshot->'fundraiser'->>'sponsor_promise'
      from purchase_snapshots s join purchases p on p.id=s.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1'$$,
  $$values ('Winter production','Second Stage','Program credit','A program credit.')$$,
  'editing the fundraiser, the organizer profile and the template rewrites nothing that was bought');
select throws_ok($$update lots set price_cents=1000 where id='e6000000-0000-4000-8000-0000000000a1'$$,'23514',null,
  'and the price of a purchased opportunity cannot move at all (migration 0035)');
select throws_ok($$update purchase_snapshots set snapshot='{}'$$,'23514','purchase_snapshot_immutable','a snapshot cannot be edited, by any role');
select throws_ok($$delete from purchase_snapshots$$,'23514','purchase_snapshot_immutable','or deleted while its purchase stands');
insert into delivery_policies (category_key,version,status,release_rule) values ('theater',2,'proposed','calendar');
select is((select policy_version from purchase_snapshots s join purchases p on p.id=s.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1'),1,
  'a new policy version does not reach a purchase already made');
delete from delivery_policies where category_key='theater' and version=2;

-- ---------------------------------------------------------------
-- Paid, then evidence, in private
-- ---------------------------------------------------------------
select is((select fulfil_lot_purchase(id,'pi_delivery','ch_delivery','cs_delivery') from purchases where lot_id='e6000000-0000-4000-8000-0000000000a1'),'sold','the payment settles');
insert into evidence (id,deliverable_id,kind,url,note) select 'e6000000-0000-4000-8000-0000000000e1', d.id, 'photo','https://secondstage.example/program.jpg','Page 3 of the printed program.'
  from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1';
insert into evidence (id,deliverable_id,kind,storage_path) select 'e6000000-0000-4000-8000-0000000000e2', d.id, 'document','e6000000/program.pdf'
  from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1';
select is((select visibility from evidence where id='e6000000-0000-4000-8000-0000000000e1'),'private','evidence is private unless somebody publishes that item');

set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*)::int from runs where id='e6000000-0000-4000-8000-000000000010'),1,'the fundraiser is public');
select throws_ok($$select * from evidence$$,'42501',null,'and its evidence is not, merely for that');
select throws_ok($$select * from deliverables$$,'42501',null,'nor its deliverables');
select throws_ok($$select * from purchase_snapshots$$,'42501',null,'nor what anybody bought');
select is((select count(*)::int from public_evidence),0,'the public view of evidence is empty until an item is published');
select lives_ok($$select category_key, version, release_rule, terms from delivery_policies$$,'the terms people buy under are public');
select throws_ok($$update delivery_policies set status='active'$$,'42501',null,'and nobody switches a policy on from a browser');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e6000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from evidence),2,'the organizer reads the evidence on their own fundraiser');
select throws_ok($$insert into evidence (deliverable_id,kind,note) select id,'note','x' from deliverables limit 1$$,'42501',null,'and writes none from the browser');
select throws_ok($$update evidence set visibility='public'$$,'42501',null,'nor publishes one that way');
select throws_ok($$select * from purchase_snapshots$$,'42501',null,'the snapshot holds what was paid, so it is read on the server only');
select set_config('request.jwt.claims','{"sub":"e6000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from evidence),2,'the sponsor who bought it reads the same evidence');
select is((select count(*)::int from deliverables),1,'and the deliverable it documents');
select set_config('request.jwt.claims','{"sub":"e6000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from evidence),0,'another organizer reads none of it');
select is((select count(*)::int from deliverables),0,'and none of the deliverables');
reset role;

-- ---------------------------------------------------------------
-- Publishing is item by item
-- ---------------------------------------------------------------
update evidence set visibility='public' where id='e6000000-0000-4000-8000-0000000000e1';
update evidence set visibility='public' where id='e6000000-0000-4000-8000-0000000000e2';
set local role anon;
select set_config('request.jwt.claims','',true);
select results_eq($$select kind, url, deliverable from public_evidence$$,
  $$values ('photo','https://secondstage.example/program.jpg','Program credit')$$,
  'a published link is public, and a stored file never is, because the bucket is private');
select set_eq($$select column_name::text from information_schema.columns where table_schema='public' and table_name='public_evidence'$$,
  $$values ('run_id'::text),('lot_id'),('deliverable'),('kind'),('url'),('note'),('created_at')$$,
  'the public view carries no purchase, no sponsor, no amount and no account');
reset role;
select throws_ok($$update evidence set shows_minor=true where id='e6000000-0000-4000-8000-0000000000e1'$$,'23514',null,'an item that shows a minor cannot stay public');
update evidence set visibility='private', shows_minor=true where id='e6000000-0000-4000-8000-0000000000e1';
select throws_ok($$update evidence set visibility='public' where id='e6000000-0000-4000-8000-0000000000e1'$$,'23514',null,'and cannot be published afterwards');

-- A youth team: nothing is publishable, whatever a form says.
select lives_ok($$select begin_lot_purchase('e6000000-0000-4000-8000-0000000000b1','e6000000-0000-4000-8000-0000000000c1',80000,12000)$$,'a sponsor backs a youth team');
select throws_ok($$insert into evidence (deliverable_id,kind,url,visibility) select d.id,'photo','https://harbor.example/banner.jpg','public'
    from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000b1'$$,
  '23514','evidence_youth_private','a youth team''s evidence is never public');
select lives_ok($$insert into evidence (deliverable_id,kind,url) select d.id,'photo','https://harbor.example/banner.jpg'
    from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000b1'$$,'kept private, it is stored');

-- ---------------------------------------------------------------
-- Release: one row per deliverable, and never before the materials are accepted
-- ---------------------------------------------------------------
select lives_ok($$insert into payout_schedule (act_id,purchase_id,deliverable_id,due_on,amount_cents)
    select 'e6000000-0000-4000-8000-00000000000a', d.purchase_id, d.id, '2026-12-25', 42500
      from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1'$$,
  'documenting the deliverable lays the organizer''s share: the amount less the fifteen percent');
select throws_ok($$insert into payout_schedule (act_id,purchase_id,deliverable_id,due_on,amount_cents)
    select 'e6000000-0000-4000-8000-00000000000a', d.purchase_id, d.id, '2026-12-25', 42500
      from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='e6000000-0000-4000-8000-0000000000a1'$$,
  '23505',null,'a retry cannot lay it twice');
select throws_ok($$update payout_schedule set status='paid' where deliverable_id is not null$$,'23514',null,
  'and it cannot be paid while the sponsor''s materials are unanswered: the 0031 gate, unchanged');
update purchases set mark_text='Kettle St. Coffee', mark_status='submitted' where lot_id='e6000000-0000-4000-8000-0000000000a1';
update purchases set mark_status='approved' where lot_id='e6000000-0000-4000-8000-0000000000a1';
select lives_ok($$update payout_schedule set status='paid', paid_at=now() where deliverable_id is not null$$,
  'once a name is accepted, with no logo anywhere, it is paid');

-- ---------------------------------------------------------------
-- No policy, no purchase
-- ---------------------------------------------------------------
insert into fundraiser_categories (key,label,publish_enabled) values ('dance','Dance',true);
insert into surfaces (key,name,group_key,category_key,default_period,sort) values ('studio_wall_delivery','Studio wall','studio','dance','term',901);
insert into runs (id,act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise) values
 ('e6000000-0000-4000-8000-000000000012','e6000000-0000-4000-8000-00000000000a','Spring term','term-delivery','open','dance','Studio hire.','Families.','A wall.');
-- These spots carry no offer terms, as every spot did before migration 0060, and their fundraiser is
-- already public, so they are marked grandfathered the way 0060 marks the real ones (0061 refuses the
-- shape otherwise). The test is about what it was about, not about offer terms.
insert into lots (id,run_id,surface_key,price_cents,mode,status, terms_grandfathered) values ('e6000000-0000-4000-8000-0000000000d1','e6000000-0000-4000-8000-000000000012','studio_wall_delivery',30000,'fixed','open', true);
select throws_ok($$select begin_lot_purchase('e6000000-0000-4000-8000-0000000000d1','e6000000-0000-4000-8000-0000000000c1',30000,4500)$$,
  '23514','no_delivery_policy','a category with no delivery policy cannot be bought at all, in any mode');
insert into delivery_policies (category_key,version,release_rule) values ('dance',1,'evidence');
select lives_ok($$select begin_lot_purchase('e6000000-0000-4000-8000-0000000000d1','e6000000-0000-4000-8000-0000000000c1',30000,4500)$$,
  'a fifth category needs a policy row, and nothing else, to be bought in test mode');
select is((select status from delivery_policies where category_key='dance'),'proposed','and it arrives switched off for live money');

-- An unpaid purchase that is dropped takes its snapshot with it, which is the one delete allowed.
select lives_ok($$delete from purchases where lot_id='e6000000-0000-4000-8000-0000000000d1' and payment_status='requires_payment'$$,
  'an abandoned checkout still cleans up after itself');

select * from finish();
rollback;
