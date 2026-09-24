-- One Digital workers fundraiser from publish gate through two test-mode purchases, private
-- evidence and release eligibility. The second purchase remains refundable on cancellation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select is((select publish_enabled from fundraiser_categories where key='digital_workers'),true,
  'digital workers may publish after the separate category switch');
select is((select status from delivery_policies where category_key='digital_workers' and version=1),'proposed',
  'the evidence policy remains proposed for Stripe test mode');
select is((select count(*)::int from delivery_policies where category_key='digital_workers' and status='active'),0,
  'no digital workers policy accepts live money');
select results_eq($$select key from surfaces where category_key='digital_workers' order by sort$$,
  $$values ('monthly_email_signature'),('virtual_meeting_background'),('project_page_credit')$$,
  'only the three approved placements can be priced');

insert into auth.users (id,email,raw_user_meta_data) values
 ('f7000000-0000-4000-8000-000000000001','worker-publication@example.com','{"roles":["organizer"]}'),
 ('f7000000-0000-4000-8000-000000000002','sponsor-publication@example.com','{"roles":["patron"]}');
insert into acts (id,owner_id,name,slug,type,bio) values
 ('f7000000-0000-4000-8000-00000000000a','f7000000-0000-4000-8000-000000000001','Independent Studio','independent-studio-publication',null,'Making a useful digital tool.');
insert into runs (id,act_id,title,slug,status,category_key,purpose,audience_description,sponsor_promise,verification_methods,delivery_due_at) values
 ('f7000000-0000-4000-8000-000000000010','f7000000-0000-4000-8000-00000000000a','Project Atlas','atlas-publication','draft','digital_workers',
  'Development time and hosting.','Visitors to the public project page and recipients of eligible project emails.',
  'A sponsor credit on the agreed placements for one month.',array['selected_show_photos'],'2026-11-30T00:00:00Z');
insert into lots (id,run_id,surface_key,price_cents,mode,status) values
 ('f7000000-0000-4000-8000-0000000000a1','f7000000-0000-4000-8000-000000000010','project_page_credit',10000,'fixed','open');
select throws_ok($$update runs set status='open' where slug='atlas-publication'$$,'23514',null,
  'an empty offer cannot go public even when the category can publish');

update lots set offer_terms=jsonb_build_object(
  'version',1,
  'placement',jsonb_build_object('description','Labeled sponsor credit by the project introduction at https://atlas.example/project','format','text'),
  'appearances',jsonb_build_object('quantity',1),
  'delivery_window',jsonb_build_object('ends_on','2026-11-30'),
  'audience',jsonb_build_object('description','Visitors to the public project page.'),
  'production',jsonb_build_object('included',true),
  'exclusivity',jsonb_build_object('exclusive',false),
  'sponsor_materials',jsonb_build_object('type','wording'),
  'approval',jsonb_build_object('rule','approval'),
  'deliverables',jsonb_build_array(jsonb_build_object('title','Project page credit','due_on','2026-11-30','evidence_method','photo')))
 where id='f7000000-0000-4000-8000-0000000000a1';
insert into lots (id,run_id,surface_key,price_cents,mode,status,offer_terms)
select 'f7000000-0000-4000-8000-0000000000a2',run_id,'monthly_email_signature',10000,'fixed','open',
  jsonb_set(jsonb_set(offer_terms,'{placement,description}',to_jsonb('Sponsor credit in eligible project emails for November 2026.'::text)),
    '{deliverables,0,title}',to_jsonb('Monthly email signature'::text))
 from lots where id='f7000000-0000-4000-8000-0000000000a1';
select lives_ok($$update runs set status='open' where slug='atlas-publication'$$,
  'the two complete offers and fundraiser answers pass the database publish gate');
select ok((select category_locked from runs where slug='atlas-publication'),'publication freezes the category');

set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*)::int from runs where slug='atlas-publication'),1,'the public can read the fundraiser');
select is((select count(*)::int from public_offer_terms where run_id='f7000000-0000-4000-8000-000000000010'),2,
  'the public can read both offers before buying');
reset role;

insert into patrons (id,name,contact_email,profile_id) values
 ('f7000000-0000-4000-8000-0000000000c1','Atlas Partner','sponsor-publication@example.com','f7000000-0000-4000-8000-000000000002');
select lives_ok($$select begin_lot_purchase('f7000000-0000-4000-8000-0000000000a1','f7000000-0000-4000-8000-0000000000c1',10000,1500)$$,
  'the project-page spot starts a test-mode purchase');
select results_eq($$select policy_category,policy_version,snapshot->'policy'->>'release_rule' from purchase_snapshots s
  join purchases p on p.id=s.purchase_id where p.lot_id='f7000000-0000-4000-8000-0000000000a1'$$,
  $$values ('digital_workers',1,'evidence')$$,'the purchase snapshots its policy and evidence release rule');
select is((select snapshot->'policy'->'terms'->>'sponsor_cancellation' from purchase_snapshots s join purchases p on p.id=s.purchase_id
  where p.lot_id='f7000000-0000-4000-8000-0000000000a1'),
  'A sponsor cannot cancel because plans changed. If the worker fails to deliver the agreed placement, the sponsor may flag it. Door Money reviews the offer and evidence and refunds the unreleased share, including its fee, when it confirms non-delivery.',
  'the sponsor receives the reviewed failure-to-deliver term, without cancellation for convenience');
select is((select d.title from deliverables d join purchases p on p.id=d.purchase_id
  where p.lot_id='f7000000-0000-4000-8000-0000000000a1'),'Project page credit',
  'the promised page credit becomes a deliverable');
select is((select fulfil_lot_purchase(id,'pi_atlas_page','ch_atlas_page','cs_atlas_page') from purchases
  where lot_id='f7000000-0000-4000-8000-0000000000a1'),'sold','payment settles');
select is((select payment_status from purchases where lot_id='f7000000-0000-4000-8000-0000000000a1'),'held',
  'the charge is held until delivery is documented');
insert into evidence (deliverable_id,kind,url,note)
 select d.id,'photo','https://atlas.example/project','Dated capture of the labeled credit, with the public URL.'
 from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='f7000000-0000-4000-8000-0000000000a1';
select is((select e.visibility from evidence e join deliverables d on d.id=e.deliverable_id join purchases p on p.id=d.purchase_id
  where p.lot_id='f7000000-0000-4000-8000-0000000000a1'),'private','evidence starts private');
insert into payout_schedule (act_id,purchase_id,deliverable_id,due_on,amount_cents)
 select 'f7000000-0000-4000-8000-00000000000a',d.purchase_id,d.id,'2026-12-04',8500
 from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='f7000000-0000-4000-8000-0000000000a1';
select throws_ok($$update payout_schedule set status='paid' where deliverable_id in
  (select d.id from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='f7000000-0000-4000-8000-0000000000a1')$$,
  '23514',null,'evidence alone cannot pay before the sponsor materials are accepted');
update purchases set mark_text='Atlas Partner',mark_status='submitted' where lot_id='f7000000-0000-4000-8000-0000000000a1';
update purchases set mark_status='approved' where lot_id='f7000000-0000-4000-8000-0000000000a1';
select lives_ok($$update payout_schedule set status='paid',paid_at=now() where deliverable_id in
  (select d.id from deliverables d join purchases p on p.id=d.purchase_id where p.lot_id='f7000000-0000-4000-8000-0000000000a1')$$,
  'an accepted and documented deliverable may release its $85 net share');

select lives_ok($$select begin_lot_purchase('f7000000-0000-4000-8000-0000000000a2','f7000000-0000-4000-8000-0000000000c1',10000,1500)$$,
  'the email signature starts a second purchase');
select is((select fulfil_lot_purchase(id,'pi_atlas_email','ch_atlas_email','cs_atlas_email') from purchases
  where lot_id='f7000000-0000-4000-8000-0000000000a2'),'sold','its payment settles');
select is((select count(*)::int from payout_schedule s join purchases p on p.id=s.purchase_id
  where p.lot_id='f7000000-0000-4000-8000-0000000000a2'),0,
  'the undelivered email placement has released nothing and remains fully refundable');
update purchases set flagged_at=now(),flag_note='The promised email credit did not appear.'
 where lot_id='f7000000-0000-4000-8000-0000000000a2';
insert into payout_schedule (act_id,purchase_id,due_on,amount_cents)
 select 'f7000000-0000-4000-8000-00000000000a',p.id,'2026-12-04',8500
 from purchases p where p.lot_id='f7000000-0000-4000-8000-0000000000a2';
select is((select s.status::text from payout_schedule s join purchases p on p.id=s.purchase_id
  where p.lot_id='f7000000-0000-4000-8000-0000000000a2'),'paused',
  'evidence laid after a sponsor flag stays paused while Door Money reviews');
update runs set status='cancelled',cancelled_at=now() where slug='atlas-publication';
select is((select count(*)::int from purchases p join lots l on l.id=p.lot_id join runs r on r.id=l.run_id
  where r.slug='atlas-publication' and l.id='f7000000-0000-4000-8000-0000000000a2'
    and p.payment_status='held' and p.refunded_cents=0),1,
  'cancellation leaves the unpaid purchase visible to the refund sweep');

select * from finish();
rollback;
