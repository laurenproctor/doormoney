-- Buy it now on an auction lot: a set price that ends the bidding on the spot.
-- Only meaningful on an auction; a fixed-price lot is already a buy now.
alter table lots add column buy_now_cents int;
alter table lots add constraint lots_buy_now_above_reserve check (buy_now_cents is null or buy_now_cents > price_cents);
