# Phase 1: deployment and token rotation checklist

Migration `0022_security_boundary.sql` changes who can read and write what through the Supabase Data
API. It has been applied and tested locally only. Nothing in this document has been done to the
hosted project.

Read `docs/SYSTEM_INVARIANTS.md` for what the migration enforces and what it does not.

## Before applying

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

## A trap worth writing down

Revoking `execute` on a `security definer` function that an RLS policy calls does not deny the
query. It **segfaults the backend** (signal 11) the moment a role without that privilege triggers the
policy. Reproduced locally on Postgres 17: `select count(*) from purchases` as `anon`, with execute
revoked on `owns_lot`, terminated the server process and forced automatic recovery.

`0022` therefore grants execute on `owns_run` and `owns_lot` rather than revoking it. Both answer
only "does the caller own this", and `auth.uid()` is null for an anonymous caller, so the answer is
always false. Do not "tighten" this without reproducing the crash first.
