-- Phase 4: fan backings through the widget.

-- A backing remembers the charge behind it (weekly transfers point at it) and how much went back.
alter table backings add column stripe_charge_id text;
alter table backings add column refunded_cents int not null default 0;
alter table backings add column refunded_at timestamptz;

create index backings_status_idx on backings(payment_status);
create index payout_backing_idx on payout_schedule(backing_id);

-- Who backs a run, for the public board and the widget's count.
-- backings stays locked (it holds Stripe ids and amounts). This view exposes the name a fan asked to
-- appear under and their tier, and only once the money is held, so a form nobody finished never shows a name.
create view run_backers with (security_invoker = false) as
  select b.run_id, b.display_name, b.tier, b.amount_cents, b.created_at
  from backings b
  where b.payment_status in ('held', 'released', 'partially_refunded');

grant select on run_backers to anon, authenticated;
