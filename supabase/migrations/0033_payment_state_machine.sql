-- A payment moves one way, and the database is what says so.
--
-- purchases.payment_status and backings.payment_status have carried the state of everybody's money
-- since 0001 with nothing behind them but the WHERE clause of whichever query happened to write
-- next. The application is careful: fulfilment is conditional on requires_payment, the payout job
-- is conditional on held, refundRow checks before it writes. Careful is not the same as enforced,
-- and every one of those checks is one forgotten `.eq()` from being absent.
--
-- What the enum allowed and nothing refused: a refunded purchase moved back to held, a released one
-- back to requires_payment, a refund unwound to zero. None of those is reachable through the
-- application today. All of them are one bug, one migration or one hand-written UPDATE away, and
-- each would be a row that says the patron's money is somewhere it is not.
--
-- Remediation plan, Phase 2, and the last item on it. The transitions below are the ones the code
-- actually performs, read off src/lib/purchases.ts, src/lib/backings.ts, src/lib/payouts.ts,
-- src/lib/refunds.ts and the charge.refunded branch of the Stripe webhook.
--
--   requires_payment -> held                                    the charge landed
--   held             -> released                                every slice has gone to the musician
--   held             -> refunded | partially_refunded           money went back
--   released         -> refunded | partially_refunded           refunded by hand after the fact,
--                                                               out of Door Money's own pocket
--   partially_refunded -> refunded                              a second refund finished the job
--
-- Everything else is refused, including every way back. A status that does not change is always
-- allowed, so a no-op write and a duplicate webhook stay harmless.

create or replace function public.payment_status_moves_forward()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.payment_status = old.payment_status then
    return new;
  end if;

  if not (
       (old.payment_status = 'requires_payment'   and new.payment_status = 'held')
    or (old.payment_status = 'held'               and new.payment_status in ('released', 'refunded', 'partially_refunded'))
    or (old.payment_status = 'released'           and new.payment_status in ('refunded', 'partially_refunded'))
    or (old.payment_status = 'partially_refunded' and new.payment_status = 'refunded')
  ) then
    raise exception 'a % cannot move from % to %', tg_table_name, old.payment_status, new.payment_status
      using errcode = 'check_violation',
            hint = 'Money moves one way. See migration 0033 for the transitions this system performs.';
  end if;
  return new;
end;
$$;

create trigger purchases_payment_status_guard
  before update of payment_status on purchases
  for each row execute function public.payment_status_moves_forward();

create trigger backings_payment_status_guard
  before update of payment_status on backings
  for each row execute function public.payment_status_moves_forward();

-- ---------------------------------------------------------------
-- A refund never shrinks, and never exceeds what was charged.
--
-- The webhook writes Stripe's running total (charge.amount_refunded) rather than a delta, so a
-- late-arriving older event would otherwise walk the number backwards and make money look owed
-- that has already gone back. It guards on this today; now the table does.
-- ---------------------------------------------------------------
alter table purchases add constraint purchases_refund_within_charge check (refunded_cents between 0 and amount_cents);
alter table backings  add constraint backings_refund_within_charge  check (refunded_cents between 0 and amount_cents);

create or replace function public.refund_never_shrinks()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.refunded_cents < old.refunded_cents then
    raise exception 'a refund on % cannot shrink from % to %', tg_table_name, old.refunded_cents, new.refunded_cents
      using errcode = 'check_violation',
            hint = 'charge.amount_refunded is a running total. An older event arriving late is not a smaller refund.';
  end if;
  return new;
end;
$$;

create trigger purchases_refund_monotonic
  before update of refunded_cents on purchases
  for each row execute function public.refund_never_shrinks();

create trigger backings_refund_monotonic
  before update of refunded_cents on backings
  for each row execute function public.refund_never_shrinks();

-- ---------------------------------------------------------------
-- The logo is answered once.
--
-- Migration 0031 holds a sponsorship's payouts until purchases.mark_status is approved, and rests
-- on approved being the end of the road: a slice the Friday job was allowed to send must not
-- become one it should not have. decideMark only ever moves a logo out of submitted, so that was
-- true; nothing made it so.
--
--   none      -> submitted             the patron sent one
--   submitted -> submitted             the patron sent a different one before the musician answered
--   submitted -> approved | declined   the musician answered, and that is the end of it
-- ---------------------------------------------------------------
create or replace function public.mark_status_is_answered_once()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.mark_status = old.mark_status then
    return new;
  end if;

  if not (
       (old.mark_status = 'none'      and new.mark_status = 'submitted')
    or (old.mark_status = 'submitted' and new.mark_status in ('approved', 'declined'))
  ) then
    raise exception 'a logo cannot move from % to %', old.mark_status, new.mark_status
      using errcode = 'check_violation',
            hint = 'A musician answers a logo once. Migration 0031 holds the money until they do.';
  end if;
  return new;
end;
$$;

create trigger purchases_mark_status_guard
  before update of mark_status on purchases
  for each row execute function public.mark_status_is_answered_once();

-- ---------------------------------------------------------------
-- Grants. No new table and no new view, so nothing new is on the Data API. The three functions are
-- reachable only through their triggers, and their execute grants go the way 0022 sent the rest.
-- ---------------------------------------------------------------
revoke execute on function public.payment_status_moves_forward()  from public, anon, authenticated;
revoke execute on function public.refund_never_shrinks()          from public, anon, authenticated;
revoke execute on function public.mark_status_is_answered_once()  from public, anon, authenticated;

comment on function public.payment_status_moves_forward() is
  'Refuses any purchases/backings payment_status transition the system does not perform. Money moves one way: requires_payment to held to released, and out to refunded or partially_refunded. Added in 0033.';
comment on function public.mark_status_is_answered_once() is
  'Refuses any purchases.mark_status transition but none to submitted, submitted to submitted, and submitted to approved or declined. Migration 0031 holds a sponsorship''s payouts until approved and needs approved to be terminal. Added in 0033.';
