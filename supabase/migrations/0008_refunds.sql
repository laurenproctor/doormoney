-- Phase 3: refunds and the end-of-run record.

-- How much of a purchase went back to the patron, so a partial refund is a number rather than a status.
alter table purchases add column refunded_cents int not null default 0;
alter table purchases add column refunded_at timestamptz;

-- When a run closed, for the record and the closing emails.
alter table runs add column closed_at timestamptz;
alter table runs add column cancelled_at timestamptz;

-- A refunded purchase stays on file, but its lot can be sold again. So the "one purchase per lot" rule
-- only counts purchases that are pending, held or released.
alter table purchases drop constraint purchases_lot_id_key;
create unique index purchases_live_lot_idx on purchases(lot_id) where payment_status in ('requires_payment', 'held', 'released');
