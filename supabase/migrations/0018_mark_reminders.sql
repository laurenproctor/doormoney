-- Phase 7: one reminder to a patron whose spot is paid for but whose mark has not arrived.
-- Recorded so the daily job never sends a second one.
alter table purchases add column mark_reminded_at timestamptz;
