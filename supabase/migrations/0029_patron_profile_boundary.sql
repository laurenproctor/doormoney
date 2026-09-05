-- Phase 1's boundary, extended to everything built after it, and one real hole closed.
--
-- Migration 0022 revoked the blanket Data API grants on the tables that existed then and granted
-- back an explicit column list. Everything added since (0024's patron profiles, and the tables
-- 0022 did not reach) has been defended by row level security alone. RLS held: every one of them
-- answers an anonymous caller with an empty array today, not with rows. But one layer where the
-- rest of the app has two is how the last hole got in, so this brings them all inside.
--
-- The hole, and the reason this is not only tidying: patron_profile_items decided what a patron
-- may publish with `with check (auth.uid() = profile_id)`, which says the row is theirs and says
-- nothing about the placement it points at. The server action checked properly; PostgREST goes
-- around the server action. Anyone signed in who knew a purchase id could publish somebody else's
-- sponsorship under their own name. The check below asks the question the action was asking.

-- ---------------------------------------------------------------
-- 1. Tables the browser has no business reading at all.
--
--    None of these carries a policy for anon or authenticated, so nothing reachable loses
--    anything: every one is read and written by the server with the service role. What changes is
--    that the grant is gone too, so a future policy, or a column added later, cannot open them by
--    accident. Between them they hold amounts, Stripe payment intent and transfer ids, email
--    addresses, and the map from a retired username to the account that left it behind.
-- ---------------------------------------------------------------
revoke all on public.backings              from anon, authenticated;
revoke all on public.payout_schedule       from anon, authenticated;
revoke all on public.stripe_events         from anon, authenticated;
revoke all on public.waitlist              from anon, authenticated;
revoke all on public.contact_messages      from anon, authenticated;
revoke all on public.newsletter            from anon, authenticated;
revoke all on public.username_history      from anon, authenticated;
revoke all on public.patron_profile_items  from anon, authenticated;

-- The public faces of two of those are views that run as their owner, so they are untouched:
-- run_backers (a backer's chosen name and tier, once the money is held) and lot_buyers.

-- ---------------------------------------------------------------
-- 2. purchases: one narrow read, for the one thing a musician does with it.
--
--    The only session-side read of this table is decideMark in src/app/actions/marks.ts, which
--    checks a mark is still waiting and still paid for before approving or declining it. The
--    policy from 0005 already limits that to purchases on the musician's own lots. Everything
--    else, including the mark queue on the dashboard, reads with the service role.
--
--    What comes off the Data API here: the amount, the fee, the Stripe ids, the mark URL and text,
--    the refund columns, and the flag columns.
-- ---------------------------------------------------------------
revoke all on public.purchases from anon, authenticated;
grant select (id, lot_id, mark_status, payment_status) on public.purchases to authenticated;

-- ---------------------------------------------------------------
-- 3. patron_profiles: the patron reads their own, and writes nothing.
--
--    Reading their own row under their own session is right and stays: it is how the management
--    page fills the form in, and RLS scopes it to one row. Writing is a different question. A
--    profile row carries `published`, which decides whether a page exists at all, and
--    `patron_since`, which the server works out from the first thing this account actually paid
--    for. Neither should be settable by hand, so the four server actions in
--    src/app/actions/profile.ts write with the service role, the way bids and purchases already
--    do, and the browser gets no write grant at all.
-- ---------------------------------------------------------------
revoke all on public.patron_profiles from anon, authenticated;
grant select (profile_id, display_name, bio, location, website, interests, photo_path,
              published, published_at, patron_since, created_at, updated_at)
  on public.patron_profiles to authenticated;

-- ---------------------------------------------------------------
-- 4. What a patron may publish, asked properly.
--
--    Three things have to be true, and the old check asked only the first:
--      the row belongs to this account,
--      the placement or backing was paid for by a patron row this account owns,
--      and it was not won through a bid the patron asked to keep anonymous.
--
--    The last one matters most. Anonymity on the board is a promise (decision 7), and publishing a
--    profile does not take it back (decision 11). The public view refuses an anonymous placement a
--    second time; this stops it being ticked in the first place.
--
--    Ownership runs through patrons.profile_id, the durable link, not through an email address a
--    caller could type. setActivityShown links the account's rows on the verified auth address
--    before it reads what is eligible, so the two agree.
-- ---------------------------------------------------------------
create or replace function public.owns_patron_activity(
  p_profile_id uuid,
  p_purchase_id uuid,
  p_backing_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_profile_id is null then false
    when p_purchase_id is not null then exists (
      select 1
        from purchases pu
        join patrons pa on pa.id = pu.patron_id
       where pu.id = p_purchase_id
         and pa.profile_id = p_profile_id
         and pu.payment_status in ('held', 'released', 'partially_refunded')
         and not exists (
           select 1 from bids b
            where b.lot_id = pu.lot_id and b.patron_id = pu.patron_id and b.anonymous
         )
    )
    when p_backing_id is not null then exists (
      select 1
        from backings bk
        join patrons pa on pa.id = bk.patron_id
       where bk.id = p_backing_id
         and pa.profile_id = p_profile_id
         and bk.payment_status in ('held', 'released', 'partially_refunded')
    )
    else false
  end;
$$;

revoke all on function public.owns_patron_activity(uuid, uuid, uuid) from public, anon;
-- Granted to authenticated so the policy below still holds if a write grant is ever added back.
-- Without the grant the policy would fail closed, which is safe but reads as a bug.
grant execute on function public.owns_patron_activity(uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists "own profile items" on patron_profile_items;
create policy "own profile items" on patron_profile_items
  for all
  using (auth.uid() = profile_id)
  with check (
    auth.uid() = profile_id
    and public.owns_patron_activity(profile_id, purchase_id, backing_id)
  );

comment on policy "own profile items" on patron_profile_items is
  'The row is this account''s, and so is the placement or backing it points at, and that was not won anonymously. No client holds a write grant on this table; the rule is here so it stays true if one is ever granted.';
