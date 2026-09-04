-- Phase 7: the sending side of the new-boards email, and the weekly digest.
-- 0016 is left free for the patron mark work, which is on its own branch.

-- When a board went out in a new-boards email, so it is never announced twice.
alter table runs add column announced_at timestamptz;
create index runs_unannounced_idx on runs(status, announced_at);

-- One row per batch of mail Door Money sends on a schedule. It is how the job knows a week has
-- passed, and it is the record of what went out.
create table mail_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                     -- 'new_boards' | 'digest'
  sent_at timestamptz not null default now(),
  recipients int not null default 0,
  failures int not null default 0,
  detail jsonb                            -- what was in it: board slugs, the week's numbers
);
create index mail_runs_kind_idx on mail_runs(kind, sent_at desc);

-- Written and read only by the server with the service-role key. No client policies on purpose.
alter table mail_runs enable row level security;
