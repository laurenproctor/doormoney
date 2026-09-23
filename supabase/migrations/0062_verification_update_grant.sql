-- An organizer can save how the placements will be recorded.
--
-- 0020 added `runs.verification_methods` and `runs.verification_other`, the organizer's answer to
-- how delivery will be documented, which the publish gate has required ever since. 0022 then
-- revoked update on `runs` and granted it back column by column, and its list was written from
-- the columns 0001 had: the two from 0020 were left out. Every save from the verification editor
-- has been refused since, "permission denied for table runs", shown to the organizer as "That did
-- not save. Try once more." Every later migration that added a draft column (0038, 0053) granted
-- its own, so these two are the whole gap. No fundraiser could pass the gate from the dashboard.
--
-- Two columns, update only. Reading them was granted in 0022; inserting them is not needed, since
-- a draft starts with none and the editor saves onto an existing row. The owner policy on `runs`
-- (0023) still decides whose row, and the 0020 constraints still decide what may be in them.
--
-- Numbered 0062: 0061 is on main and applied to the hosted project.
begin;
grant update (verification_methods, verification_other) on public.runs to authenticated;
commit;
