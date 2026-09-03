-- Who bought a sold lot, for the public board.
-- purchases stays locked (it holds Stripe ids and amounts). This view exposes only the lot and the patron's name,
-- and only once the money is held or released, so a pending checkout never shows a name.
create view lot_buyers with (security_invoker = false) as
  select p.lot_id, pa.name
  from purchases p
  join patrons pa on pa.id = p.patron_id
  where p.payment_status in ('held', 'released');

grant select on lot_buyers to anon, authenticated;
