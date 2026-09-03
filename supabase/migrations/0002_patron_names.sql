-- Public patron names for boards.
-- The patrons table stays locked (it holds contact emails and Stripe ids).
-- This view exposes only what the board prints next to a bid.
create view patron_names with (security_invoker = false) as
  select id, name from patrons;

grant select on patron_names to anon, authenticated;
