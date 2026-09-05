-- ---------------------------------------------------------------
-- Runs get an address of their own.
--
-- A board used to live at /board/<act>, so an act had one board and the newest open run was it.
-- Now the act's page is /<act> and each run hangs off it: /gutter-hymns/support-europe-tour. A
-- musician can carry more than one fundraiser at a time and name each one.
--
-- The column holds the bare word ("europe-tour"). "support-" belongs to the path and is added by
-- src/lib/urls.ts, so the musician names a fundraiser rather than typing a URL.
-- ---------------------------------------------------------------

alter table public.runs add column if not exists slug text;

-- Backfill from the title the way slugify() in src/lib/slug.ts does it: "&" becomes "and",
-- lowercase, every other run of non-alphanumerics becomes one hyphen, no hyphen on either end,
-- 40 characters. Trimmed again after the cut, because the cut itself can leave one hanging.
update public.runs
   set slug = nullif(
         trim(both '-' from
           left(trim(both '-' from
             regexp_replace(lower(replace(title, '&', ' and ')), '[^a-z0-9]+', '-', 'g')
           ), 40)
         ), '')
 where slug is null;

-- A title with nothing alphanumeric in it still needs an address.
update public.runs set slug = 'run-' || left(id::text, 8) where slug is null;

-- Two runs on one act can be named the same thing. The older one keeps the word.
with numbered as (
  select id, slug, row_number() over (partition by act_id, slug order by created_at, id) as n
    from public.runs
)
update public.runs r
   set slug = left(numbered.slug, 37) || '-' || numbered.n
  from numbered
 where r.id = numbered.id
   and numbered.n > 1;

alter table public.runs alter column slug set not null;

alter table public.runs add constraint runs_slug_format
  check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$');

-- One word per act, not per site: two acts may both run "fall-tour".
create unique index if not exists runs_act_slug_idx on public.runs (act_id, slug);

-- ---------------------------------------------------------------
-- The musician names the run, so the column joins the explicit insert and update grants that
-- migration 0022 wrote. Everything not named in those lists stays unwritable from the browser.
-- ---------------------------------------------------------------
grant insert (slug) on public.runs to authenticated;
grant update (slug) on public.runs to authenticated;

-- ---------------------------------------------------------------
-- A published run's address is frozen.
--
-- The word is the fundraiser's public link: it goes in emails, on a poster, in a bio. Once the run
-- is out of draft, renaming it would break every copy of that link, and runs have no history table
-- to redirect from the way a moved act handle does (migration 0024). Rename it while it is a draft.
-- ---------------------------------------------------------------
create or replace function public.freeze_published_run_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The service role settles runs and repairs them; this only constrains a signed-in musician.
  if current_setting('role', true) is distinct from 'authenticated' then
    return new;
  end if;
  if new.slug is distinct from old.slug and old.status <> 'draft' then
    raise exception 'the address of a published run cannot change, it is already a public link'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists runs_slug_frozen on public.runs;
create trigger runs_slug_frozen
  before update of slug on public.runs
  for each row execute function public.freeze_published_run_slug();
