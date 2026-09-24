-- Before any Digital workers purchase, make the sponsor cancellation sentence match the
-- implemented path. Door Money currently offers a flag, not a self-service cancellation.
begin;

update public.delivery_policies
   set terms = jsonb_set(terms, '{sponsor_cancellation}',
     to_jsonb('Not offered. A sponsor may flag a placement and Door Money looks at it.'::text))
 where category_key = 'digital_workers' and version = 1 and status = 'proposed';

do $$
begin
  if not exists (select 1 from public.delivery_policies
      where category_key = 'digital_workers' and version = 1 and status = 'proposed'
        and terms->>'sponsor_cancellation' = 'Not offered. A sponsor may flag a placement and Door Money looks at it.')
    or exists (select 1 from public.purchase_snapshots where policy_category = 'digital_workers') then
    raise exception 'digital_workers terms must be corrected before any purchase';
  end if;
end $$;

commit;
