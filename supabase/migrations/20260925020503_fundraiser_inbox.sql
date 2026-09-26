-- A private conversation belongs to one fundraiser and two verified account identities.
-- The service role performs authenticated server actions; the Data API exposes no table access.
insert into public.reserved_handles (name) values ('inbox') on conflict do nothing;

create table public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id),
  organizer_id uuid not null references public.profiles(id),
  sponsor_id uuid not null references public.profiles(id),
  blocked_by uuid references public.profiles(id),
  organizer_read_at timestamptz not null default now(),
  sponsor_read_at timestamptz not null default now(),
  organizer_archived_at timestamptz,
  sponsor_archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, sponsor_id),
  check (organizer_id <> sponsor_id),
  check (blocked_by is null or blocked_by in (organizer_id, sponsor_id))
);
create index inbox_threads_organizer on public.inbox_threads(organizer_id, created_at desc);
create index inbox_threads_sponsor on public.inbox_threads(sponsor_id, created_at desc);

create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id),
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index inbox_messages_thread_time on public.inbox_messages(thread_id, created_at desc);
create index inbox_messages_sender_time on public.inbox_messages(sender_id, created_at desc);

create table public.inbox_reports (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id),
  reporter_id uuid not null references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  unique (thread_id, reporter_id)
);

create table public.inbox_staff_access (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads(id),
  staff_id uuid not null references public.profiles(id),
  accessed_at timestamptz not null default now(),
  reason text not null check (char_length(btrim(reason)) >= 10)
);

create table public.inbox_notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Even service-role inserts must respect the participant and rate limits. Locking the thread
-- serializes simultaneous sends and prevents two tabs bypassing the rolling window.
create function public.inbox_validate_thread() returns trigger language plpgsql as $$
declare actual_owner uuid;
begin
  if tg_op = 'UPDATE' then
    if (new.run_id, new.organizer_id, new.sponsor_id) is distinct from
       (old.run_id, old.organizer_id, old.sponsor_id) then
      raise exception 'Conversation participants and fundraiser cannot change';
    end if;
    return new;
  end if;
  select a.owner_id into actual_owner from public.runs r join public.acts a on a.id = r.act_id where r.id = new.run_id;
  if actual_owner is null or actual_owner <> new.organizer_id then
    raise exception 'Organizer does not own this fundraiser';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.inbox_threads
    where sponsor_id = new.sponsor_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Conversation rate limit exceeded';
  end if;
  return new;
end; $$;
create trigger inbox_thread_owner before insert or update of run_id, organizer_id, sponsor_id on public.inbox_threads
  for each row execute function public.inbox_validate_thread();

create function public.inbox_validate_message() returns trigger language plpgsql as $$
declare thread_row public.inbox_threads%rowtype;
begin
  select * into thread_row from public.inbox_threads where id = new.thread_id for update;
  if not found or new.sender_id not in (thread_row.organizer_id, thread_row.sponsor_id) then
    raise exception 'Not a conversation participant';
  end if;
  if thread_row.blocked_by is not null then raise exception 'Conversation is blocked'; end if;
  if (select count(*) from public.inbox_messages
      where sender_id = new.sender_id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Message rate limit exceeded';
  end if;
  update public.inbox_threads set
    organizer_archived_at = null, sponsor_archived_at = null
    where id = new.thread_id;
  return new;
end; $$;
create trigger inbox_message_guard before insert on public.inbox_messages
  for each row execute function public.inbox_validate_message();

create function public.inbox_validate_report() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.inbox_threads where id = new.thread_id
    and new.reporter_id in (organizer_id, sponsor_id)) then
    raise exception 'Not a conversation participant';
  end if;
  return new;
end; $$;
create trigger inbox_report_guard before insert on public.inbox_reports
  for each row execute function public.inbox_validate_report();

alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.inbox_reports enable row level security;
alter table public.inbox_staff_access enable row level security;
alter table public.inbox_notification_preferences enable row level security;
revoke all on public.inbox_threads, public.inbox_messages, public.inbox_reports, public.inbox_staff_access, public.inbox_notification_preferences from public, anon, authenticated;
revoke all on function public.inbox_validate_thread(), public.inbox_validate_message(), public.inbox_validate_report() from public, anon, authenticated;
