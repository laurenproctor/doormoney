-- ---------------------------------------------------------------
-- The account holder gets a photo.
--
-- patron_profiles.photo_path is the photograph on a patron's PUBLIC page: it exists only once a
-- patron has made a profile, and it goes public when they publish. This one belongs to the account
-- itself, so a musician who never makes a patron profile can have one too, and it is shown to
-- nobody but the account holder. The two are kept apart on purpose: a photo uploaded on the
-- account page must never become public because a different page was published.
--
-- Numbered 0042 because 0040 and 0041 are taken by the expansion Phase 3 pull requests.
-- ---------------------------------------------------------------

-- Object path in the private account-photos bucket. Never a URL: the page signs one per view.
alter table public.profiles add column if not exists photo_path text;

-- A row can only ever point into its own folder, whoever writes it.
alter table public.profiles drop constraint if exists profiles_photo_path_own_folder;
alter table public.profiles add constraint profiles_photo_path_own_folder
  check (photo_path is null or photo_path like id::text || '/%');

-- ---------------------------------------------------------------
-- No grant is added. The grants on profiles are column lists (0022, replaced wholesale in 0027),
-- so a column not named in them is unreadable and unwritable from the browser. photo_path stays
-- out of both lists: the server writes it with the service role after checking the upload, and
-- the page reads it the same way. supabase/tests/account_photo_test.sql holds this.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- A private bucket, on the same terms as patron-photos (0024): nothing is readable without a
-- signed URL, paths are scoped to the account and carry a random name, and no storage policy is
-- added, which leaves the bucket closed to anon and authenticated alike. GIF is allowed here so a
-- photo can be animated. The size cap matches the server action body limit in next.config.ts.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-photos', 'account-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
