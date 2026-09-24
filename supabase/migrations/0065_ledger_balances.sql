-- The ledger gets its writer, and two ways to read it. Remediation Phase 4, piece 2, second half.
--
-- Migration 0055 built the books and wrote nothing in them but the sample data's opening entries.
-- The code that ships with this migration (src/lib/ledger.ts) writes them from every path that
-- moves money: the charge and Stripe's fee when a patron pays, the transfer and the fee it earns
-- on every Friday slice, and the refund whether Door Money sent it or a person did in the Stripe
-- Dashboard. This file adds what that code needs from the database, and nothing it does changes
-- when or whether a cent moves.
--
--   ledger_accounts           one more account, organizer_receivable (below).
--   ledger_balances           the books summed by account, sample data excluded. What /admin
--                             reports as revenue, replacing the sum of list prices.
--   ledger_payment_balances   the books summed by account for each payment. A person checking
--                             one sponsorship reads this; reconciliation (piece 4) reads it too.
--
-- Two rules of arithmetic, settled by the code and recorded here because the accounts depend on
-- them. They follow from 0055's decisions rather than adding to them.
--
--   The rounding cent. Door Money earns its 15% as the money releases: after any release the fee
--   earned on a payment is round(fee * released net / net). A refund gives back the unreleased net
--   and the unearned fee. refundDue rounds once on the whole amount instead, so it can differ from
--   those two figures by one cent. That cent is posted to platform_fee, earned or given up, so a
--   refunded payment's books close to zero rather than carrying a cent nobody owns.
--
--   Money refunded beyond what was held. A refund made by hand in the Dashboard can exceed the
--   unreleased part: the organizer was already paid and the patron has now been paid too. That
--   excess is money the organizer holds and Door Money has covered. Decision 18 says how it comes
--   back (withheld from later slices, or absorbed; never a reversal without a person deciding),
--   and this is the account it waits in. An asset, because it is owed to Door Money, and one
--   nobody should hope to see a balance in.
--
-- One change of key. 0055's header named a refund event 'refund_<reason>'. It is 'refund_<running
-- total refunded>' instead, the figure Stripe carries on the charge, so that Door Money's own
-- refund and the charge.refunded webhook for the same refund, which can arrive in either order,
-- name one event and the second writer finds it already on the books.
begin;

insert into public.ledger_accounts (key, label, kind, description) values
 ('organizer_receivable', 'Owed by organizers', 'asset',
  'Money transferred to an organizer and then refunded to the patron by hand. Door Money has covered it; decision 18 says it is withheld from later slices or absorbed, never reversed without a person deciding.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- The books by account. Sample data is excluded here and nowhere else: the balance assertion in
-- 0055 counts it, because the seed's opening entries are what make the books describe the rows.
-- A report is a different question, and a sample sponsorship is not revenue.
-- ---------------------------------------------------------------
create view public.ledger_balances with (security_invoker = false) as
  select a.key  as account_key,
         a.label,
         a.kind,
         coalesce(sum(e.amount_cents) filter (where not e.is_seed), 0)::bigint as balance_cents,
         count(e.id) filter (where not e.is_seed) as entry_count
    from public.ledger_accounts a
    left join public.ledger_entries e on e.account_key = a.key
   group by a.key, a.label, a.kind;
comment on view public.ledger_balances is
  'The ledger summed by account, sample data excluded. Debits positive, credits negative: revenue and liabilities read as negative numbers here. Read by /admin.';

-- ---------------------------------------------------------------
-- The books by payment. Every account a payment has touched, with its balance. A payment that is
-- charged, fully released and settled has a zero in every account; anything else says where it
-- stands, and a liability that never reaches zero on a refunded payment is a transfer the ledger
-- never heard about.
-- ---------------------------------------------------------------
create view public.ledger_payment_balances with (security_invoker = false) as
  select purchase_id,
         backing_id,
         account_key,
         sum(amount_cents)::bigint as balance_cents,
         count(*)                  as entry_count,
         bool_or(is_seed)          as is_seed,
         max(occurred_at)          as last_at
    from public.ledger_entries
   group by purchase_id, backing_id, account_key;
comment on view public.ledger_payment_balances is
  'The ledger summed by account for each payment. Read by a person checking one payment, and by reconciliation.';

-- Both views select past row level security, so, per the rule migration 0030 holds, every write
-- privilege is revoked and never granted back. Neither is updatable by shape (both aggregate),
-- and the grants say so as well because a shape is one rewrite away from changing.
revoke all on public.ledger_balances from public, anon, authenticated, service_role;
revoke all on public.ledger_payment_balances from public, anon, authenticated, service_role;
grant select on public.ledger_balances to service_role;
grant select on public.ledger_payment_balances to service_role;

commit;
