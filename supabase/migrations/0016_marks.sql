-- Phase 3, the last step of the loop: the patron sends the mark, the act says yes or no.
-- The act's side already exists (mark_status, mark_url, mark_text on purchases). This adds
-- what the patron's side needs.
--
-- Written to be safe to run twice: it was applied to the development database directly, ahead of
-- the branch it lives on, so `db push` will meet it again once the branches meet.

-- A line from the patron to the act: "the white version on anything dark", "no tagline, please".
alter table purchases add column if not exists mark_note text;

-- When the mark arrived, so the act can see how long it has been waiting. The purchase's own
-- created_at is the day it sold, which can be weeks earlier.
alter table purchases add column if not exists mark_submitted_at timestamptz;

-- Marks waiting on a yes, across every board, in the order they arrived.
create index if not exists purchases_mark_waiting_idx on purchases(mark_status, mark_submitted_at);

-- The mark files. Public bucket, like acts and shows: uploads go through the service role, so no
-- storage write policy is opened up. No SVG on purpose, since these are served from a shared
-- Supabase domain and an SVG can carry script.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marks', 'marks', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "public read marks" on storage.objects;
create policy "public read marks" on storage.objects
  for select
  using (bucket_id = 'marks');
