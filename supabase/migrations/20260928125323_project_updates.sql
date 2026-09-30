-- Project journal. All writes and reads go through server-side ownership/publication checks.
-- No client Data API grant can expose drafts or media paths by accident.
begin;

insert into public.reserved_handles(name) values ('project-recognition'),('project-updates')
on conflict do nothing;

drop policy "public read runs" on public.runs;
create policy "public read runs" on public.runs for select to anon, authenticated
  using (status in ('open','live','closed','cancelled'));

create or replace function public.act_has_public_fundraiser(a uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.runs where act_id = a and status in ('open','live','closed','cancelled'));
$$;
revoke all on function public.act_has_public_fundraiser(uuid) from public;
grant execute on function public.act_has_public_fundraiser(uuid) to anon, authenticated, service_role;

create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  excerpt text not null check (char_length(btrim(excerpt)) between 1 and 360),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  published_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_updates_run_time on public.project_updates(run_id, published_at desc, id desc);
create index project_updates_author_time on public.project_updates(author_id, published_at desc, id desc);
alter table public.project_updates enable row level security;
revoke all on public.project_updates from public, anon, authenticated;
grant all on public.project_updates to service_role;

create table public.project_update_revisions (
  id bigint generated always as identity primary key,
  update_id uuid not null references public.project_updates(id) on delete restrict,
  title text not null,
  excerpt text not null,
  body text not null,
  published_at timestamptz,
  saved_at timestamptz not null default now()
);
alter table public.project_update_revisions enable row level security;
revoke all on public.project_update_revisions from public, anon, authenticated;
grant all on public.project_update_revisions to service_role;

create function public.guard_project_update() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare owner_id uuid;
begin
  select a.owner_id into owner_id from public.runs r join public.acts a on a.id = r.act_id where r.id = new.run_id;
  if owner_id is null or owner_id <> new.author_id then raise exception 'Update author must own the fundraiser'; end if;
  if tg_op = 'UPDATE' then
    if (new.run_id, new.author_id, new.created_at) is distinct from (old.run_id, old.author_id, old.created_at)
      then raise exception 'Update ownership is immutable'; end if;
    if old.published_at is not null then
      insert into public.project_update_revisions(update_id,title,excerpt,body,published_at)
      values(old.id,old.title,old.excerpt,old.body,old.published_at);
      if (new.title,new.excerpt,new.body) is distinct from (old.title,old.excerpt,old.body) then
        update public.project_update_recognition set approved_at = null
          where update_id = old.id and approved_at is not null;
      end if;
    end if;
    if new.published_at is not null and old.published_at is not null then
      new.published_at := old.published_at;
      if (new.title,new.excerpt,new.body) is distinct from (old.title,old.excerpt,old.body)
        then new.edited_at := now(); end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.guard_project_update() from public, anon, authenticated;
create trigger project_update_guard before insert or update on public.project_updates
  for each row execute function public.guard_project_update();

create table public.project_update_media (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.project_updates(id) on delete cascade,
  kind text not null check (kind in ('image','video','embed')),
  object_path text,
  provider text check (provider in ('youtube','vimeo')),
  video_id text,
  alt_text text,
  caption text check (char_length(caption) <= 500),
  uploaded_at timestamptz,
  position smallint not null check (position between 0 and 11),
  created_at timestamptz not null default now(),
  unique(update_id,position),
  check ((kind = 'embed' and object_path is null and provider is not null and video_id is not null)
    or (kind in ('image','video') and object_path is not null and provider is null and video_id is null)),
  check (kind <> 'image' or char_length(btrim(coalesce(alt_text,''))) between 1 and 300)
);
alter table public.project_update_media enable row level security;
revoke all on public.project_update_media from public, anon, authenticated;
grant all on public.project_update_media to service_role;

create function public.guard_project_update_media() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare project_id uuid; youth boolean;
begin
  if tg_op = 'UPDATE' and (new.update_id,new.kind,new.object_path,new.provider,new.video_id)
    is distinct from (old.update_id,old.kind,old.object_path,old.provider,old.video_id) then
    raise exception 'Attachment identity cannot change';
  end if;
  select u.run_id, (r.category_key = 'sports' and r.category_details->>'level' = 'youth')
    into project_id,youth from public.project_updates u join public.runs r on r.id = u.run_id
    where u.id = new.update_id;
  if youth then raise exception 'Public media is unavailable for youth projects'; end if;
  if new.object_path is not null and new.object_path not like
    project_id::text || '/' || new.update_id::text || '/%' then
    raise exception 'Attachment path must belong to its update';
  end if;
  return new;
end; $$;
revoke all on function public.guard_project_update_media() from public, anon, authenticated;
create trigger project_update_media_guard before insert or update on public.project_update_media
  for each row execute function public.guard_project_update_media();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-updates','project-updates',false,52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- Deliberately no client storage.objects policy; server issues single-path upload and short read URLs.

create table public.project_update_recognition (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.project_updates(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  sponsor_id uuid not null references public.profiles(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  logo_url text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  withdrawn_at timestamptz,
  unique(update_id,purchase_id)
);
alter table public.project_update_recognition enable row level security;
revoke all on public.project_update_recognition from public, anon, authenticated;
grant all on public.project_update_recognition to service_role;

create function public.guard_project_recognition() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare expected_sponsor uuid; update_run uuid; purchase_run uuid; patron uuid;
begin
  if tg_op = 'UPDATE' then
    if (new.update_id,new.purchase_id,new.sponsor_id,new.display_name,new.logo_url,new.requested_at)
      is distinct from (old.update_id,old.purchase_id,old.sponsor_id,old.display_name,old.logo_url,old.requested_at)
      then raise exception 'Recognition request cannot change after it is sent'; end if;
  end if;
  select run_id into update_run from public.project_updates where id = new.update_id;
  select l.run_id,p.patron_id,pa.profile_id into purchase_run,patron,expected_sponsor
    from public.purchases p join public.lots l on l.id = p.lot_id
    join public.patrons pa on pa.id = p.patron_id where p.id = new.purchase_id;
  if update_run is distinct from purchase_run or expected_sponsor is null
    or expected_sponsor is distinct from new.sponsor_id
    or exists (select 1 from public.bids where lot_id = (select lot_id from public.purchases where id = new.purchase_id)
      and patron_id = patron and anonymous) then
    raise exception 'Recognition must belong to a nonanonymous sponsor on this project';
  end if;
  return new;
end; $$;
revoke all on function public.guard_project_recognition() from public, anon, authenticated;
create trigger project_recognition_guard before insert or update on public.project_update_recognition
  for each row execute function public.guard_project_recognition();

create table public.project_update_follows (
  run_id uuid not null references public.runs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  primary key(run_id,profile_id)
);
alter table public.project_update_follows enable row level security;
revoke all on public.project_update_follows from public, anon, authenticated;
grant all on public.project_update_follows to service_role;

create table public.project_update_mail (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.project_updates(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz,
  sent_at timestamptz,
  unique(update_id,profile_id)
);
create index project_update_mail_pending on public.project_update_mail(sent_at,claimed_at);
alter table public.project_update_mail enable row level security;
revoke all on public.project_update_mail from public, anon, authenticated;
grant all on public.project_update_mail to service_role;

create view public.project_update_log with (security_invoker = true) as
  select u.id, r.act_id, r.slug as run_slug, r.title as run_title,
    'update'::text as kind, u.published_at as occurred_at, u.published_at as display_at,
    u.title, u.excerpt
  from public.project_updates u join public.runs r on r.id = u.run_id
  where u.published_at is not null and r.status in ('open','live','closed','cancelled')
  union all
  select r.id, r.act_id, r.slug as run_slug, r.title as run_title,
    'cancellation'::text as kind, coalesce(r.cancelled_at,r.created_at) as occurred_at,
    r.cancelled_at as display_at, r.title,
    'This fundraiser was canceled. Its project page remains available as a record.'::text as excerpt
  from public.runs r where r.status = 'cancelled';
revoke all on public.project_update_log from public, anon, authenticated;
grant select on public.project_update_log to service_role;

commit;
