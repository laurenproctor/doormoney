-- Patrons may name Digital workers as a category they support. This preference is descriptive:
-- it does not let the category publish, take payment, or change a draft's visibility.
begin;

update public.fundraiser_categories
   set preference_enabled = true
 where key = 'digital_workers';

do $$
begin
  if not exists (
    select 1 from public.fundraiser_categories
     where key = 'digital_workers' and draft_enabled and preference_enabled and not publish_enabled
  ) then
    raise exception 'digital_workers must remain draft-only while its patron preference is enabled';
  end if;
  if exists (select 1 from public.delivery_policies where category_key = 'digital_workers') then
    raise exception 'digital_workers must not have a delivery policy in the preference migration';
  end if;
end $$;

commit;
