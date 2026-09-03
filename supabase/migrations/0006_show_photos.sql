-- Phase 6: one optional photo per show. Public bucket; uploads go through the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shows', 'shows', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "public read show photos" on storage.objects
  for select
  using (bucket_id = 'shows');

-- Shows list in date order on every page that reads them.
create index if not exists shows_run_date_idx on shows(run_id, played_on);
