-- An immutable, balanced financial history. Remediation Phase 4, piece 2.
--
-- docs/REMEDIATION_PLAN.md states the gate this exists to meet: for every cent Stripe reports,
-- Door Money can explain its source, current owner, state and destination. Four tables could
-- answer where a payment is *now* (purchases, backings, payout_schedule, financial_operations),
-- and each of them is updated in place, so none of them could answer how it got there. Revenue was
-- not answerable from stored facts at all: the fee was a number on a row, never an event.
--
--   ledger_accounts   the chart of accounts. A registry, like fundraiser_categories and
--                     discovery_facets: piece 3 adds disputes by inserting rows, not by altering
--                     a type. Migration 0034 is why. Postgres will not use an enum value in the
--                     transaction that adds it, so an enum here would cost a migration of its own
--                     every time the books learn a new word.
--   ledger_entries    append-only double entry. Updates and deletes are refused by trigger and
--                     not granted to anybody, including service_role.
--
-- This mirrors the money paths, it does not replace them. Phases 2 and 3 spent their whole length
-- making purchases, payout_schedule and financial_operations enforce their own invariants in
-- Postgres, and a ledger-first rewrite would undo that work to no benefit. Those tables stay
-- authoritative. The ledger records alongside them and asserts, so a disagreement becomes
-- something a person is told about rather than a silent correction. Nothing in this file changes
-- when or whether a cent moves.
--
-- ---------------------------------------------------------------------------------------------
-- The sign convention, because everything else here depends on it.
--
-- Debits are positive, credits are negative, and the entries of one event sum to zero. In the
-- usual double-entry way: an asset rising is a debit, a liability rising is a credit, revenue
-- earned is a credit, an expense incurred is a debit.
--
-- A $100 sponsorship at Door Money's 15%, from the charge to the last Friday:
--
--   charge                platform_cash        +10000   the money is on Door Money's balance
--                         organizer_liability   -8500    owed to the organizer
--                         unearned_fee          -1500    Door Money's cut, not yet earned
--
--   stripe_fee            stripe_fee             +320    Stripe takes theirs out of the balance
--                         platform_cash          -320
--
--   transfer_<slice id>   organizer_liability   +1700    one Friday, one fifth of the net
--                         platform_cash         -1700
--
--   release_<slice id>    unearned_fee           +300    the fee accrues in step with release
--                         platform_fee           -300    (the owner's decision, 2026-09-22)
--
-- Decision, settled 2026-09-22: Door Money earns its 15% as the money releases, not at the
-- charge. That is not a new rule, it is the arithmetic refundDue has always used. A refund after
-- two of five Fridays returns the patron $60, leaves the organizer $34 and leaves Door Money $6,
-- which is 15% of the $40 that was retained. Booking $15 of revenue at checkout would state an
-- amount that can wholly evaporate; this states one that cannot.
--
-- Decision, settled 2026-09-22: Door Money absorbs Stripe's processing fee, recorded as an
-- expense. No file in the repo mentioned it before this one. It comes out of Door Money's 15%,
-- and on a full refund Door Money returns its whole fee while Stripe keeps theirs, so a refunded
-- $100 sponsorship costs Door Money about $3.20 against no revenue at all. Those are cents Stripe
-- reports, so the gate requires an account for them.
--
-- held_unresolved is the money no rule will ever release: a sponsor paid, the organizer never
-- accepted their materials, so migration 0031 holds every slice, and nobody asked for a refund.
-- docs/DECISIONS.md decision 16 leaves what to *do* about it open and this does not settle it.
-- It gives the money a name that is neither side's, so the books balance and the total is
-- visible. Reclassifying into it is a balanced event like any other.
-- ---------------------------------------------------------------------------------------------
begin;

-- ---------------------------------------------------------------
-- 1. The chart of accounts.
-- ---------------------------------------------------------------
create table public.ledger_accounts (
  key text primary key,
  label text not null,
  -- Which side of the books, so a report can sum without knowing every key by name.
  kind text not null check (kind in ('asset','liability','revenue','expense')),
  description text not null
);
comment on table public.ledger_accounts is
  'The chart of accounts. A registry, not an enum: piece 3 adds disputes as rows. See the header of migration 0055 for the sign convention.';

insert into public.ledger_accounts (key, label, kind, description) values
 ('platform_cash', 'Platform balance', 'asset',
  'Money sitting on Door Money''s own Stripe balance. Separate charges and transfers: the charge lands here and transfers move the organizer''s share out. Not an escrow account.'),
 ('organizer_liability', 'Owed to organizers', 'liability',
  'The net Door Money holds on an organizer''s behalf and has not transferred yet.'),
 ('unearned_fee', 'Fee not yet earned', 'liability',
  'Door Money''s 15% before it has been earned. It accrues to platform_fee as the money releases, and is given back on a refund.'),
 ('platform_fee', 'Door Money revenue', 'revenue',
  'The fee, once earned. This is what /admin reports as revenue, replacing the sum of list prices.'),
 ('stripe_fee', 'Stripe processing fee', 'expense',
  'What Stripe takes out of the platform balance. Door Money absorbs it out of its own 15%, and keeps absorbing it when a charge is refunded.'),
 ('held_unresolved', 'Held, unresolved', 'liability',
  'Money no rule will release: materials never accepted, no refund asked for. Neither side''s. See docs/DECISIONS.md decision 16.');

alter table public.ledger_accounts enable row level security;
-- service_role is in the revoke on purpose. A Supabase project hands every new table `grant all`
-- to all three API roles by default, so granting select without revoking first adds nothing and
-- leaves update, delete and truncate standing.
revoke all on public.ledger_accounts from public, anon, authenticated, service_role;
-- Nobody writes this at runtime. A new account arrives in a migration, the way a new category does.
grant select on public.ledger_accounts to service_role;

-- ---------------------------------------------------------------
-- 2. The entries.
-- ---------------------------------------------------------------
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),

  -- Exactly one of these, the same shape payout_schedule has used since 0001.
  purchase_id uuid references public.purchases(id),
  backing_id uuid references public.backings(id),

  account_key text not null references public.ledger_accounts(key),

  -- Signed. Debits positive, credits negative. bigint because a sum over years should not have to
  -- think about the 32-bit ceiling, even though one payment never will.
  amount_cents bigint not null check (amount_cents <> 0),

  -- Single currency today, and a column rather than an assumption, because retrofitting one
  -- through a ledger that has entries in it is the expensive version of this change. The product
  -- contract says payment availability must reflect supported capabilities: today that is USD.
  currency text not null default 'USD' check (currency = 'USD'),

  -- One balanced batch of entries. Also the idempotency key: 'charge', 'stripe_fee',
  -- 'transfer_<payout_schedule id>', 'release_<payout_schedule id>', 'refund_<reason>',
  -- 'seed_opening'. The unique indexes below are what stop a retried webhook writing the books
  -- twice, and they are the reason this is a stable string rather than a timestamp.
  event_key text not null check (length(event_key) between 1 and 120),

  -- The Stripe object this entry came from, where there is one. Reconciliation (piece 4) matches
  -- on it. Null for an entry Door Money derived rather than read, such as the fee accrual.
  stripe_object_id text,

  -- Sample data, given opening entries so it balances rather than being excluded from the check.
  -- The owner's decision, 2026-09-22. Reports exclude it; the balance assertion does not.
  is_seed boolean not null default false,

  -- When the money moved, as against when the row was written. Reconciliation needs the first.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint ledger_entry_has_one_payment check ((purchase_id is not null) <> (backing_id is not null))
);
comment on table public.ledger_entries is
  'Append-only double entry. Debits positive, credits negative, every event sums to zero. Mirrors the money paths; purchases, payout_schedule and financial_operations stay authoritative.';

-- One account appears at most once per event per payment, which is what makes event_key an
-- idempotency key: a webhook delivered twice writes the same rows and the second insert is a
-- duplicate key rather than a second charge on the books.
create unique index ledger_purchase_event_idx
  on public.ledger_entries (purchase_id, event_key, account_key) where purchase_id is not null;
create unique index ledger_backing_event_idx
  on public.ledger_entries (backing_id, event_key, account_key) where backing_id is not null;

create index ledger_purchase_idx on public.ledger_entries (purchase_id) where purchase_id is not null;
create index ledger_backing_idx on public.ledger_entries (backing_id) where backing_id is not null;
create index ledger_account_idx on public.ledger_entries (account_key, occurred_at);

-- ---------------------------------------------------------------
-- 3. Append only, and meant.
--
-- The grants below withhold update and delete from every role including service_role, so the
-- application cannot rewrite history even by mistake. The trigger is the second layer, because a
-- grant is one `grant all` in a later migration away from being undone and this repo has already
-- learned that a boundary held by one layer is how the last hole got in (Phase 1, migration 0029).
-- ---------------------------------------------------------------
create or replace function public.ledger_entries_are_final() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger entries are append only: % refused on %', tg_op, tg_table_name
    using errcode = '42501';
end $$;

create trigger ledger_entries_no_rewrite
  before update or delete on public.ledger_entries
  for each row execute function public.ledger_entries_are_final();

-- ---------------------------------------------------------------
-- 4. The assertion: an event's entries sum to zero.
--
-- A deferred constraint trigger, so the check lands at commit rather than after the first insert
-- of a batch. Writing a charge's three entries in one transaction is the normal case and it is
-- unbalanced after every one of them except the last.
--
-- security definer with a pinned search_path: it reads the table it guards, and Phase 1's review
-- of definer functions is why the path is set rather than inherited.
-- ---------------------------------------------------------------
create or replace function public.ledger_event_balances() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sum bigint;
begin
  select coalesce(sum(amount_cents), 0) into v_sum
    from public.ledger_entries
   where event_key = new.event_key
     and purchase_id is not distinct from new.purchase_id
     and backing_id is not distinct from new.backing_id;

  if v_sum <> 0 then
    raise exception 'ledger event % does not balance: off by % cents', new.event_key, v_sum
      using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function public.ledger_event_balances() from public, anon, authenticated;

create constraint trigger ledger_entries_balance
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.ledger_event_balances();

alter table public.ledger_entries enable row level security;
-- service_role is in this revoke, and the first draft of this migration left it out. The default
-- grants a Supabase project hands a new table are `all` to all three API roles, so `grant select,
-- insert` on top of them withheld nothing: supabase/tests/ledger_test.sql showed service_role
-- truncating the whole ledger. The trigger in section 3 does not cover that, because TRUNCATE
-- fires no row trigger, the same reason CLAUDE.md gives for why it ignores row level security.
-- Revoking first is what actually makes this table append only.
revoke all on public.ledger_entries from public, anon, authenticated, service_role;
-- Select and insert only. No update, no delete, no truncate, for anybody. See section 3.
grant select, insert on public.ledger_entries to service_role;

-- ---------------------------------------------------------------
-- 5. Where a broken event shows up.
--
-- The trigger refuses an unbalanced event at the moment it is written, so this should always be
-- empty. It exists because "should always be empty" is the kind of claim that wants a place to be
-- checked from: /admin reads it, and piece 4's reconciliation reads it beside Stripe's own totals.
--
-- security_invoker = false so it can select past row level security, and therefore, per the rule
-- migration 0030 exists to hold, every write privilege on it is revoked and never granted back.
-- ---------------------------------------------------------------
create view public.ledger_imbalances with (security_invoker = false) as
  select purchase_id, backing_id, event_key,
         sum(amount_cents) as off_by_cents,
         min(occurred_at)  as occurred_at
    from public.ledger_entries
   group by purchase_id, backing_id, event_key
  having sum(amount_cents) <> 0;
comment on view public.ledger_imbalances is
  'Any event whose entries do not sum to zero. Always empty while the constraint trigger stands. Read by /admin and by reconciliation.';

revoke all on public.ledger_imbalances from public, anon, authenticated, service_role;
grant select on public.ledger_imbalances to service_role;

-- ---------------------------------------------------------------
-- 6. Opening entries for the sample data.
--
-- The owner's decision of 2026-09-22, option (b): sample rows get opening entries marked as seed
-- so they balance, rather than being named and excluded from the check.
--
-- A function rather than a block, because two callers need it and they run at different moments.
-- This migration calls it for the hosted project, where the sample rows already exist. seed.sql
-- calls it for a fresh stack, where migrations run against an empty database and there is nothing
-- to open until the seed has loaded. Idempotent, so calling it twice writes nothing the second
-- time and a developer re-running the seed is not a broken ledger.
--
-- A sample row is one that was never paid for through Stripe, so it carries no payment intent.
-- The three in supabase/seed.sql are held, unrefunded and have no payout slices, which is the only
-- shape this opens. Anything else without a payment intent raises, because a wrong opening balance
-- is worse than no ledger: it would be a number that looks like history. If this fires on the
-- hosted project, look at the row before changing this file.
-- ---------------------------------------------------------------
create or replace function public.open_seed_ledger() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_odd int;
  v_written int;
begin
  select count(*) into v_odd
    from public.purchases p
   where p.stripe_payment_intent_id is null
     and p.payment_status <> 'requires_payment'
     and (p.refunded_cents <> 0
          or exists (select 1 from public.payout_schedule s where s.purchase_id = p.id and s.status = 'paid'));
  if v_odd > 0 then
    raise exception 'ledger opening balances: % purchase(s) with no payment intent have refunds or paid slices; look at them before opening the ledger', v_odd;
  end if;

  select count(*) into v_odd
    from public.backings b
   where b.stripe_payment_intent_id is null
     and b.payment_status <> 'requires_payment'
     and (b.refunded_cents <> 0
          or exists (select 1 from public.payout_schedule s where s.backing_id = b.id and s.status = 'paid'));
  if v_odd > 0 then
    raise exception 'ledger opening balances: % backing(s) with no payment intent have refunds or paid slices; look at them before opening the ledger', v_odd;
  end if;

  insert into public.ledger_entries (purchase_id, account_key, amount_cents, event_key, is_seed, occurred_at)
  select p.id, a.account_key, a.amount_cents, 'seed_opening', true, p.created_at
    from public.purchases p
   cross join lateral (values
      ('platform_cash',        p.amount_cents::bigint),
      ('organizer_liability', -(p.amount_cents - p.fee_cents)::bigint),
      ('unearned_fee',        -p.fee_cents::bigint)
    ) as a(account_key, amount_cents)
   where p.stripe_payment_intent_id is null
     and p.payment_status <> 'requires_payment'
     and a.amount_cents <> 0
  on conflict (purchase_id, event_key, account_key) where purchase_id is not null do nothing;
  get diagnostics v_written = row_count;

  insert into public.ledger_entries (backing_id, account_key, amount_cents, event_key, is_seed, occurred_at)
  select b.id, a.account_key, a.amount_cents, 'seed_opening', true, b.created_at
    from public.backings b
   cross join lateral (values
      ('platform_cash',        b.amount_cents::bigint),
      ('organizer_liability', -(b.amount_cents - b.fee_cents)::bigint),
      ('unearned_fee',        -b.fee_cents::bigint)
    ) as a(account_key, amount_cents)
   where b.stripe_payment_intent_id is null
     and b.payment_status <> 'requires_payment'
     and a.amount_cents <> 0
  on conflict (backing_id, event_key, account_key) where backing_id is not null do nothing;
  get diagnostics v_odd = row_count;

  return v_written + v_odd;
end $fn$;
revoke all on function public.open_seed_ledger() from public, anon, authenticated;
grant execute on function public.open_seed_ledger() to service_role;
comment on function public.open_seed_ledger() is
  'Opening entries for sample payments that never went through Stripe. Called by migration 0055 and by supabase/seed.sql. Idempotent.';

select public.open_seed_ledger();

commit;
