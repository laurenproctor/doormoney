-- Sponsorship options for sports, film and theater.
--
-- surfaces was built for music and says so twice. applies_to is an act_type[], and a theater
-- company has no act type. default_price_cents is not null, and Door Money has no business
-- suggesting a price for a foyer banner it has never sold. Both become optional, and a category
-- says which fundraisers an option belongs to.
--
-- An unpriced option is not a free one. It means no suggestion has been set, and the organizer's
-- own price is what is charged, which was already true of every option here.
--
-- Publishing and checkout for these categories are separate changes. Adding an option does not
-- enable one: nothing reads these rows until a fundraiser in that category can price them.
begin;

alter table public.surfaces
  add column category_key text not null default 'music' references public.fundraiser_categories(key);
alter table public.surfaces alter column applies_to drop not null;
alter table public.surfaces alter column default_price_cents drop not null;

-- act_type is a music idea. No other category may carry one, so it cannot be read as a default.
alter table public.surfaces add constraint surfaces_applies_to_is_music
  check (category_key = 'music' or applies_to is null);

comment on column public.surfaces.category_key is
  'The category whose fundraisers may price this option. Existing rows are music.';
comment on column public.surfaces.applies_to is
  'Music act types. Null for a category that does not divide its organizers that way.';
comment on column public.surfaces.default_price_cents is
  'A suggested price, or null where Door Money has not set one. The lot price is what is charged.';

-- Mirrors src/lib/catalog.ts; tests/catalog.test.ts fails if they drift.
insert into public.surfaces (key, name, group_key, category_key, applies_to, default_price_cents, default_period, seen_by, sort) values
('jersey_front',      'Jersey front',             'field',          'sports',  null, null, 'season',     'every fixture, and the photographs of it',          101),
('warmup_tops',       'Warm-up tops',             'field',          'sports',  null, null, 'season',     'the hour before each home fixture',                 102),
('touchline_banner',  'Touchline banner',         'venue',          'sports',  null, null, 'season',     'everyone at a home fixture',                        103),
('team_sheet',        'Team sheet',               'venue',          'sports',  null, null, 'season',     'everyone handed one at the gate',                   104),
('fixture_posts',     'Fixture posts',            'online',         'sports',  null, null, 'season',     'the team''s own followers',                         105),
('end_credit',        'End credit',               'screen',         'film',    null, null, 'production', 'everyone who watches to the end',                   201),
('special_thanks',    'Special thanks',           'screen',         'film',    null, null, 'production', 'everyone who watches to the end',                   202),
('product_placement', 'Agreed product placement', 'screen',         'film',    null, null, 'production', 'everyone who watches the scene',                    203),
('screening_signage', 'Screening signage',        'screening',      'film',    null, null, 'production', 'everyone at a screening the production runs',       204),
('screening_program', 'Screening program',        'screening',      'film',    null, null, 'production', 'everyone handed a program at those screenings',     205),
('release_posts',     'Release posts',            'online',         'film',    null, null, 'production', 'the production''s own followers and mailing list',  206),
('curtain_speech',    'Curtain speech',           'stage',          'theater', null, null, 'production', 'the house, before each performance',                301),
('set_dressing',      'Agreed set dressing',      'stage',          'theater', null, null, 'production', 'the house, in the scenes it appears in',            302),
('playbill_credit',   'Program credit',           'front_of_house', 'theater', null, null, 'production', 'everyone handed a program',                         303),
('foyer_banner',      'Foyer signage',            'front_of_house', 'theater', null, null, 'production', 'the house, on the way in and at the interval',      304),
('production_posts',  'Production posts',         'online',         'theater', null, null, 'production', 'the company''s own followers and mailing list',     305)
on conflict (key) do nothing;

-- Migration 0030 revoked these table-wide, which already covers a column added later. Stated again
-- so the file that adds a column also says what the browser may do with it.
revoke insert, update, delete, truncate on public.surfaces from anon, authenticated;

commit;
