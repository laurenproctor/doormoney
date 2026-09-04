-- Hotfix for 0022: the public boards went to 404 the moment it applied.
--
-- The owner policy on runs, written in 0005, asks its question inline:
--
--   using (exists (select 1 from acts a where a.id = runs.act_id and a.owner_id = auth.uid()))
--
-- An RLS policy body runs as the calling role, so evaluating that needs privileges on acts,
-- including acts.owner_id. 0022 took owner_id off the anon grant, quite rightly, and from then on
-- any anonymous read of runs failed with "permission denied for table acts", whichever policy
-- would have allowed the row. Postgres has to be able to evaluate every permissive policy on the
-- table before it can OR them together, so "public read runs" could never get a look in.
--
-- The other owner policies were never exposed to this: lots, shows and purchases all ask through
-- owns_run and owns_lot, which are security definer and so run as their owner. This does the same
-- for runs, which is what 0005 should have done.

create or replace function public.owns_act(p_act_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from acts a
     where a.id = p_act_id
       and a.owner_id = auth.uid()
  );
$$;

-- Granted and never revoked, deliberately. Revoking execute on a security definer function that an
-- RLS policy calls does not deny the query, it segfaults the backend: see the trap at the end of
-- docs/PHASE_1_DEPLOYMENT.md. The function answers only "does the caller own this", and auth.uid()
-- is null for an anonymous caller, so the answer for anon is always false.
grant execute on function public.owns_act(uuid) to anon, authenticated;

drop policy if exists "owner all runs" on public.runs;

create policy "runs owner all" on public.runs
  for all
  using (public.owns_act(runs.act_id))
  with check (public.owns_act(runs.act_id));
