-- A sponsor may challenge a worker's failure to deliver the purchased placement.
-- The flag holds unpaid releases for review; it is not a change-of-mind cancellation.
begin;

update public.delivery_policies
   set terms = jsonb_set(terms, '{sponsor_cancellation}', to_jsonb(
     'A sponsor cannot cancel because plans changed. If the worker fails to deliver the agreed placement, the sponsor may flag it. Door Money reviews the offer and evidence and refunds the unreleased share, including its fee, when it confirms non-delivery.'::text))
 where category_key = 'digital_workers' and version = 1 and status = 'proposed'
   and terms->>'sponsor_cancellation' = 'Not offered. A sponsor may flag a placement and Door Money looks at it.';

do $$
begin
  if not exists (select 1 from public.delivery_policies
      where category_key = 'digital_workers' and version = 1 and status = 'proposed'
        and terms->>'sponsor_cancellation' =
        'A sponsor cannot cancel because plans changed. If the worker fails to deliver the agreed placement, the sponsor may flag it. Door Money reviews the offer and evidence and refunds the unreleased share, including its fee, when it confirms non-delivery.')
    or exists (select 1 from public.delivery_policies where category_key = 'digital_workers' and status = 'active') then
    raise exception 'digital_workers needs the reviewed non-delivery terms before live payments';
  end if;
end $$;

-- Evidence can arrive after a sponsor raises a flag. A new slice must inherit the
-- purchase's hold, even if there were no schedule rows when the flag was raised.
-- Lock the purchase while reading it so the flag update and the insert serialize.
create function public.pause_flagged_digital_worker_release()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  open_flag boolean;
begin
  select p.flagged_at is not null and p.flag_cleared_at is null
    into open_flag
    from public.purchases p
    join public.lots l on l.id = p.lot_id
    join public.runs r on r.id = l.run_id
   where p.id = new.purchase_id and r.category_key = 'digital_workers'
   for update of p;
  if open_flag then
    if new.status = 'paid' then
      raise exception 'a flagged digital worker purchase cannot insert a paid release' using errcode = 'check_violation';
    end if;
    if new.status = 'scheduled' then
      new.status := 'paused';
      new.paused_reason := 'patron flag';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.pause_flagged_digital_worker_release() from public, anon, authenticated;
create trigger pause_flagged_digital_worker_release
  before insert on public.payout_schedule
  for each row when (new.purchase_id is not null)
  execute function public.pause_flagged_digital_worker_release();

commit;
