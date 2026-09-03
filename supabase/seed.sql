-- Door Money seed. Sample acts from the mockups so every screen renders.
-- Run after 0001_init.sql:  supabase db reset   (applies migrations then seed)

-- ---------------------------------------------------------------
-- The standard card. Mirrors src/lib/catalog.ts; keep them in sync.
-- ---------------------------------------------------------------
insert into surfaces (key, name, group_key, applies_to, default_price_cents, default_period, seen_by, sort) values
('kick_head',     'Kick drum head',     'onstage', '{touring_band,house_act}', 120000, 'run',    'the whole room, every show, every photo',        1),
('case_sticker',  'Road case spots',    'onstage', '{touring_band}',            35000, 'run',    'load-in, stage-side, every photo of the stack',  2),
('strap',         'Guitar straps',      'onstage', '{touring_band,house_act}',  45000, 'run',    'every front-on photo of the players',            3),
('amp_grille',    'Amp grilles',        'onstage', '{touring_band,house_act}',  30000, 'run',    'the side angles the kick head does not reach',   4),
('riser_fascia',  'Riser fascia',       'onstage', '{touring_band}',            20000, 'run',    'wide shots from the back of the room',           5),
('tip_jar_card',  'Tip jar card',       'room',    '{house_act}',               25000, 'month',  'the whole room, weekly',                         6),
('stage_thanks',  'Stage thank-you',    'room',    '{house_act}',               15000, 'month',  'the room, once a set',                           7),
('merch_runner',  'Merch table runner', 'room',    '{touring_band,house_act}',  50000, 'run',    'every fan who stops at the table',               8),
('hang_tags',     'Hang tags',          'room',    '{touring_band}',            35000, 'run',    'every merch buyer',                              9),
('picks',         'Picks',              'room',    '{touring_band,house_act}',  15000, 'run',    'whoever catches one',                           10),
('poster_credit', 'Poster credit',      'online',  '{touring_band,house_act}',  30000, 'run',    'every wall and window the poster goes on',      11),
('posts_email',   'Posts and email',    'online',  '{touring_band,house_act,soloist}', 40000, 'run', 'the band''s followers and mailing list',  12),
('vlog_card',     'Vlog logo card',     'online',  '{touring_band,soloist}',    25000, 'run',    'the band''s video audience',                    13),
('rig_rundown',   'Rig rundown',        'online',  '{touring_band}',            40000, 'run',    'players who buy gear',                          14),
('case_lid',      'Case lid',           'onstage', '{soloist}',                  6000, 'season', 'every player in the rehearsal room and the pit', 15),
('music_stand',   'Music stand',        'room',    '{soloist}',                  9000, 'season', 'the whole audience',                            16),
('program_credit','Recital program credit','online','{soloist}',                 4000, 'season', 'everyone holding a program',                    17),
('practice_video','Practice-room videos','online', '{soloist}',                  7000, 'month',  'the player''s video audience',                  18);

-- ---------------------------------------------------------------
-- Gutter Hymns: touring band, fall run, auction board
-- ---------------------------------------------------------------
insert into acts (id, slug, name, type, city, bio, founding) values
('11111111-1111-1111-1111-111111111111', 'gutter-hymns', 'Gutter Hymns', 'touring_band', 'New York',
 'Four-piece out of Ridgewood. Loud, tight, and on the road for most of the fall.', true);

insert into runs (id, act_id, kind, title, starts_on, ends_on, show_count, expected_attendance, bidding_closes_at, status) values
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'tour', 'Fall run',
 '2026-10-03', '2026-11-02', 18, 9400, '2026-09-25 23:00:00-04', 'open');

insert into lots (id, run_id, surface_key, label, price_cents, mode, status) values
('a1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'kick_head',    null,               120000, 'auction', 'sold'),
('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'strap',        null,                45000, 'auction', 'open'),
('a1000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'case_sticker', 'Case spot 1',       35000, 'auction', 'open'),
('a1000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'case_sticker', 'Case spot 2',       35000, 'auction', 'open'),
('a1000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'case_sticker', 'Case spot 3',       35000, 'fixed',   'sold'),
('a1000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'merch_runner', null,                50000, 'auction', 'open'),
('a1000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'picks',        null,                15000, 'auction', 'open'),
('a1000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'posts_email',  null,                40000, 'auction', 'open'),
('a1000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'rig_rundown',  null,                40000, 'auction', 'open');

-- ---------------------------------------------------------------
-- Rosie: soloist, fall season, small surfaces
-- ---------------------------------------------------------------
insert into acts (id, slug, name, type, city, bio, founding) values
('33333333-3333-3333-3333-333333333333', 'rosie-bassoon', 'Rosie the Bassoonist', 'soloist', 'New York',
 'Working bassoonist moving between rehearsals, services, chamber dates and sessions, with a feed where the bassoon does the talking.', true);

insert into runs (id, act_id, kind, title, starts_on, ends_on, show_count, bidding_closes_at, status) values
('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'season', 'Fall season',
 '2026-09-15', '2026-12-20', 32, '2026-09-13 21:00:00-04', 'open');

insert into lots (id, run_id, surface_key, label, price_cents, mode, status) values
('b1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'case_lid',       'Case lid spot 1',  6000, 'auction', 'sold'),
('b1000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'case_lid',       'Case lid spot 2',  4000, 'auction', 'open'),
('b1000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', 'case_lid',       'Case lid spot 3',  3000, 'fixed',   'open'),
('b1000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'music_stand',    null,               9000, 'auction', 'open'),
('b1000000-0000-0000-0000-000000000005', '44444444-4444-4444-4444-444444444444', 'posts_email',    'Season thank-you post', 5000, 'auction', 'open'),
('b1000000-0000-0000-0000-000000000006', '44444444-4444-4444-4444-444444444444', 'practice_video', null,               7000, 'fixed',   'open'),
('b1000000-0000-0000-0000-000000000007', '44444444-4444-4444-4444-444444444444', 'program_credit', null,               4000, 'fixed',   'open');

-- ---------------------------------------------------------------
-- Sample patrons and bids (invented names, as on the mockups)
-- ---------------------------------------------------------------
insert into patrons (id, name, contact_email) values
('c1000000-0000-0000-0000-000000000001', 'Kettle St. Coffee',      'hello@example.com'),
('c1000000-0000-0000-0000-000000000002', 'Ridgewood Wine Co.',     'hello@example.com'),
('c1000000-0000-0000-0000-000000000003', 'Hi-Watt Print Shop',     'hello@example.com'),
('c1000000-0000-0000-0000-000000000004', 'LMN Pedals',             'hello@example.com'),
('c1000000-0000-0000-0000-000000000005', 'Riverside Reeds',        'hello@example.com'),
('c1000000-0000-0000-0000-000000000006', 'Uptown Woodwind Repair', 'hello@example.com'),
('c1000000-0000-0000-0000-000000000007', 'Parkside Music School',  'hello@example.com'),
('c1000000-0000-0000-0000-000000000008', 'Anonymous patron',       'hello@example.com');

insert into bids (lot_id, patron_id, amount_cents, anonymous) values
('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 52000, false),
('a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 38000, false),
('a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000008', 36000, true),
('a1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000004', 61000, false),
('a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000008', 17000, true),
('a1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000002', 44000, false),
('b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000006', 4500,  false),
('b1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000007', 11000, false),
('b1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000008', 5500,  true);

insert into purchases (lot_id, patron_id, amount_cents, fee_cents, payment_status, mark_status) values
('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 120000, 18000, 'held', 'approved'),
('a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000004',  35000,  5250, 'held', 'approved'),
('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005',   6000,   900, 'held', 'approved');
