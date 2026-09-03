-- Door Money, initial schema.
-- Money is integer cents everywhere. Timestamps are timestamptz.
-- Run with: supabase db push   (or paste into the SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------
create type act_type as enum ('touring_band', 'house_act', 'soloist');
create type run_kind as enum ('tour', 'season', 'residency');
create type run_status as enum ('draft', 'open', 'live', 'closed', 'cancelled');
create type sale_mode as enum ('fixed', 'auction');
create type lot_status as enum ('open', 'pending_funding', 'sold', 'unsold', 'cancelled');
create type mark_status as enum ('none', 'submitted', 'approved', 'declined');
create type payment_status as enum ('requires_payment', 'held', 'released', 'refunded', 'partially_refunded');
create type payout_status as enum ('scheduled', 'paid', 'skipped', 'paused');
create type waitlist_role as enum ('band', 'patron');

-- ---------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Acts
-- ---------------------------------------------------------------
create table acts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  slug text not null unique,
  name text not null,
  type act_type not null,
  city text not null default 'New York',
  bio text,
  photo_url text,
  instagram text,
  website text,
  stripe_account_id text unique,          -- Connect Express account
  stripe_payouts_enabled boolean not null default false,
  founding boolean not null default false, -- first fifty, free forever
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Runs: the thing a patron backs
-- ---------------------------------------------------------------
create table runs (
  id uuid primary key default gen_random_uuid(),
  act_id uuid not null references acts(id) on delete cascade,
  kind run_kind not null,
  title text not null,                    -- "Fall run", "Fall season", "October"
  starts_on date not null,
  ends_on date not null,
  show_count int not null default 0,
  expected_attendance int,                -- across the whole run, self-reported
  bidding_closes_at timestamptz,          -- null for fixed-price-only boards
  status run_status not null default 'draft',
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index runs_act_idx on runs(act_id);

-- Shows inside a run. Optional in Phase 2, used by Phase 6.
create table shows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  played_on date not null,
  venue text,
  city text,
  played boolean not null default false,
  attendance int,
  photo_url text
);
create index shows_run_idx on shows(run_id);

-- ---------------------------------------------------------------
-- Surfaces: the standard card. Seeded from src/lib/catalog.ts.
-- ---------------------------------------------------------------
create table surfaces (
  key text primary key,                   -- 'kick_head', 'case_sticker' ...
  name text not null,
  group_key text not null,                -- 'onstage', 'room', 'online'
  applies_to act_type[] not null,
  default_price_cents int not null,
  default_period text not null,           -- 'run', 'month', 'season'
  seen_by text,
  sort int not null default 0
);

-- ---------------------------------------------------------------
-- Lots: one surface on one run at one price
-- ---------------------------------------------------------------
create table lots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  surface_key text not null references surfaces(key),
  label text,                             -- "Case lid spot 2" when a surface repeats
  price_cents int not null,               -- fixed price, or reserve for auctions
  mode sale_mode not null default 'fixed',
  exclusive boolean not null default false,
  status lot_status not null default 'open',
  winner_bid_id uuid,                     -- set at auction close
  funding_deadline timestamptz,           -- close + 48h
  created_at timestamptz not null default now()
);
create index lots_run_idx on lots(run_id);

-- ---------------------------------------------------------------
-- Patrons
-- ---------------------------------------------------------------
create table patrons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  name text not null,                     -- "Kettle St. Coffee"
  contact_email text not null,
  logo_url text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Bids (auctions only)
-- ---------------------------------------------------------------
create table bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  patron_id uuid not null references patrons(id),
  amount_cents int not null,
  anonymous boolean not null default false, -- hides the name on the public board only
  created_at timestamptz not null default now()
);
create index bids_lot_idx on bids(lot_id, amount_cents desc);
alter table lots add constraint lots_winner_fk foreign key (winner_bid_id) references bids(id);

-- ---------------------------------------------------------------
-- Purchases: a patron paying for a lot (fixed or won at auction)
-- ---------------------------------------------------------------
create table purchases (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null unique references lots(id),
  patron_id uuid not null references patrons(id),
  amount_cents int not null,
  fee_cents int not null,                 -- Door Money's 15%
  stripe_payment_intent_id text unique,
  payment_status payment_status not null default 'requires_payment',
  mark_status mark_status not null default 'none',
  mark_url text,
  mark_text text,                         -- for name-only marks
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Backings: fan tiers through the widget. Not lots.
-- ---------------------------------------------------------------
create table backings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  patron_id uuid not null references patrons(id),
  tier text not null,                     -- 'thank_you', 'merch_card'
  amount_cents int not null,
  fee_cents int not null,
  display_name text not null,             -- as it should appear
  stripe_payment_intent_id text unique,
  payment_status payment_status not null default 'requires_payment',
  source text not null default 'widget',  -- 'widget' | 'board'
  origin text,                            -- the embedding page's origin, for records
  created_at timestamptz not null default now()
);
create index backings_run_idx on backings(run_id);

-- ---------------------------------------------------------------
-- Payout schedule: the weekly slices. One row per (purchase or backing) per week.
-- Built to support calendar release (decision 2A) now and act-confirmed release (2B) later.
-- ---------------------------------------------------------------
create table payout_schedule (
  id uuid primary key default gen_random_uuid(),
  act_id uuid not null references acts(id),
  purchase_id uuid references purchases(id) on delete cascade,
  backing_id uuid references backings(id) on delete cascade,
  due_on date not null,                   -- the Friday
  amount_cents int not null,
  status payout_status not null default 'scheduled',
  stripe_transfer_id text unique,
  paused_reason text,
  paid_at timestamptz,
  check ((purchase_id is not null) <> (backing_id is not null))
);
create index payout_due_idx on payout_schedule(due_on, status);

-- ---------------------------------------------------------------
-- Stripe events, for idempotent webhooks
-- ---------------------------------------------------------------
create table stripe_events (
  id text primary key,                    -- evt_...
  type text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Waitlist (Phase 1)
-- ---------------------------------------------------------------
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  role waitlist_role not null,
  name text not null,
  email text not null,
  city text,
  act_type act_type,                      -- when role = band
  created_at timestamptz not null default now()
);
create unique index waitlist_email_role_idx on waitlist(lower(email), role);

-- ---------------------------------------------------------------
-- Row level security. Public reads for boards; writes through the server.
-- ---------------------------------------------------------------
alter table acts enable row level security;
alter table runs enable row level security;
alter table lots enable row level security;
alter table surfaces enable row level security;
alter table bids enable row level security;
alter table backings enable row level security;
alter table purchases enable row level security;
alter table patrons enable row level security;
alter table payout_schedule enable row level security;
alter table waitlist enable row level security;
alter table profiles enable row level security;
alter table shows enable row level security;
alter table stripe_events enable row level security;

create policy "public read acts"     on acts     for select using (true);
create policy "public read runs"     on runs     for select using (status in ('open','live','closed'));
create policy "public read lots"     on lots     for select using (true);
create policy "public read surfaces" on surfaces for select using (true);
create policy "public read bids"     on bids     for select using (true);
create policy "public read shows"    on shows    for select using (true);

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own acts"    on acts    for all using (auth.uid() = owner_id);

-- Everything else (patrons, purchases, backings, payouts, waitlist, stripe_events)
-- is written only by the server with the service-role key. No client policies on purpose.
