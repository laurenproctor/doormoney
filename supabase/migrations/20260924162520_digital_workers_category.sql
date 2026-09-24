-- Digital workers may prepare a private fundraiser and price two placements they control.
-- Publishing and payments remain closed until a separate delivery policy and category release.
begin;

insert into public.fundraiser_categories (key, label, detail_keys, draft_enabled, publish_enabled) values
  ('digital_workers', 'Digital workers', array[]::text[], true, false)
on conflict (key) do nothing;

insert into public.surfaces (key, name, group_key, category_key, applies_to, default_price_cents, default_period, seen_by, sort) values
  ('monthly_email_signature', 'Monthly email signature', 'online', 'digital_workers', null, null, 'month', 'recipients of eligible emails the worker sends during the month', 501),
  ('virtual_meeting_background', 'Virtual meeting background', 'online', 'digital_workers', null, null, 'month', 'participants in eligible video meetings where the background is used', 502)
on conflict (key) do nothing;

revoke insert, update, delete, truncate on public.fundraiser_categories from anon, authenticated;
revoke insert, update, delete, truncate on public.surfaces from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from public.fundraiser_categories
    where key = 'digital_workers' and draft_enabled and not publish_enabled
      and detail_keys = array[]::text[]
  ) then
    raise exception 'digital_workers must be enabled for drafts only with no category-specific details';
  end if;
  if exists (select 1 from public.delivery_policies where category_key = 'digital_workers') then
    raise exception 'digital_workers already has a delivery policy; review it before opening the category';
  end if;
  if (select count(*) from public.surfaces where category_key = 'digital_workers') <> 2
    or not exists (select 1 from public.surfaces where key = 'monthly_email_signature' and category_key = 'digital_workers')
    or not exists (select 1 from public.surfaces where key = 'virtual_meeting_background' and category_key = 'digital_workers') then
    raise exception 'digital_workers must have exactly the two approved templates';
  end if;
end $$;

commit;
