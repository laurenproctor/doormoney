-- What a sold spot actually sold for. Without it the board shows the top bid, which is wrong for a
-- lot taken at its take-it-now price: the bidding stopped below what the patron paid.
-- purchases stays locked; this view exposes only the lot, the patron's name and the amount.
drop view if exists lot_buyers;
create view lot_buyers with (security_invoker = false) as
  select p.lot_id, pa.name, p.amount_cents
  from purchases p
  join patrons pa on pa.id = p.patron_id
  where p.payment_status in ('held', 'released', 'partially_refunded');

grant select on lot_buyers to anon, authenticated;
