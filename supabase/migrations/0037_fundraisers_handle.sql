-- ---------------------------------------------------------------
-- "fundraisers" and "fundraiser", reserved as handles.
--
-- The nav has said Fundraisers since the vocabulary change (docs/DECISIONS.md, decision 14), and
-- the page behind it stayed at /auctions, because addresses outlive words. That left the word
-- itself unclaimed at the root of the site: /fundraisers answered 404, and a musician could have
-- taken it as a username and owned the address the nav appears to name.
--
-- next.config.ts now redirects both words to the index. A redirect is checked before any page, so
-- from here a handle with either name would be a page nobody could ever reach. The reservation is
-- what stops one being claimed.
--
-- reserved_handles is the database's copy of RESERVED_SLUGS in src/lib/slug.ts, and
-- tests/reserved-names.test.ts keeps the two equal. "if not exists" and "on conflict do nothing",
-- as in 0022, 0024 and 0026, so this is correct whatever order they land in.
--
-- Nobody holds either name on the hosted project: it has two musicians, gutter-hymns and rosie.
-- ---------------------------------------------------------------
create table if not exists public.reserved_handles (name text primary key);
alter table public.reserved_handles enable row level security;

insert into public.reserved_handles (name) values ('fundraiser'), ('fundraisers')
on conflict (name) do nothing;
