-- Phase 3: fixed-price checkout and the weekly payout job.

-- A purchase remembers its Checkout Session and the charge behind it. The charge id is what
-- weekly transfers point at (source_transaction), so a slice can move before the balance settles.
alter table purchases add column stripe_checkout_session_id text unique;
alter table purchases add column stripe_charge_id text;

create index purchases_status_idx on purchases(payment_status);
create index payout_purchase_idx on payout_schedule(purchase_id);
