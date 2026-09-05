-- ---------------------------------------------------------------
-- The new marketing route, reserved as a handle.
--
-- /placements became /how-sponsorship-works. An act's word and a patron's username both sit at the
-- root of the site, so every top-level route has to be reserved or a musician can claim a handle
-- whose page the static route then shadows.
--
-- reserved_handles is the database's copy of RESERVED_SLUGS in src/lib/slug.ts, and
-- tests/reserved-names.test.ts keeps the two equal. Created here as well as in 0022 and 0024, so
-- this migration is correct whichever order the three land in: all use "if not exists" and
-- "on conflict do nothing".
--
-- "placements" stays reserved. Nobody holds it, the route is gone, and a word Door Money used in
-- public for months is not one to hand to the first person who asks for it.
-- ---------------------------------------------------------------
create table if not exists public.reserved_handles (name text primary key);
alter table public.reserved_handles enable row level security;

insert into public.reserved_handles (name) values ('how-sponsorship-works')
on conflict (name) do nothing;
