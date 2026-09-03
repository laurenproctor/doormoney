-- Notes sent through /contact. Written only by the server through the service-role client.
-- RLS is on with no policies, so anon and authenticated clients can neither read nor insert.
create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  reason text not null check (reason in (
    'list_an_act', 'back_a_run', 'partnership', 'venue', 'press', 'payment_or_placement', 'something_else'
  )),
  name text not null,
  organization text,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  created_at timestamptz not null default now()
);

-- Newest first, for admin review.
create index contact_messages_created_at_idx on contact_messages (created_at desc);

alter table contact_messages enable row level security;
