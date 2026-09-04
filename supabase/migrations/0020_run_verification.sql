-- Placement verification: what a musician promises patrons will come back from a run.
--
-- It belongs to the run, not to the musician. The same act can photograph a music stand on
-- one tour and send nothing but the end-of-run record on the next. Keys are stable and match
-- VERIFICATION_METHODS in src/lib/verification.ts; the labels live there and only there.
--
-- Nothing is invented for a musician here. Every existing run comes out of this migration with
-- an empty list, which the public board renders as no section at all. The two seeded sample
-- boards are filled in at the bottom, deliberately, so the sample pages show the feature.

alter table runs
  add column verification_methods text[] not null default '{}',
  add column verification_other text;

comment on column runs.verification_methods is
  'Stable keys from src/lib/verification.ts. Empty while a run is a draft; publishing needs at least one.';
comment on column runs.verification_other is
  'The write-in answer, only when the list contains ''other''. Trimmed, 10 to 500 characters.';

-- The list only holds keys the app knows. An unknown key would render as nothing on the board,
-- which is the quiet kind of wrong.
alter table runs add constraint runs_verification_methods_known check (
  verification_methods <@ array[
    'selected_show_photos',
    'venue_date_record',
    'attendance_estimates',
    'social_post_links',
    'short_video',
    'end_of_run_record',
    'other'
  ]::text[]
);

-- The write-in answer exists exactly when 'other' is on the list, and says something when it does.
alter table runs add constraint runs_verification_other_present check (
  case
    when 'other' = any(verification_methods)
      then verification_other is not null and char_length(btrim(verification_other)) between 10 and 500
    else verification_other is null
  end
);

-- ---------------------------------------------------------------
-- The sample boards, by id. Both are seed rows from supabase/seed.sql; the guard on the act id
-- means this touches nothing if a real musician has taken those rows over. Kept in step with
-- the same values in supabase/seed.sql and src/lib/sample.ts.
-- ---------------------------------------------------------------
update runs set
  verification_methods = array['selected_show_photos', 'venue_date_record', 'social_post_links', 'end_of_run_record']
where id = '22222222-2222-2222-2222-222222222222'
  and act_id = '11111111-1111-1111-1111-111111111111'
  and verification_methods = '{}';

update runs set
  verification_methods = array['venue_date_record', 'attendance_estimates', 'end_of_run_record', 'other'],
  verification_other = 'Rosie photographs the marked case lid and music stand at selected dates, with the room and the date beside each image.'
where id = '44444444-4444-4444-4444-444444444444'
  and act_id = '33333333-3333-3333-3333-333333333333'
  and verification_methods = '{}';
