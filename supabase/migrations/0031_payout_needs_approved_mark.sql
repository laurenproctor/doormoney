-- A sponsorship's money does not move before the musician approves the logo.
--
-- /terms says "When an act declines, the patron pays nothing and any money held goes back in full",
-- and two emails say the same. The code did not keep that promise. The Friday job
-- (src/lib/payouts.ts) selected every scheduled payout_schedule row whose due date had passed and
-- transferred it, without once looking at purchases.mark_status. Weekly slices are laid down across
-- the fundraiser's own Fridays, so a sponsorship bought during a live fundraiser could have a slice
-- sent on Friday, be declined on Saturday, and refund only the unreleased part: refundDue can give
-- back what has not been sent and nothing more. The patron was told "in full" and got less.
--
-- The fix is in two places on purpose. The Friday job now asks (src/lib/release.ts), and this
-- migration asks again underneath it, because a query is not a boundary: anything writing to
-- payout_schedule with the service role would otherwise be one forgotten filter away from the same
-- hole. Remediation plan, Phase 2.
--
-- A backing is not covered, and that is the rule rather than an omission. A fan buys recognition
-- and there is no logo for anyone to approve (decision 3), so the calendar alone releases it
-- (decision 2, option A).
--
-- Waiting is not skipping. Nothing here changes a row's status or its due date, so a slice that
-- waits stays scheduled and overdue, and the first Friday after the yes pays every Friday that went
-- by without one. The musician is paid late, never less.

-- ---------------------------------------------------------------
-- The guard.
--
-- Invoker rather than definer: only the service role and the table owner write here, both of which
-- read past row level security, and 0030 revoked writes on this table from anon and authenticated.
-- If some later caller cannot see the purchase row, the select returns null, `is distinct from`
-- is true and the write is refused. It fails closed.
-- ---------------------------------------------------------------
create or replace function public.payout_slice_needs_approved_mark()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  logo mark_status;
begin
  select p.mark_status into logo from purchases p where p.id = new.purchase_id;
  if logo is distinct from 'approved' then
    raise exception
      'payout slice for purchase % cannot be paid: its logo is %',
      new.purchase_id, coalesce(logo::text, 'not readable')
      using errcode = 'check_violation',
            hint = 'A sponsorship pays out only after the musician approves the logo. See src/lib/release.ts.';
  end if;
  return new;
end;
$$;

revoke execute on function public.payout_slice_needs_approved_mark() from public, anon, authenticated;

-- Two triggers rather than one, so the guard fires on the transition into paid and never on a
-- later write to a row that is already paid. tg_op is not available in a WHEN clause.
--
-- Two code paths write 'paid', and both are safe under this. The Friday job asks slicePlan first.
-- The transfer.created webhook branch records a transfer the Friday job already sent, and an
-- approved logo is terminal (decideMark only moves a logo out of 'submitted'), so a slice the job
-- was allowed to send is still allowed here. A hand-made Stripe transfer carrying a forged
-- payout_id is the one thing this would refuse, and refusing it loudly is the point.
--
-- Nothing else comes near: purchases.ts and backings.ts insert slices as 'scheduled', flags.ts
-- moves them between 'scheduled' and 'paused', and refunds.ts moves them to 'skipped'.
drop trigger if exists payout_slice_mark_guard_insert on payout_schedule;
create trigger payout_slice_mark_guard_insert
  before insert on payout_schedule
  for each row
  when (new.status = 'paid' and new.purchase_id is not null)
  execute function public.payout_slice_needs_approved_mark();

drop trigger if exists payout_slice_mark_guard_update on payout_schedule;
create trigger payout_slice_mark_guard_update
  before update of status on payout_schedule
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid' and new.purchase_id is not null)
  execute function public.payout_slice_needs_approved_mark();

-- ---------------------------------------------------------------
-- Grants. No new table and no new view, so nothing new is exposed to the Data API; the function is
-- reachable only through the triggers above, and its execute grant is revoked anyway. Stated here
-- because 0022 was a snapshot and 0029 had to catch up eight tables it never covered: a migration
-- says out loud what the browser may do with what it adds, even when the answer is nothing.
-- ---------------------------------------------------------------

comment on function public.payout_slice_needs_approved_mark() is
  'Refuses to mark a sponsorship''s payout slice paid before purchases.mark_status is approved. A declined logo is promised a full refund, and refundDue can only return what has not been sent. Backings carry no logo and are not checked. Added in 0031.';
