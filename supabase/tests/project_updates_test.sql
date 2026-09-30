-- Project journal privacy, consent, history and deliberate erasure boundary.
-- Uses the same seeded music fixtures and trusted historical-purchase load as permissions_test.sql.
-- No external storage, email, or hosted database is used; every fixture is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

insert into auth.users(id,email) values
 ('e1010000-0000-4000-8000-000000000001','journal-owner@example.com'),
 ('e1010000-0000-4000-8000-000000000002','journal-sponsor@example.com'),
 ('e1010000-0000-4000-8000-000000000003','journal-stranger@example.com'),
 ('e1010000-0000-4000-8000-000000000009','canceled-owner@example.com');
update acts set owner_id='e1010000-0000-4000-8000-000000000001' where slug='gutter-hymns';
update patrons set profile_id='e1010000-0000-4000-8000-000000000002'
 where id in ('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000008');
insert into acts(id,owner_id,name,slug,type) values
 ('e1010000-0000-4000-8000-000000000004','e1010000-0000-4000-8000-000000000009','Canceled journal','canceled-journal-test',null);
insert into runs(id,act_id,category_key,slug,title,status,cancelled_at,purpose,audience_description,sponsor_promise) values
 ('e1010000-0000-4000-8000-000000000005','e1010000-0000-4000-8000-000000000004','theater','canceled-project','Canceled production','cancelled',now(),'A production','Theater audiences','A program credit'),
 ('e1010000-0000-4000-8000-000000000006','e1010000-0000-4000-8000-000000000004','theater','private-project','Private production','draft',null,null,null,null);
insert into project_updates(id,run_id,author_id,title,excerpt,body,published_at) values
 ('e1010000-0000-4000-8000-000000000010','22222222-2222-2222-2222-222222222222','e1010000-0000-4000-8000-000000000001','Published title','Published excerpt','Published body','2026-09-01T12:00:00Z'),
 ('e1010000-0000-4000-8000-000000000011','22222222-2222-2222-2222-222222222222','e1010000-0000-4000-8000-000000000001','Draft title','Draft excerpt','Private body',null),
 ('e1010000-0000-4000-8000-000000000012','e1010000-0000-4000-8000-000000000006','e1010000-0000-4000-8000-000000000009','Hidden project title','Hidden excerpt','Hidden body',now());
insert into project_update_media(id,update_id,kind,object_path,alt_text,position,uploaded_at) values
 ('e1010000-0000-4000-8000-000000000020','e1010000-0000-4000-8000-000000000011','image',
 '22222222-2222-2222-2222-222222222222/e1010000-0000-4000-8000-000000000011/private.jpg','Private rehearsal',0,now());
insert into storage.objects(bucket_id,name) values ('project-updates',
 '22222222-2222-2222-2222-222222222222/e1010000-0000-4000-8000-000000000011/private.jpg');

-- Neither public clients nor even the owner's authenticated session has a direct Data API path.
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok('select * from project_updates', '42501', null, 'anon cannot read project_updates directly');
select throws_ok('select * from project_update_revisions', '42501', null, 'anon cannot read project_update_revisions directly');
select throws_ok('select * from project_update_media', '42501', null, 'anon cannot read project_update_media directly');
select throws_ok('select * from project_update_recognition', '42501', null, 'anon cannot read project_update_recognition directly');
select throws_ok('select * from project_update_follows', '42501', null, 'anon cannot read project_update_follows directly');
select throws_ok('select * from project_update_mail', '42501', null, 'anon cannot read project_update_mail directly');
select throws_ok('select * from project_update_log', '42501', null, 'anon cannot read project_update_log directly');
select is((select count(*) from storage.objects where bucket_id='project-updates'),0::bigint,'anon cannot read journal storage paths');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('project-updates','unauthorized.jpg')$$,'42501',null,'anon cannot upload directly');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1010000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok('select * from project_updates', '42501', null, 'authenticated cannot read project_updates directly');
select throws_ok('select * from project_update_revisions', '42501', null, 'authenticated cannot read project_update_revisions directly');
select throws_ok('select * from project_update_media', '42501', null, 'authenticated cannot read project_update_media directly');
select throws_ok('select * from project_update_recognition', '42501', null, 'authenticated cannot read project_update_recognition directly');
select throws_ok('select * from project_update_follows', '42501', null, 'authenticated cannot read project_update_follows directly');
select throws_ok('select * from project_update_mail', '42501', null, 'authenticated cannot read project_update_mail directly');
select throws_ok('select * from project_update_log', '42501', null, 'authenticated cannot read project_update_log directly');
select is((select count(*) from storage.objects where bucket_id='project-updates'),0::bigint,'authenticated cannot read journal storage paths');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('project-updates','unauthorized.jpg')$$,'42501',null,'authenticated cannot upload directly');
reset role;
select ok(not (select public from storage.buckets where id='project-updates'),'journal bucket is private');
select is_empty($$select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('project_updates','project_update_revisions','project_update_media',
 'project_update_recognition','project_update_follows','project_update_mail') and not c.relrowsecurity$$,
 'every journal table enables RLS as defense in depth');
set local role authenticated;
select throws_ok($$update project_update_recognition set approved_at=now()$$,'42501',null,'a browser cannot self-approve recognition');
select throws_ok($$delete from project_updates$$,'42501',null,'a browser cannot erase journal history');
reset role;

-- Canceled-only neutral organizers remain readable even with zero published journal entries.
set local role anon;
select set_config('request.jwt.claims','{}',true);
select is((select count(*) from acts where slug='canceled-journal-test'),1::bigint,'canceled-only organizer is public');
select is((select count(*) from runs where id='e1010000-0000-4000-8000-000000000005'),1::bigint,'canceled fundraiser remains public');
select is((select count(*) from runs where id='e1010000-0000-4000-8000-000000000006'),0::bigint,'draft fundraiser remains private');
reset role;
set local role service_role;
select is((select count(*) from project_update_log where id='e1010000-0000-4000-8000-000000000010'),1::bigint,'published entry appears in server-side log');
select is((select count(*) from project_update_log where id='e1010000-0000-4000-8000-000000000011'),0::bigint,'unpublished entry is excluded from log');
select is((select count(*) from project_update_log where id='e1010000-0000-4000-8000-000000000012'),0::bigint,'published timestamp cannot expose a draft fundraiser');
select is((select count(*) from project_update_log where act_id='e1010000-0000-4000-8000-000000000004' and kind='cancellation'),1::bigint,'canceled-only profile has a factual log entry');
reset role;

select throws_ok($$insert into project_updates(run_id,author_id,title,excerpt,body) values
 ('22222222-2222-2222-2222-222222222222','e1010000-0000-4000-8000-000000000003','Bad','Bad','Bad')$$,
 'P0001','Update author must own the fundraiser','server cannot attribute an entry to a stranger');
select throws_ok($$update project_updates set created_at=created_at + interval '1 day'
 where id='e1010000-0000-4000-8000-000000000010'$$,
 'P0001','Update ownership is immutable','entry creation identity is immutable');
select throws_ok($$insert into project_update_media(update_id,kind,object_path,alt_text,position) values
 ('e1010000-0000-4000-8000-000000000010','image','someone-elses/private.jpg','Image',0)$$,
 'P0001','Attachment path must belong to its update','cross-project media path refused');
select throws_ok($$update project_update_media set object_path='different.jpg' where id='e1010000-0000-4000-8000-000000000020'$$,
 'P0001','Attachment identity cannot change','attachment cannot be swapped after upload');

-- Recognition eligibility and consent are separate from the purchase's approved mark.
insert into project_update_recognition(id,update_id,purchase_id,sponsor_id,display_name)
 select 'e1010000-0000-4000-8000-000000000030','e1010000-0000-4000-8000-000000000010',id,
 'e1010000-0000-4000-8000-000000000002','Exact proposed name'
 from purchases where lot_id='a1000000-0000-0000-0000-000000000001';
select is((select approved_at from project_update_recognition where id='e1010000-0000-4000-8000-000000000030'),null::timestamptz,
 'approved purchase mark does not implicitly approve journal recognition');
select throws_ok($$update project_update_recognition set display_name='Different name' where id='e1010000-0000-4000-8000-000000000030'$$,
 'P0001','Recognition request cannot change after it is sent','requested name is immutable');
select throws_ok($$update project_update_recognition set logo_url='https://example.com/changed.png' where id='e1010000-0000-4000-8000-000000000030'$$,
 'P0001','Recognition request cannot change after it is sent','requested logo is immutable');
select throws_ok($$insert into project_update_recognition(update_id,purchase_id,sponsor_id,display_name)
 select 'e1010000-0000-4000-8000-000000000011',id,'e1010000-0000-4000-8000-000000000003','Stranger'
 from purchases where lot_id='a1000000-0000-0000-0000-000000000001'$$,
 'P0001','Recognition must belong to a nonanonymous sponsor on this project','wrong sponsor refused');
select throws_ok($$insert into project_update_recognition(update_id,purchase_id,sponsor_id,display_name)
 select 'e1010000-0000-4000-8000-000000000012',id,'e1010000-0000-4000-8000-000000000002','Wrong project'
 from purchases where lot_id='a1000000-0000-0000-0000-000000000001'$$,
 'P0001','Recognition must belong to a nonanonymous sponsor on this project','cross-project purchase refused');
select set_config('doormoney.trusted_load','on',true);
insert into purchases(id,lot_id,patron_id,amount_cents,fee_cents,payment_status) values
 ('e1010000-0000-4000-8000-000000000031','a1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000008',36000,5400,'held');
select set_config('doormoney.trusted_load','off',true);
select throws_ok($$insert into project_update_recognition(update_id,purchase_id,sponsor_id,display_name) values
 ('e1010000-0000-4000-8000-000000000010','e1010000-0000-4000-8000-000000000031','e1010000-0000-4000-8000-000000000002','Anonymous sponsor')$$,
 'P0001','Recognition must belong to a nonanonymous sponsor on this project','anonymous bid is ineligible even with linked profile');
update project_update_recognition set approved_at=now() where id='e1010000-0000-4000-8000-000000000030';
select is((select count(*) from project_update_recognition where id='e1010000-0000-4000-8000-000000000030' and approved_at is not null and withdrawn_at is null),1::bigint,
 'explicit approval satisfies the public recognition predicate');
update project_updates set body='Changed published body',published_at=now() where id='e1010000-0000-4000-8000-000000000010';
select is((select approved_at from project_update_recognition where id='e1010000-0000-4000-8000-000000000030'),null::timestamptz,'editorial change clears prior consent');
select is((select published_at from project_updates where id='e1010000-0000-4000-8000-000000000010'),'2026-09-01T12:00:00Z'::timestamptz,'edit preserves original publication timestamp');
select ok((select edited_at is not null from project_updates where id='e1010000-0000-4000-8000-000000000010'),'editorial change records edit timestamp');
select is((select body from project_update_revisions where update_id='e1010000-0000-4000-8000-000000000010'),'Published body','prior published content is retained');
update project_update_recognition set approved_at=now(),withdrawn_at=now() where id='e1010000-0000-4000-8000-000000000030';
select is((select count(*) from project_update_recognition where id='e1010000-0000-4000-8000-000000000030' and approved_at is not null and withdrawn_at is null),0::bigint,
 'withdrawal excludes recognition even if an approval timestamp remains');
update project_updates set published_at=null where id='e1010000-0000-4000-8000-000000000010';
select is((select count(*) from project_update_log where id='e1010000-0000-4000-8000-000000000010'),0::bigint,'unpublishing removes entry from public log');
select is((select count(*) from project_update_log where id='e1010000-0000-4000-8000-000000000005' and kind='cancellation'),1::bigint,'unpublishing editorial content cannot erase cancellation');

-- This is retention, not a complete legal erasure workflow. A separately reviewed path is required.
select throws_ok($$delete from project_updates where id='e1010000-0000-4000-8000-000000000010'$$,'23503',null,'revision history prevents accidental journal deletion');
select throws_ok($$delete from auth.users where id='e1010000-0000-4000-8000-000000000001'$$,'23503',null,'ordinary account deletion cannot silently erase authored journal history');
select throws_ok($$delete from auth.users where id='e1010000-0000-4000-8000-000000000002'$$,'23503',null,'ordinary sponsor account deletion cannot silently erase recognition history');
select * from finish();
rollback;
