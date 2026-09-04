-- Phase 5: auctions. Straight bidding (docs/DECISIONS.md, decision 4): every bid is what the
-- patron pays if they win. The reserve is the lot's price_cents, as the initial schema says.

-- A lot can close on its own clock; without one it closes with the run.
alter table lots add column closes_at timestamptz;

-- The winner's private link to pay. Unguessable, replaced whenever the lot rolls to the next bid.
alter table lots add column funding_token text unique;

-- So the closing-soon email goes out once per lot.
alter table lots add column closing_soon_sent_at timestamptz;

-- A bid that won and then let the 48 hours run out. Kept, so the roll can skip it and the act can see what happened.
alter table bids add column passed_at timestamptz;

-- So an outbid patron is told once per bid, not once per job run.
alter table bids add column outbid_sent_at timestamptz;

create index bids_lot_created_idx on bids(lot_id, created_at desc);
create index lots_closing_idx on lots(status, closes_at);
create index lots_funding_idx on lots(status, funding_deadline);

-- The board watches bids live. Realtime only sends rows the reader is allowed to select,
-- and "public read bids" already covers that.
alter publication supabase_realtime add table bids;
