-- Open publication for Digital workers as a separate decision from its proposed evidence policy.
-- A proposed policy permits only Stripe test-mode purchases; live payments stay closed.
begin;

do $$
begin
  if not exists (select 1 from public.fundraiser_categories where key = 'digital_workers' and draft_enabled and not publish_enabled) then
    raise exception 'digital_workers must be draft-only before the publication decision';
  end if;
  if not exists (select 1 from public.delivery_policies where category_key = 'digital_workers'
      and version = 1 and status = 'proposed' and release_rule = 'evidence'
      and terms->>'sponsor_cancellation' = 'Not offered. A sponsor may flag a placement and Door Money looks at it.')
    or exists (select 1 from public.delivery_policies where category_key = 'digital_workers' and status = 'active') then
    raise exception 'digital_workers needs its proposed evidence policy, with no active policy';
  end if;
  if (select count(*) from public.surfaces where category_key = 'digital_workers') <> 3 then
    raise exception 'digital_workers must have its three approved placements';
  end if;
end $$;

update public.fundraiser_categories set publish_enabled = true where key in ('digital_workers');

commit;
