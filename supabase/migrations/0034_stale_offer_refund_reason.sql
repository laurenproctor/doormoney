-- A third reason a refund is owed: the patron paid for an auction offer that had already moved on.
--
-- Migration 0035 binds every purchase to the offer it pays for (the winning bid and the offer
-- version) and refuses to sell a lot to a purchase whose offer is stale. The money has landed by
-- the time that is known, so it goes back through the refund queue (migration 0032) under this
-- reason. Remediation plan, Phase 3.
--
-- On its own in this file: Postgres will not let a new enum value be used in the transaction
-- that adds it, and 0035 needs to name it.
alter type refund_reason add value if not exists 'stale_offer';
