-- Recognition approval belongs to the exact editorial and visible media context.
-- Append-only correction to the original project journal migration.
begin;

alter table public.project_updates add column context_version bigint not null default 0
  check (context_version >= 0);

create or replace function public.guard_project_update() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare owner_id uuid;
begin
  select a.owner_id into owner_id from public.runs r join public.acts a on a.id = r.act_id where r.id = new.run_id;
  if owner_id is null or owner_id <> new.author_id then raise exception 'Update author must own the fundraiser'; end if;
  if tg_op = 'UPDATE' then
    if (new.run_id, new.author_id, new.created_at) is distinct from (old.run_id, old.author_id, old.created_at)
      then raise exception 'Update ownership is immutable'; end if;
    if old.published_at is not null then
      insert into public.project_update_revisions(update_id,title,excerpt,body,published_at)
      values(old.id,old.title,old.excerpt,old.body,old.published_at);
    end if;
    -- Approval covers the proposed content, even while the entry is a draft.
    -- Unpublishing must not allow changed content to reuse a previous approval.
    if (new.title,new.excerpt,new.body) is distinct from (old.title,old.excerpt,old.body) then
      new.context_version := old.context_version + 1;
      update public.project_update_recognition set approved_at = null
        where update_id = old.id and approved_at is not null;
    end if;
    if new.published_at is not null and old.published_at is not null then
      new.published_at := old.published_at;
      if (new.title,new.excerpt,new.body) is distinct from (old.title,old.excerpt,old.body)
        then new.edited_at := now(); end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.guard_project_update() from public, anon, authenticated;
-- A media-only context-version bump must not create a text revision or alter edit timestamps.
-- Every original editorial/identity column still passes through the existing guard.
drop trigger project_update_guard on public.project_updates;
create trigger project_update_guard before insert or update of
  run_id, author_id, created_at, title, excerpt, body, published_at, edited_at, updated_at
  on public.project_updates for each row execute function public.guard_project_update();


-- Media identity remains guarded by guard_project_update_media. This separate AFTER
-- trigger handles consent only, after the attachment change has passed validation.
-- An unfinished file is not rendered; completing it is the meaningful insertion.
create function public.invalidate_project_media_recognition() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_update uuid;
  old_visible boolean := false;
  new_visible boolean := false;
  context_changed boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_visible := old.kind = 'embed' or old.uploaded_at is not null;
    target_update := old.update_id;
  end if;
  if tg_op <> 'DELETE' then
    new_visible := new.kind = 'embed' or new.uploaded_at is not null;
    target_update := new.update_id;
  end if;

  if tg_op = 'INSERT' then
    context_changed := new_visible;
  elsif tg_op = 'DELETE' then
    context_changed := old_visible;
  else
    context_changed := old_visible is distinct from new_visible
      or ((old_visible or new_visible) and
        (new.alt_text,new.caption,new.position) is distinct from
        (old.alt_text,old.caption,old.position));
  end if;

  if context_changed then
    -- Serialize with approval and text edits on the parent before locking recognition.
    update public.project_updates set context_version = context_version + 1
      where id = target_update;
    update public.project_update_recognition set approved_at = null
      where update_id = target_update and approved_at is not null;
  end if;
  return null;
end; $$;
revoke all on function public.invalidate_project_media_recognition() from public, anon, authenticated;
create trigger project_update_media_consent after insert or update or delete on public.project_update_media
  for each row execute function public.invalidate_project_media_recognition();

-- The page submits the version read together with its displayed title. Parent-first
-- locking prevents an edit from missing an uncommitted null -> approved transition.
-- Security invoker is sufficient: only service_role may execute this RPC.
create function public.approve_project_recognition(
  p_recognition_id uuid, p_sponsor_id uuid, p_expected_version bigint
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_update public.project_updates;
  request public.project_update_recognition;
begin
  select u.* into current_update from public.project_updates u
    where u.id = (select r.update_id from public.project_update_recognition r where r.id = p_recognition_id)
    for update;
  if not found or p_expected_version is null or current_update.context_version <> p_expected_version then
    return false;
  end if;
  select r.* into request from public.project_update_recognition r
    where r.id = p_recognition_id for update;
  if not found or request.sponsor_id is distinct from p_sponsor_id
    or request.update_id <> current_update.id then
    return false;
  end if;
  update public.project_update_recognition set approved_at = now(), withdrawn_at = null
    where id = request.id;
  return true;
end; $$;
revoke all on function public.approve_project_recognition(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.approve_project_recognition(uuid,uuid,bigint) to service_role;

commit;
