-- The newsletter learns which account an address belongs to.
--
-- The list has only ever been a set of email addresses. That is right for the public form, where
-- somebody subscribes before they have an account and may never open one, and it stays right: an
-- address with no `profile_id` is a subscriber, in full, forever. What it could not do is answer
-- the question a signed-in person asks on their own account page, "am I on this list?", without
-- matching on a string and hoping the string is the same one.
--
-- So the row gains an owner where there is one. Nothing is moved, nothing is deleted, and no token
-- changes: an unsubscribe link printed in an email sent last year still works tomorrow.

-- ---------------------------------------------------------------
-- 1. Every address, in one case.
--
-- The unique index has always been on lower(email), so two rows could never differ by case alone,
-- but the stored text could. An exact match from the application is one less place for a lookup to
-- miss, and lowercasing cannot collide for exactly the reason the index gives. Both writers
-- (src/app/actions/newsletter.ts and src/app/actions/communications.ts) lowercase on the way in,
-- so from here the column is lowercase and stays that way.
-- ---------------------------------------------------------------
update public.newsletter set email = lower(email) where email <> lower(email);

-- ---------------------------------------------------------------
-- 2. The owner, where there is one.
--
-- `on delete set null` rather than cascade: an address that subscribed from the footer before its
-- owner had an account was an anonymous subscriber first, and losing the account should put it
-- back where it started rather than take it off a list it joined on its own. Whoever builds
-- account deletion decides whether to delete the row outright; this only says what happens by
-- default, which is nothing destructive.
-- ---------------------------------------------------------------
alter table public.newsletter
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

comment on column public.newsletter.profile_id is
  'The account this address belongs to, where one claimed it. Null is an anonymous subscriber and is a complete, valid state.';

-- One subscription per account. The address is still unique on its own (0009), so this cannot be
-- the second row for one person: it refuses a second address being tied to the same account.
create unique index if not exists newsletter_profile_idx on public.newsletter (profile_id) where profile_id is not null;

-- ---------------------------------------------------------------
-- 3. Backfill, only where it is unambiguous.
--
-- An address is claimed by an account only when exactly one profile carries it. Nothing is guessed
-- from a name, a domain or a near match, and a row already claimed is left alone, so this cannot
-- hand one person's subscription to another. An address with no account stays anonymous.
-- ---------------------------------------------------------------
update public.newsletter n
   set profile_id = p.id
  from public.profiles p
 where n.profile_id is null
   and lower(p.email) = lower(n.email)
   and (select count(*) from public.profiles p2 where lower(p2.email) = lower(n.email)) = 1;

-- ---------------------------------------------------------------
-- 4. Where future preferences go, when there are any.
--
-- Today there is one list and one switch: `unsubscribed_at`, which the weekly sender reads as
-- "null means send". This migration does not add a second topic, and no column here should be
-- read as one.
--
-- When a second kind of mail arrives, it does not belong in another nullable timestamp on this
-- table. It belongs in its own rows:
--
--   create table newsletter_topics (
--     key text primary key,                  -- 'new_fundraisers', 'sponsor_digest', ...
--     label text not null,
--     enabled boolean not null default false -- the same two-act gate the category registry uses
--   );
--   create table newsletter_subscriptions (
--     profile_id uuid references profiles(id) on delete cascade,
--     topic_key text references newsletter_topics(key),
--     unsubscribed_at timestamptz,
--     primary key (profile_id, topic_key)
--   );
--
-- `newsletter` then keeps what it is for: an address, its token, and whether it is on the one list
-- that predates accounts. The existing rows become the `new_fundraisers` topic without moving,
-- and an anonymous subscriber keeps working, because they have no profile to key a preference on
-- and the address-level switch is still theirs. Until that day, one switch is the whole truth.
-- ---------------------------------------------------------------

-- Grants unchanged: 0029 revoked this table from anon and authenticated, and it stays revoked.
-- Every read and write goes through the server with the service-role key.
