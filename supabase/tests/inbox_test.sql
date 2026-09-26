begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
('a7777777-7777-4777-8777-777777777771','00000000-0000-0000-0000-000000000000','authenticated','authenticated','organizer-inbox@example.com','x',now(),now(),now()),
('a7777777-7777-4777-8777-777777777772','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sponsor-inbox@example.com','x',now(),now(),now()),
('a7777777-7777-4777-8777-777777777773','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stranger-inbox@example.com','x',now(),now(),now());
update acts set owner_id='a7777777-7777-4777-8777-777777777771' where slug='gutter-hymns';

select has_table('public','inbox_threads','threads exist');
select has_table('public','inbox_messages','messages exist');
select has_table('public','inbox_reports','reports exist');
select has_table('public','inbox_staff_access','staff access log exists');
select has_table('public','inbox_notification_preferences','email preference exists');

set local role anon;
select throws_ok('select * from inbox_threads', '42501', null, 'anonymous cannot read threads');
select throws_ok('select * from inbox_messages', '42501', null, 'anonymous cannot read messages');
select throws_ok('select * from inbox_notification_preferences', '42501', null, 'anonymous cannot read notification preferences');
reset role;
set local role authenticated;
select throws_ok('select * from inbox_threads', '42501', null, 'signed-in users cannot query threads directly');
select throws_ok('insert into inbox_messages(thread_id,sender_id,body) values (gen_random_uuid(),gen_random_uuid(),''bad'')', '42501', null, 'signed-in users cannot insert messages directly');
reset role;

select lives_ok($$insert into inbox_threads(id,run_id,organizer_id,sponsor_id) values
('a7777777-7777-4777-8777-777777777774','22222222-2222-2222-2222-222222222222',
 'a7777777-7777-4777-8777-777777777771','a7777777-7777-4777-8777-777777777772')$$, 'valid conversation');
select throws_ok($$insert into inbox_threads(run_id,organizer_id,sponsor_id) values
('44444444-4444-4444-4444-444444444444','a7777777-7777-4777-8777-777777777771','a7777777-7777-4777-8777-777777777772')$$,
'P0001', 'Organizer does not own this fundraiser', 'wrong organizer refused');
select lives_ok($$insert into inbox_messages(thread_id,sender_id,body) values
('a7777777-7777-4777-8777-777777777774','a7777777-7777-4777-8777-777777777772','Hello organizer')$$, 'participant can send');
select throws_ok($$insert into inbox_messages(thread_id,sender_id,body) values
('a7777777-7777-4777-8777-777777777774','a7777777-7777-4777-8777-777777777773','Hello')$$,
'P0001', 'Not a conversation participant', 'stranger cannot send');
select throws_ok($$insert into inbox_reports(thread_id,reporter_id,reason) values
('a7777777-7777-4777-8777-777777777774','a7777777-7777-4777-8777-777777777773','This is abusive')$$,
'P0001', 'Not a conversation participant', 'stranger cannot report');
select lives_ok($$insert into inbox_messages(thread_id,sender_id,body)
 select 'a7777777-7777-4777-8777-777777777774','a7777777-7777-4777-8777-777777777772', 'Follow up ' || n
 from generate_series(1,9) n$$, 'ten messages within ten minutes allowed');
select throws_ok($$insert into inbox_messages(thread_id,sender_id,body) values
 ('a7777777-7777-4777-8777-777777777774','a7777777-7777-4777-8777-777777777772','Eleventh')$$,
 'P0001', 'Message rate limit exceeded', 'eleventh message throttled');
update inbox_threads set blocked_by='a7777777-7777-4777-8777-777777777771' where id='a7777777-7777-4777-8777-777777777774';
select throws_ok($$insert into inbox_messages(thread_id,sender_id,body) values
 ('a7777777-7777-4777-8777-777777777774','a7777777-7777-4777-8777-777777777771','Blocked')$$,
 'P0001', 'Conversation is blocked', 'blocked conversation stops either sender');
select throws_ok($$update inbox_threads set sponsor_id='a7777777-7777-4777-8777-777777777773'
 where id='a7777777-7777-4777-8777-777777777774'$$,
 'P0001', 'Conversation participants and fundraiser cannot change', 'participants cannot be reassigned');
select * from finish();
rollback;
