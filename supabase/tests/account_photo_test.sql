-- The account photo (migration 0042): closed to the browser, scoped to its own folder, in a private
-- bucket. Kept in its own file rather than permissions_test.sql so it does not collide with the
-- open pull requests that edit that one. Every suite rolls back its fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e4200000-0000-4000-8000-000000000001','photo-owner@example.com','{"first_name":"Dana","last_name":"Whitfield","roles":["patron"]}'),
 ('e4200000-0000-4000-8000-000000000002','photo-other@example.com','{"first_name":"Sam","last_name":"Okafor","roles":["patron"]}');

-- The service role writes the path, and only into the account's own folder.
select lives_ok($$update profiles set photo_path='e4200000-0000-4000-8000-000000000001/a.gif' where id='e4200000-0000-4000-8000-000000000001'$$,'a path in the account''s own folder saves');
select throws_ok($$update profiles set photo_path='e4200000-0000-4000-8000-000000000002/a.gif' where id='e4200000-0000-4000-8000-000000000001'$$,'23514',null,'a path in somebody else''s folder is refused');
select throws_ok($$update profiles set photo_path='https://example.com/a.gif' where id='e4200000-0000-4000-8000-000000000001'$$,'23514',null,'a URL is not a path');

-- The account's own session: the name is writable (0027), the photo path is not readable or writable.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e4200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$update profiles set first_name='Dana',last_name='Whitfield-Reyes' where id=auth.uid()$$,'the owner edits their own first and last name');
select throws_ok($$select photo_path from profiles$$,'42501',null,'photo_path is in no select grant');
select throws_ok($$update profiles set photo_path=null where id=auth.uid()$$,'42501',null,'photo_path is in no update grant');
with changed as (update profiles set first_name='Stolen' where id='e4200000-0000-4000-8000-000000000002' returning id)
select is(count(*),0::bigint,'another account''s name is out of reach') from changed;
reset role;

set local role anon;
select set_config('request.jwt.claims','',true);
select throws_ok($$select photo_path from profiles$$,'42501',null,'anon cannot read photo_path');
reset role;

-- The bucket: private, capped, GIF allowed, and no storage policy opening it.
select is((select public from storage.buckets where id='account-photos'),false,'the bucket is private');
select ok((select allowed_mime_types @> array['image/gif','image/jpeg','image/png','image/webp'] and file_size_limit = 5242880 from storage.buckets where id='account-photos'),'it takes the four kinds, GIF included, up to 5MB');
select is_empty($$select 1 from pg_policies where schemaname='storage' and tablename='objects' and (coalesce(qual,'') like '%account-photos%' or coalesce(with_check,'') like '%account-photos%')$$,'no storage policy opens the bucket');

select * from finish();
rollback;
