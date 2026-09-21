-- A patron's profile can say more, and look like its owner chose it.
--
-- Four things, all on the patron's own public profile:
--   1. which categories a patron may say they support is its own switch, so hospitality can be
--      offered there without being able to publish
--   2. a tag in the patron's own words, for support that fits no category on the list
--   3. a header image, kept in the same private bucket as the profile photo
--   4. the color of light the page is lit with, from the site's own themes and nothing else
-- and the profile photo may be a GIF.
--
-- What this file deliberately does not do:
--   It does not touch publish_enabled or delivery_policies. Hospitality stays draft-only (0047):
--   saying "I support restaurants" publishes nothing and buys nothing. patron_profile_categories
--   is descriptive only, as 0043 says.
--   It does not offer the `other` category as a preference. "Other" on the profile form is a tag
--   the patron types, stored as text, and is never read as a category key.
--   It does not store a color. `theme` is one of the theme names in src/components/Theme.tsx, so a
--   profile can only be lit in a light the design system already has, with contrast already checked.
--
-- Additive. No existing row, policy, function or trigger changes. No new table, so no new Data API
-- table grants to decide; the new columns get the same column-level read 0029 and 0043 use.
begin;

-- ---------------------------------------------------------------
-- 1. Which categories a patron may say they support.
--
--    Until now the pickers read publish_enabled, which made "may be supported" and "may publish"
--    one switch. They are different questions. A new category starts off here as it does there.
-- ---------------------------------------------------------------
alter table public.fundraiser_categories add column preference_enabled boolean not null default false;
comment on column public.fundraiser_categories.preference_enabled is
  'Whether a patron may list this category on their public profile. Descriptive only: it publishes nothing and opens no payment. Separate from publish_enabled on purpose.';
update public.fundraiser_categories set preference_enabled = true where publish_enabled or key = 'hospitality';

-- anon still reads a category's key and label and nothing else (0043). Signed-in accounts already
-- read the whole registry row (0038), which is how the profile form lists these.
revoke insert, update, delete, truncate on public.fundraiser_categories from anon, authenticated;

-- ---------------------------------------------------------------
-- 2, 3 and 4. The profile's own new fields.
-- ---------------------------------------------------------------
alter table public.patron_profiles
  add column custom_tag text check (custom_tag is null or (length(custom_tag) between 1 and 40 and custom_tag !~ '[\n\r]')),
  add column header_path text check (header_path is null or length(header_path) <= 200),
  add column theme text check (theme is null or theme in ('blue','lime','magenta','amber','teal','violet','red'));
comment on column public.patron_profiles.custom_tag is
  'A kind of work the patron supports, in their own words, for what no listed category covers. Text, never a category key.';
comment on column public.patron_profiles.header_path is
  'An object path in the private patron-photos bucket. Never a public URL: the server signs one per view, for a published profile or its owner.';
comment on column public.patron_profiles.theme is
  'The light the public page is lit with: a theme name from the design system. Null is the default, blue.';

-- The patron reads their own row under their own session; writes stay with the service role (0029).
grant select (custom_tag, header_path, theme) on public.patron_profiles to authenticated;

-- ---------------------------------------------------------------
-- The profile photo may be a GIF. The header may not: the application refuses one, because a
-- moving image the width of the page is a different thing from a moving avatar.
-- ---------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'patron-photos';

-- ---------------------------------------------------------------
-- What the public may read.
--
--    Every column the view had, in the same order, with the new ones at the end, which is what
--    lets it be replaced under a running deployment (0043). security_invoker is restated because
--    a replace takes the options it is given and no others. Still no amount, no email address, no
--    Stripe id, no payment status and no account id.
-- ---------------------------------------------------------------
create or replace view public.public_patron_profiles with (security_invoker = false) as
  select
    p.username,
    pp.display_name,
    pp.bio,
    pp.location,
    pp.website,
    pp.interests,
    pp.photo_path,
    pp.patron_since,
    pp.published_at,
    pp.profile_kind,
    pp.links,
    coalesce((select array_agg(c.key order by c.key)
                from public.patron_profile_categories pc
                join public.fundraiser_categories c on c.key = pc.category_key
               where pc.profile_id = pp.profile_id), '{}'::text[]) as category_keys,
    coalesce((select array_agg(c.label order by c.key)
                from public.patron_profile_categories pc
                join public.fundraiser_categories c on c.key = pc.category_key
               where pc.profile_id = pp.profile_id), '{}'::text[]) as category_labels,
    pp.custom_tag,
    pp.header_path,
    pp.theme
  from public.patron_profiles pp
  join public.profiles p on p.id = pp.profile_id
  where pp.published and p.username is not null;

-- A view is a read path and never a write path (0030). Stated again by the file that reshapes it.
revoke insert, update, delete, truncate on public.public_patron_profiles from anon, authenticated;
grant select on public.public_patron_profiles to anon, authenticated;

-- ---------------------------------------------------------------
-- Refuse to finish if this opened anything it should not have.
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.fundraiser_categories where key in ('hospitality', 'other') and publish_enabled) then
    raise exception '0050 lets hospitality be listed as a preference and nothing more, yet a draft-only category can publish. Resolve that by hand first.';
  end if;
  if exists (select 1 from public.fundraiser_categories where key = 'other' and preference_enabled) then
    raise exception 'the other category is not a patron preference: the profile''s Other is a typed tag. Resolve that by hand first.';
  end if;
end $$;

commit;
