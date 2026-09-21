-- A draft's sponsorship options are as private as the draft.
--
-- Migration 0001 wrote "public read lots ... using (true)", and nothing since has narrowed it. A
-- fundraiser's own row has always been hidden until it is published ("public read runs" is limited
-- to open, live and closed), and so has its organizer (0041). Its options were not. Anybody holding
-- the public anon key could read every draft's lots through the Data API: which template, what
-- label, what price, how it is sold. No page draws them and the rows name no fundraiser or
-- organizer a visitor can look up, so this was a loose price list and not a leaked page. It is
-- still a price an organizer has not chosen to show anybody.
--
-- Found while adding hospitality as a draft-only category (0047), where "nobody can discover this
-- yet" has to be true of the options as well as the fundraiser. It is not a hospitality rule: it
-- was equally true of a music draft, and it is closed for every category here.
--
-- The rule: a lot is readable once its fundraiser has left draft. That is deliberately wider than
-- the runs policy (it includes cancelled), because it keeps every read that works today working:
-- the public pages read options of open, live and closed fundraisers, and a sponsor's own history
-- can still name an option on a cancelled one. The only rows that stop being readable are drafts'.
--
-- The organizer is untouched: "owner all lots" (0005, owns_run) already covers their own drafts.
-- The service role bypasses row level security, so checkout, the auction worker, the webhook and
-- the patron pages read exactly what they read before. The sanitised views (lot_buyers and the
-- rest) are security_invoker = false and do not pass through this policy at all.
--
-- Asked through a security definer function for the reason 0023 and 0041 record: a policy body
-- runs as the calling role, and anon cannot see a draft in runs, so an inline "exists" would be
-- answered through anon's own view of runs and would fail closed in ways that are hard to see.
-- The function takes an id and returns one boolean, and says nothing else about the fundraiser.
--
-- One policy is replaced. No table, column, grant or row changes.
begin;

create function public.run_has_left_draft(r uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.runs where id = r and status <> 'draft');
$$;
revoke all on function public.run_has_left_draft(uuid) from public;
grant execute on function public.run_has_left_draft(uuid) to anon, authenticated, service_role;

comment on function public.run_has_left_draft(uuid) is
  'Whether a fundraiser has ever been published. Used by the read policy on lots, so a draft''s options stay as private as the draft.';

drop policy "public read lots" on public.lots;
create policy "public read lots" on public.lots for select to anon, authenticated
  using (public.run_has_left_draft(run_id));

commit;
