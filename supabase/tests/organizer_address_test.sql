-- An organizer's address is claimed for the organizer alone (migration 0058). Every suite rolls
-- back its fixtures.
--
-- Decision 8 gave every account one word doing two jobs: the sign-in handle and the organizer's
-- public address. claim_username moves the pair, and that stays right while the organizer is the
-- account holder. An organization is not a credential, so 0058 adds a second door, claim_act_slug,
-- which claims a word for the organizer and never reads or writes profiles.username. Both doors
-- look in the same three places and take the same lock, so neither can hand out the other's word.
-- The last block shows that claim_username now moves only the organizer that was holding the
-- retired word, which is every organizer made before 0058 and is not one holding a word of its own.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id,email,raw_user_meta_data) values
 ('e5800000-0000-4000-8000-000000000001','ada@example.com','{"username":"ada-holt","roles":["patron"]}'),
 ('e5800000-0000-4000-8000-000000000002','ben@example.com','{"username":"ben-ford","roles":["musician"]}'),
 ('e5800000-0000-4000-8000-000000000003','cal@example.com','{"username":"cal-reyes","roles":["patron"]}');
-- Ben is an organizer made before 0058: the address is the handle.
insert into acts (id,owner_id,name,slug,type) values
 ('e5800000-0000-4000-8000-00000000000b','e5800000-0000-4000-8000-000000000002','Ben Ford','ben-ford',null);
-- Cal once signed in as a word they later gave up.
insert into username_history (profile_id,username) values
 ('e5800000-0000-4000-8000-000000000003','old-cal');

-- ---------------------------------------------------------------
-- The door is the server's, like the first one
-- ---------------------------------------------------------------
select ok(not has_function_privilege('anon','public.claim_act_slug(uuid,text,text)','execute'),
  'anon cannot call claim_act_slug');
select ok(not has_function_privilege('authenticated','public.claim_act_slug(uuid,text,text)','execute'),
  'nor can a signed-in browser: only the server claims an address');
select ok(has_function_privilege('service_role','public.claim_act_slug(uuid,text,text)','execute'),
  'the service role can');
select ok(not has_function_privilege('authenticated','public.claim_username(uuid,text)','execute'),
  'and the rewritten claim_username keeps its own grants');

-- ---------------------------------------------------------------
-- What it refuses before it looks anything up
-- ---------------------------------------------------------------
select is(public.claim_act_slug(null,'harbor-house','Harbor House'),'no_account','no account, no claim');
select is(public.claim_act_slug('e5800000-0000-4000-8000-0000000000ff','harbor-house','Harbor House'),'no_account',
  'an account the database has never seen is the same answer');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','Harbor House','Harbor House'),'invalid',
  'the word has to be a slug');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','harbor-house','H'),'invalid_name',
  'and the organizer needs a name of at least two characters');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','dashboard','Harbor House'),'reserved',
  'a reserved word is refused, the same list claim_username reads');

-- ---------------------------------------------------------------
-- The same three places as claim_username, so neither door hands out the other's word
-- ---------------------------------------------------------------
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','cal-reyes','Harbor House'),'taken',
  'another account''s handle is taken');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','ben-ford','Harbor House'),'taken',
  'another organizer''s address is taken');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','old-cal','Harbor House'),'taken',
  'a word somebody retired stays theirs');

-- ---------------------------------------------------------------
-- A new organizer, holding a word of its own
-- ---------------------------------------------------------------
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','harbor-house','  Harbor House  '),'ok',
  'Ada sets up Harbor House at its own address');
select results_eq($$select name, slug from acts where owner_id='e5800000-0000-4000-8000-000000000001'$$,
  $$values ('Harbor House','harbor-house')$$,
  'the row arrives with the word, trimmed, and nothing else filled in');
select is((select username from profiles where id='e5800000-0000-4000-8000-000000000001'),'ada-holt',
  'and the word Ada signs in with has not moved');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','harbor-house','Harbor House'),'ok',
  'saying the same word again is not a change');
select is((select count(*)::int from acts where owner_id='e5800000-0000-4000-8000-000000000001'),1,
  'so a second submit makes no second organizer');

-- ---------------------------------------------------------------
-- An organization corrects its own address, and the word it leaves behind is kept
-- ---------------------------------------------------------------
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000001','harbor-house-nyc','Harbor House'),'ok',
  'Harbor House moves to a new word');
select is((select slug from acts where owner_id='e5800000-0000-4000-8000-000000000001'),'harbor-house-nyc',
  'the organizer is at the new address');
select is((select profile_id from username_history where username='harbor-house'),
  'e5800000-0000-4000-8000-000000000001'::uuid,
  'the old word is in the history under Ada, so /harbor-house can redirect');
select is((select username from profiles where id='e5800000-0000-4000-8000-000000000001'),'ada-holt',
  'and the handle still has not moved');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000003','harbor-house','Cal''s Kitchen'),'taken',
  'nobody else is given the word Harbor House left behind, through this door');
select is(public.claim_username('e5800000-0000-4000-8000-000000000003','harbor-house'),'taken',
  'nor through the other one');
select is(public.claim_username('e5800000-0000-4000-8000-000000000003','harbor-house-nyc'),'taken',
  'and an organizer''s own word cannot become somebody''s handle');

-- ---------------------------------------------------------------
-- Decision 8's pair still belongs to claim_username
-- ---------------------------------------------------------------
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000002','ben-ford-band','Ben Ford'),'is_handle',
  'an organizer whose address is the handle is not moved through this door');
select is((select slug from acts where id='e5800000-0000-4000-8000-00000000000b'),'ben-ford',
  'and stays where it was');
-- Cal has no organizer yet and takes their own handle as its address, which is what every first
-- organizer did before 0058.
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000003','cal-reyes','Cal Reyes'),'ok',
  'a first organizer may take the account''s own word');
select is(public.claim_act_slug('e5800000-0000-4000-8000-000000000003','cals-kitchen','Cal Reyes'),'is_handle',
  'and from then on that pair moves together, or not at all here');

-- ---------------------------------------------------------------
-- claim_username moves the organizer that was holding the word, and no other
-- ---------------------------------------------------------------
update profiles set username_set_at = now() - interval '13 months'
 where id in ('e5800000-0000-4000-8000-000000000001','e5800000-0000-4000-8000-000000000002');
select is(public.claim_username('e5800000-0000-4000-8000-000000000002','ben-ford-music'),'ok',
  'Ben renames the handle after the year');
select is((select slug from acts where id='e5800000-0000-4000-8000-00000000000b'),'ben-ford-music',
  'and the organizer that was holding that word goes with it, as it always has');
select is(public.claim_username('e5800000-0000-4000-8000-000000000001','ada-h'),'ok',
  'Ada renames the handle too');
select is((select slug from acts where owner_id='e5800000-0000-4000-8000-000000000001'),'harbor-house-nyc',
  'and Harbor House, holding a word of its own, is not renamed with it');
select is((select username from profiles where id='e5800000-0000-4000-8000-000000000001'),'ada-h',
  'though the handle did move');

select * from finish();
rollback;
