-- The new-boards email: one short note the week a musician opens a board.
-- Separate from the waitlist, which is the one-time launch list. This one runs for as long as the site does.

create table newsletter (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,                                        -- which page the address came from (home, auctions, footer:/placements ...)
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz                         -- set when they opt out; the row stays so a re-signup is a clean flip back
);
create unique index newsletter_email_idx on newsletter(lower(email));
create unique index newsletter_unsubscribe_token_idx on newsletter(unsubscribe_token);

-- Written and read only by the server with the service-role key. No client policies on purpose.
alter table newsletter enable row level security;
