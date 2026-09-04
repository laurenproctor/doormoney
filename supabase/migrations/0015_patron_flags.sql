-- Phase 6: the patron flag. "I don't think this ran."
-- Raising one pauses the money that has not gone out yet, for that placement or backing alone,
-- until Door Money looks. 0014 is deliberately left free for the marks work on its own branch.

alter table purchases add column flagged_at timestamptz;
alter table purchases add column flag_note text;
alter table purchases add column flag_cleared_at timestamptz;

alter table backings add column flagged_at timestamptz;
alter table backings add column flag_note text;
alter table backings add column flag_cleared_at timestamptz;

-- Door Money's queue: what is flagged and still waiting to be looked at.
create index purchases_flagged_idx on purchases(flagged_at) where flagged_at is not null and flag_cleared_at is null;
create index backings_flagged_idx on backings(flagged_at) where flagged_at is not null and flag_cleared_at is null;
