# Phase 1: deployment record and token rotation

Migration `0022_security_boundary.sql` changes who can read and write what through the Supabase Data
API. This document was its deployment checklist. The migration is on the hosted project, so what
follows is now the record of how it went, with the checklist kept below as it was written.

Read `docs/SYSTEM_INVARIANTS.md` for what the migration enforces and what it does not.

## Status, 2026-09-18

- **Applied 2026-09-04.** The application changes merged first (PR #2), Vercel deployed them, then
  `0022` went onto the hosted project. The checks under "Before applying" were run read-only
  beforehand and all passed: one act per owner, every address legal and unreserved.
- **It took every public fundraiser page to 404 and the widget to 500 for about four minutes.** The
  permission tests passed and did not catch it. See "The trap the tests missed" below.
  `0023_runs_owner_policy.sql` (PR #4) fixed it forward the same evening.
- **The boundary has been extended twice since.** `0029_patron_profile_boundary.sql` brought in every
  table 0022 never covered, and `0030_views_are_read_only.sql` took write privileges off every public
  view. `supabase/tests/permissions_test.sql` holds all of it and runs in CI.
- **Funding tokens: nothing to rotate.** No lot was in `pending_funding` when 0022 landed, and a
  token only lets somebody pay for a lot in that state, so there was no live token to replace.
- **Still open: the Supabase anon and service-role keys have not been rotated.** Step 2 under "After
  applying" is the one item on this page nobody has done. The keys in Vercel predate 0022.

## Before applying

The checklist from here down is as it was written before 0022 was applied, kept because the next
boundary migration will want the same steps.

1. **Take a backup.** The migration revokes privileges and adds constraints. Rolling it back means
   restoring grants, and a backup is the honest way to be sure.
2. **Check the migration number.** This is `0022`. Migrations `0020` and `0021` live on the
   `self-service-boards` branch. Run `supabase migration list` against the project and confirm what
   the remote has actually applied. A duplicate number is recorded as applied and skipped in silence,
   which fails quietly rather than loudly.
3. **Apply the application changes first, or at the same time.** Four files stop using the anon key
   for things it can no longer do. If the migration lands without them, these break:
   - `src/lib/auth.ts` (`ownedAct` reads the Stripe columns)
   - `src/app/actions/payouts.ts` (writes the Stripe columns)
   - `src/lib/boards.ts` (reads bids and patron names)
   - `src/app/dashboard/page.tsx` (the mark queue reads patron names)
4. **Check the data passes the new constraints.** These fail the migration if existing rows violate
   them, which is the point, but better found before than during:

   ```sql
   -- More than one act on an account (acts_one_per_owner)
   select owner_id, count(*) from acts where owner_id is not null group by owner_id having count(*) > 1;

   -- A board address that is reserved, or not slug-shaped (acts_slug_shape, refuse_reserved_handle)
   select id, slug from acts
    where slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$'
       or slug in (select name from reserved_handles);

   -- A handle that is reserved
   select id, username from profiles where username in (select name from reserved_handles);
   ```

5. **Apply to a staging project first** if one exists, and load the board, the dashboard, the widget
   and the payouts page against it.

## Applying

```
supabase db push        # review the plan it prints before confirming
```

Then run the permission tests against the target:

```
npm run test:db
```

## After applying: rotate

The anon key could read Connect account ids, funding tokens and the patron roster for as long as
those grants stood. Treat everything it could reach as disclosed.

1. **Rotate the funding tokens.** They were readable by anyone with the anon key. A token is what
   lets a winning bidder pay, so a leaked one is a live risk until it is replaced.

   ```sql
   update lots set funding_token = encode(gen_random_bytes(24), 'base64')
    where funding_token is not null and status = 'pending_funding';
   ```

   Anyone mid-checkout with an old link will need a fresh one. Check `pending_funding` lots and mail
   their winners.

2. **Rotate the Supabase anon and service-role keys** in the dashboard, then update them in Vercel
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and in any local `.env.local`.
   Redeploy. Do this second: rotating keys before the migration lands only shortens the window.

3. **Connect account ids were public.** An `acct_...` id is not a credential on its own and cannot be
   used to move money without the platform's secret key, so there is nothing to rotate. Worth
   knowing it was exposed.

4. **Consider what the patron roster means for you.** Every patron name was readable, and every
   anonymous bid could be tied to a name. If Door Money has told patrons their anonymous bids are
   private, that promise was not kept by the system, and a disclosure decision belongs to you and
   counsel, not to this checklist.

## Rolling back

The migration is append-only and has no `down`. To reverse it, write a new migration that restores
the table-level grants and the `FOR ALL` policies. Do not edit `0022` once it is applied anywhere.

The pieces to restore, if it comes to that:

- `grant select, insert, update, delete on acts, lots, runs, profiles, bids to anon, authenticated`
- `create policy "own acts" on acts for all using (auth.uid() = owner_id)`
- `create policy "own profile" on profiles for all using (auth.uid() = id)`
- `grant select on patron_names to anon, authenticated`
- `drop trigger runs_status_transition on runs`, and the other three triggers
- `drop index acts_one_per_owner`

## The trap the tests missed

A column revoke can kill an unrelated policy on another table. The owner policy on `runs`, written
in migration 0005, asked its question inline: `exists (select 1 from acts a where ... a.owner_id =
auth.uid())`. A policy body runs as the calling role, so it needed select on `acts.owner_id`, which
0022 had rightly taken off `anon`. Postgres evaluates every permissive policy before OR-ing them, so
the public read policy on `runs` never got a look in, and every read of `runs` as `anon` failed.
`lots`, `shows` and `purchases` were spared because they ask through the `security definer` helpers
`owns_run` and `owns_lot`. 0023 added `owns_act` and rewrote the policy to use it.

Two rules came out of it. Before revoking a column, read every inline policy body that mentions it,
on every table. And a privilege test is not enough on its own: read a fundraiser page end to end as
`anon` before calling a grant change safe.

## A trap worth writing down

Revoking `execute` on a `security definer` function that an RLS policy calls does not deny the
query. It **segfaults the backend** (signal 11) the moment a role without that privilege triggers the
policy. Reproduced locally on Postgres 17: `select count(*) from purchases` as `anon`, with execute
revoked on `owns_lot`, terminated the server process and forced automatic recovery.

`0022` therefore grants execute on `owns_run` and `owns_lot` rather than revoking it. Both answer
only "does the caller own this", and `auth.uid()` is null for an anonymous caller, so the answer is
always false. Do not "tighten" this without reproducing the crash first.
