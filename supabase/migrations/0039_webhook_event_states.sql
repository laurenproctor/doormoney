-- A webhook event says what happened to it, and a failed one comes back.
--
-- `stripe_events` has been three columns since 0001: id, type, received_at. The row was a dedupe
-- token and nothing else, so everything that could go wrong after the insert went unrecorded:
--
--   - **Any failed insert was read as "already handled".** A unique violation is that. A database
--     timeout is not, and Stripe, having been answered 200, never sends the event again. The money
--     that event described is then known only to Stripe.
--   - **A handler returning `{ ok: false }` was logged and forgotten.** A session with no purchase
--     id, a purchase that could not be found: each was written to the console, answered 200, and
--     never retried or shown to anybody.
--   - **A crash between the insert and the work** left the event marked seen for good. The route's
--     answer was to delete the row, which destroys the record at the moment it matters most.
--
-- This is the shape migration 0032 gave refunds: a durable row with a status, an attempt count,
-- the error and a time to try again, worked by a retry worker (`src/lib/outbox.ts` is the pattern,
-- and its backoff is reused rather than restated). The payload comes too, so a failed event can be
-- replayed from what Stripe actually sent.
--
-- Remediation plan, Phase 4, first piece. No new money behavior: what this changes is whether the
-- system can say what became of an event it was given.

-- received    stored, not yet claimed by anything
-- processing  claimed by a delivery or a worker, in flight
-- processed   the handler acted and finished
-- ignored     nothing to do, on purpose: an event type this system does not act on, or one whose
--             metadata says it belongs to another integration. Recorded so that "we did nothing"
--             and "we never saw it" stop looking identical.
-- retryable   the attempt failed, and it is worth another after next_attempt_at
-- failed      out of attempts. Door Money looks at it; nothing retries it on its own.
create type stripe_event_status as enum ('received', 'processing', 'processed', 'ignored', 'retryable', 'failed');

alter table stripe_events
  add column if not exists status stripe_event_status not null default 'received',
  add column if not exists attempts int not null default 0,
  add column if not exists last_error text,
  add column if not exists next_attempt_at timestamptz not null default now(),
  -- What Stripe sent, entire, so a replay reads the event rather than asking Stripe for it again.
  -- Stripe never puts a card number in an event, so this stores none.
  add column if not exists payload jsonb,
  -- The shape that payload is in. The endpoint pins no version today, so events arrive in the
  -- account default (2014-03-13) and a fixture recorded now would be wrong the day that changes.
  -- Recording it per row means a replay can tell.
  add column if not exists api_version text,
  add column if not exists settled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table stripe_events add constraint stripe_events_attempts_sane check (attempts >= 0);

-- A settled row says which way it went. Nothing is settled and still waiting for a worker.
alter table stripe_events add constraint stripe_events_settled_is_final check (
  (settled_at is null) = (status not in ('processed', 'ignored', 'failed'))
);

-- Every row already here was answered 200 by the old route, which had no way to record anything
-- else. They are history: processed, settled when they arrived, with no payload to replay.
update stripe_events set status = 'processed', settled_at = received_at where status = 'received';

-- The worker's query: what is owed a try, oldest first.
create index stripe_events_due_idx on stripe_events(status, next_attempt_at);

create or replace function public.touch_stripe_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger stripe_events_touch
  before update on stripe_events
  for each row
  execute function public.touch_stripe_event();

-- ---------------------------------------------------------------
-- Grants. 0029 revoked this table from anon and authenticated; the new columns inherit that,
-- and it is restated here because a migration decides its own table's grants rather than trusting
-- an earlier sweep. The payload holds email addresses and amounts, so nothing in a browser reads
-- a byte of it. `supabase/tests/webhook_events_test.sql` holds the line.
-- ---------------------------------------------------------------
revoke all on public.stripe_events from anon, authenticated;
revoke execute on function public.touch_stripe_event() from public, anon, authenticated;

comment on table public.stripe_events is
  'Every webhook Stripe has delivered, with what became of it. Written before the work and settled after, so a failure is a row rather than a console line. Worked by src/lib/stripeEvents.ts from the daily job. Added in 0001, given states in 0039.';
comment on column public.stripe_events.payload is
  'The event as Stripe sent it, for replay. Shaped by api_version, which is the account default until the endpoint pins one.';
