-- A refund that is owed survives the process that owed it.
--
-- cancelRun (src/lib/refunds.ts) walked every purchase and backing on a cancelled fundraiser in an
-- in-memory loop, refunding each one as it went and collecting failures into an `errors` array.
-- The count reached the musician; nothing else outlived the request. If the process died halfway,
-- the refunds that had not run yet left no record anywhere that they were owed, and the ones that
-- had failed were never tried again. The patron's money simply stayed on Door Money's balance with
-- a cancelled fundraiser above it and nobody looking.
--
-- This is the durable record: one row per refund owed, written before Stripe is called, carrying
-- its own idempotency key. A crash now loses an attempt rather than an obligation, and the daily
-- job picks up whatever is still owed. Remediation plan, Phase 2.
--
-- Transfers already have their own outbox and did not need this one: a payout_schedule row is a
-- durable record of money owed to a musician, with a status and a stable key (`payout_{row id}`).
-- Refunds were the side with nothing.

create type financial_op_kind as enum ('refund');

-- pending    queued, never attempted
-- processing claimed by a worker, in flight
-- succeeded  done; Stripe has it and the row was written
-- retryable  failed, and worth another go after next_attempt_at
-- failed     out of attempts, or refused for a reason no retry will fix. Door Money looks.
create type financial_op_status as enum ('pending', 'processing', 'succeeded', 'retryable', 'failed');

-- The two reasons a refund is owed. Matches RefundReason in src/lib/refunds.ts, and a third one
-- takes a migration on purpose: this is the set the code branches on to write to a patron.
create type refund_reason as enum ('run_cancelled', 'mark_declined');

create table financial_operations (
  id uuid primary key default gen_random_uuid(),
  kind financial_op_kind not null,
  purchase_id uuid references purchases(id) on delete cascade,
  backing_id uuid references backings(id) on delete cascade,
  reason refund_reason not null,
  status financial_op_status not null default 'pending',

  -- The key Stripe sees, and the key that stops the same obligation being queued twice. It is the
  -- one src/lib/refunds.ts already used on the Stripe call: `refund_{row id}_{reason}`.
  idempotency_key text not null unique,

  attempts int not null default 0,
  amount_cents int,                       -- what actually went back, once it has
  last_error text,
  next_attempt_at timestamptz not null default now(),
  -- The patron is written to once, by whichever attempt succeeds. Set here so a retry that lands a
  -- week later still tells them, and so it cannot tell them twice.
  notified_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint financial_operations_one_source check ((purchase_id is not null) <> (backing_id is not null)),
  constraint financial_operations_attempts_sane check (attempts >= 0),
  -- A settled row says which way it went. Nothing is settled and still waiting for a worker.
  constraint financial_operations_settled_is_final check (
    (settled_at is null) = (status not in ('succeeded', 'failed'))
  )
);

-- The worker's query: what is owed and due, oldest first.
create index financial_operations_due_idx on financial_operations(status, next_attempt_at);
create index financial_operations_purchase_idx on financial_operations(purchase_id);
create index financial_operations_backing_idx on financial_operations(backing_id);

create or replace function public.touch_financial_operation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger financial_operations_touch
  before update on financial_operations
  for each row
  execute function public.touch_financial_operation();

-- ---------------------------------------------------------------
-- Grants, decided here rather than in a later sweep.
--
-- 0022 was a snapshot and 0029 had to catch up eight tables it never covered. This table holds
-- patron money, Stripe idempotency keys and error text, and nothing in a browser has any business
-- reading or writing a byte of it. Row level security with no policy answers PostgREST `200 []`
-- rather than refusing, so the grant is what actually closes it.
-- ---------------------------------------------------------------
alter table financial_operations enable row level security;
revoke all on public.financial_operations from anon, authenticated;
revoke execute on function public.touch_financial_operation() from public, anon, authenticated;

comment on table public.financial_operations is
  'Refunds Door Money owes, written down before Stripe is called so a crash loses an attempt rather than an obligation. One row per (payment, reason), keyed by the same idempotency key the Stripe call uses. Worked by src/lib/outbox.ts, from the daily job and inline where the obligation is created. Added in 0032.';
