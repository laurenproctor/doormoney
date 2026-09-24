-- A worker may sell a credit on a public project page they control. This is a draft template,
-- with no price, reach estimate or publication switch.
begin;

insert into public.surfaces (key, name, group_key, category_key, applies_to, default_price_cents, default_period, seen_by, sort) values
  ('project_page_credit', 'Project page credit', 'online', 'digital_workers', null, null, 'month', 'visitors to the worker-controlled public project page during the agreed month', 503);

do $$
begin
  if not exists (select 1 from public.fundraiser_categories where key = 'digital_workers' and draft_enabled and not publish_enabled) then
    raise exception 'digital_workers must remain draft-only when the project page template is added';
  end if;
  if (select count(*) from public.surfaces where category_key = 'digital_workers') <> 3
    or not exists (select 1 from public.surfaces where key = 'project_page_credit' and category_key = 'digital_workers'
      and default_price_cents is null and applies_to is null and default_period = 'month') then
    raise exception 'digital_workers must have three controlled placement templates';
  end if;
end $$;

commit;
