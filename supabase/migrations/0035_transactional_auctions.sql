-- Transactional auctions. Remediation plan, Phase 3.
--
-- Until now every auction step read the database, decided, and wrote in a later statement with
-- nothing holding the lot still in between. placeBid read the top bid and inserted; the close read
-- the bids and updated the lot; checkout read the winner and the price and made a Stripe session
-- that nothing ever re-checked. Two bids that arrived together could both be accepted, two closes
-- could both pick a winner, and a patron who had lost an offer could still finish paying for it.
--
-- From here the database does the deciding, one lot at a time, under a row lock:
--
--   place_bid            locks the lot, checks the clock and the minimum, inserts. One transaction.
--   close_auction        locks the lot, picks the winner or marks it unsold, opens the offer.
--   roll_offer           locks the lot, passes a winner who did not pay, offers to the next bid.
--   begin_lot_purchase   locks the lot, records the purchase bound to the offer it pays for, holds the lot.
--   fulfil_lot_purchase  locks the lot, re-checks that binding, and only then marks the lot sold.
--
-- Every offer carries a version. A purchase says which bid and which version it pays for, and a
-- purchase whose offer has moved on is not a sale: the money is held and goes back through the
-- refund queue under the reason 0034 added. A lot with a bid on it keeps its price, its mode and
-- its take-it-now number. Three triggers stand behind the functions so no other write path can
-- put a bid, a purchase or a change of terms past them.
--
-- The functions run as their owner and are callable by the service role only. They hold a row lock
-- for the length of one short transaction and never call out: Stripe and email happen in the
-- worker afterwards, keyed on what these return. See src/lib/auctions.ts.

-- ---------------------------------------------------------------
-- 1. Columns.
-- ---------------------------------------------------------------

-- Bumped every time a lot is offered to a bidder: at the close, and on every roll. A purchase
-- records the version it was made under, and fulfilment compares the two.
alter table lots add column if not exists offer_version int not null default 0;

alter table purchases
  -- The winning bid this purchase pays for. Null for a fixed price and for a take-it-now.
  add column if not exists bid_id uuid references bids(id),
  -- The lot's offer_version when the purchase was made.
  add column if not exists offer_version int,
  -- When an unpaid purchase stops counting as an attempt to pay. Later than Stripe's own session
  -- expiry, so a session Stripe could still complete is never deleted from under it.
  add column if not exists expires_at timestamptz;

create index if not exists purchases_bid_idx on purchases(bid_id) where bid_id is not null;

-- Checkouts already in flight get the deadline the code has always given them, plus the margin.
update purchases set expires_at = created_at + interval '45 minutes'
 where payment_status = 'requires_payment' and expires_at is null;

-- Purchases already on a lot that was won at auction are bound to that win after the fact.
update purchases p set bid_id = l.winner_bid_id, offer_version = l.offer_version
  from lots l
 where l.id = p.lot_id and l.mode = 'auction' and l.winner_bid_id is not null
   and p.bid_id is null and p.payment_status in ('requires_payment', 'held', 'released');

-- ---------------------------------------------------------------
-- 2. The arithmetic, as SQL. Mirrors bidStepCents and minimumBidCents in src/lib; the unit tests
--    in tests/auctions.test.ts keep the TypeScript honest and supabase/tests/auctions_test.sql
--    keeps this honest.
-- ---------------------------------------------------------------

-- 5% of the list price, rounded up to the nearest $5, never under $5.
create or replace function public.bid_step_cents(p_price_cents int)
returns int language sql immutable as $$
  select greatest(500, (ceil(p_price_cents * 0.05 / 500.0)::int) * 500);
$$;

-- The highest bid still standing. Null when nobody has bid; a bid of zero is a bid.
create or replace function public.top_bid_cents(p_lot_id uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select max(amount_cents) from bids where lot_id = p_lot_id and passed_at is null;
$$;

-- The smallest bid a lot takes now: the reserve, or a step above the top bid.
create or replace function public.minimum_bid_cents(p_lot_id uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case when top_bid_cents(l.id) is null then l.price_cents
              else top_bid_cents(l.id) + bid_step_cents(l.price_cents) end
    from lots l where l.id = p_lot_id;
$$;

-- When a lot closes: its own time if it has one, else the run's. Null means it is not on a clock.
create or replace function public.lot_close_time(p_lot_id uuid)
returns timestamptz language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(l.closes_at, r.bidding_closes_at) from lots l join runs r on r.id = l.run_id where l.id = p_lot_id;
$$;

-- An unguessable token for the winner's private link: 64 hex characters from two random UUIDs.
-- Core Postgres rather than pgcrypto, whose schema differs between the hosted project and CI, and
-- a security definer function's fixed search_path would not find it there.
create or replace function public.new_funding_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- ---------------------------------------------------------------
-- 3. The trusted-load switch.
--
-- The seed and the test fixtures write bids and purchases as historical facts: a bid on a lot
-- that has since sold, a purchase already held. The guards below would refuse them, rightly, so
-- a loader says so up front with `set doormoney.trusted_load = 'on'`. Only the seed and the test
-- fixtures set it. It opens nothing: anon and authenticated cannot insert into either table at
-- all (migration 0022), and the service role is already trusted with everything.
-- ---------------------------------------------------------------
create or replace function public.trusted_load()
returns boolean language sql stable as $$
  select coalesce(current_setting('doormoney.trusted_load', true), 'off') = 'on';
$$;

-- ---------------------------------------------------------------
-- 4. A bid is checked under the lot's lock, whoever inserts it.
-- ---------------------------------------------------------------
create or replace function public.guard_bid_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot lots%rowtype;
  v_run_status run_status;
  v_closes_at timestamptz;
  v_minimum int;
begin
  if trusted_load() then return new; end if;

  select * into v_lot from lots where id = new.lot_id for update;
  if not found then raise exception 'lot_not_found' using errcode = 'foreign_key_violation'; end if;
  select status into v_run_status from runs where id = v_lot.run_id;

  if v_lot.mode <> 'auction' then raise exception 'not_an_auction' using errcode = 'check_violation'; end if;
  if v_run_status not in ('open', 'live') then raise exception 'fundraiser_closed' using errcode = 'check_violation'; end if;
  if v_lot.status = 'pending_funding' and v_lot.winner_bid_id is null then
    raise exception 'spot_on_hold' using errcode = 'check_violation';
  end if;
  if v_lot.status <> 'open' then raise exception 'bidding_over' using errcode = 'check_violation'; end if;

  v_closes_at := lot_close_time(new.lot_id);
  if v_closes_at is not null and v_closes_at <= now() then raise exception 'bidding_closed' using errcode = 'check_violation'; end if;

  v_minimum := minimum_bid_cents(new.lot_id);
  if new.amount_cents < v_minimum then
    raise exception 'bid_below_minimum' using errcode = 'check_violation', detail = v_minimum::text;
  end if;
  if new.passed_at is not null then raise exception 'bid_born_passed' using errcode = 'check_violation'; end if;
  return new;
end;
$$;

drop trigger if exists bids_guard on bids;
create trigger bids_guard before insert on bids for each row execute function public.guard_bid_insert();

-- A bid is what it was. Its amount, its lot and its patron do not change after the fact.
create or replace function public.freeze_bid()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.amount_cents, new.lot_id, new.patron_id) is distinct from (old.amount_cents, old.lot_id, old.patron_id) then
    raise exception 'bid_is_final' using errcode = 'check_violation',
      hint = 'A bid keeps its amount, its lot and its patron. Pass it or outbid it.';
  end if;
  return new;
end;
$$;

drop trigger if exists bids_frozen on bids;
create trigger bids_frozen before update on bids for each row execute function public.freeze_bid();

-- ---------------------------------------------------------------
-- 5. Placing a bid. The whole read-decide-write in one transaction, under the lot's lock.
--    The guard above runs inside the insert and asks the same questions again; the point of
--    asking here first is the message: each refusal names its reason, and the detail carries the
--    minimum so the board can say what the next bid starts at.
-- ---------------------------------------------------------------
create or replace function public.place_bid(
  p_lot_id uuid,
  p_patron_id uuid,
  p_amount_cents int,
  p_anonymous boolean default false,
  p_payment_method_id text default null,
  p_setup_intent_id text default null,
  p_now timestamptz default now()
)
returns table (bid_id uuid, next_minimum_cents int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot lots%rowtype;
  v_run_status run_status;
  v_closes_at timestamptz;
  v_minimum int;
  v_bid_id uuid;
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then raise exception 'lot_not_found' using errcode = 'no_data_found'; end if;
  select status into v_run_status from runs where id = v_lot.run_id;

  if v_lot.mode <> 'auction' then raise exception 'not_an_auction' using errcode = 'check_violation'; end if;
  if v_run_status not in ('open', 'live') then raise exception 'fundraiser_closed' using errcode = 'check_violation'; end if;
  if v_lot.status = 'pending_funding' and v_lot.winner_bid_id is null then
    raise exception 'spot_on_hold' using errcode = 'check_violation';
  end if;
  if v_lot.status <> 'open' then raise exception 'bidding_over' using errcode = 'check_violation'; end if;

  v_closes_at := lot_close_time(p_lot_id);
  if v_closes_at is not null and v_closes_at <= p_now then raise exception 'bidding_closed' using errcode = 'check_violation'; end if;

  v_minimum := minimum_bid_cents(p_lot_id);
  if p_amount_cents < v_minimum then
    raise exception 'bid_below_minimum' using errcode = 'check_violation', detail = v_minimum::text;
  end if;

  insert into bids (lot_id, patron_id, amount_cents, anonymous, stripe_payment_method_id, stripe_setup_intent_id)
  values (p_lot_id, p_patron_id, p_amount_cents, p_anonymous, p_payment_method_id, p_setup_intent_id)
  returning id into v_bid_id;

  return query select v_bid_id, p_amount_cents + bid_step_cents(v_lot.price_cents);
end;
$$;

-- ---------------------------------------------------------------
-- 6. A lot's terms freeze the moment somebody relies on them.
-- ---------------------------------------------------------------
create or replace function public.freeze_lot_terms()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.price_cents, new.mode, new.buy_now_cents, new.surface_key)
     is distinct from (old.price_cents, old.mode, old.buy_now_cents, old.surface_key)
     and (exists (select 1 from bids where lot_id = old.id) or exists (select 1 from purchases where lot_id = old.id)) then
    raise exception 'lot_terms_frozen' using errcode = 'check_violation',
      hint = 'A spot with a bid or a payment on it keeps its price, its mode, its take-it-now number and its placement.';
  end if;
  return new;
end;
$$;

drop trigger if exists lots_terms_frozen on lots;
create trigger lots_terms_frozen before update on lots for each row execute function public.freeze_lot_terms();

-- ---------------------------------------------------------------
-- 7. A purchase is bound to the offer it pays for, whoever inserts it.
--
--    Three kinds. A won bid: the lot must be waiting on that exact bid at that exact version, for
--    that exact amount. A take-it-now: the lot must be open, carry the number, and the bidding
--    must still be below it. A fixed price: the lot must be open, at that price.
-- ---------------------------------------------------------------
create or replace function public.guard_purchase_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot lots%rowtype;
  v_bid_cents int;
  v_top int;
begin
  if trusted_load() then return new; end if;

  select * into v_lot from lots where id = new.lot_id for update;
  if not found then raise exception 'lot_not_found' using errcode = 'foreign_key_violation'; end if;
  if new.payment_status <> 'requires_payment' then
    raise exception 'purchase_starts_unpaid' using errcode = 'check_violation',
      hint = 'A purchase is born requires_payment and moves to held when the money lands (migration 0033).';
  end if;
  if new.expires_at is null then new.expires_at := now() + interval '45 minutes'; end if;

  if new.bid_id is not null then
    select amount_cents into v_bid_cents from bids where id = new.bid_id and lot_id = new.lot_id;
    if v_bid_cents is null then raise exception 'bid_not_on_lot' using errcode = 'check_violation'; end if;
    if v_lot.mode <> 'auction' or v_lot.status <> 'pending_funding' or v_lot.winner_bid_id is distinct from new.bid_id then
      raise exception 'offer_not_current' using errcode = 'check_violation';
    end if;
    if new.offer_version is null then
      new.offer_version := v_lot.offer_version;
    elsif new.offer_version <> v_lot.offer_version then
      raise exception 'offer_not_current' using errcode = 'check_violation';
    end if;
    if new.amount_cents <> v_bid_cents then raise exception 'amount_not_the_bid' using errcode = 'check_violation'; end if;
  elsif v_lot.mode = 'auction' then
    if v_lot.status <> 'open' or v_lot.buy_now_cents is null then
      raise exception 'not_for_sale_outright' using errcode = 'check_violation';
    end if;
    v_top := top_bid_cents(new.lot_id);
    if v_top is not null and v_top >= v_lot.buy_now_cents then
      raise exception 'bidding_passed_take_it_now' using errcode = 'check_violation';
    end if;
    if new.amount_cents <> v_lot.buy_now_cents then raise exception 'amount_not_the_price' using errcode = 'check_violation'; end if;
    new.offer_version := v_lot.offer_version;
  else
    if v_lot.status <> 'open' then raise exception 'not_for_sale' using errcode = 'check_violation'; end if;
    if new.amount_cents <> v_lot.price_cents then raise exception 'amount_not_the_price' using errcode = 'check_violation'; end if;
    new.offer_version := v_lot.offer_version;
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_guard on purchases;
create trigger purchases_guard before insert on purchases for each row execute function public.guard_purchase_insert();

-- ---------------------------------------------------------------
-- 8. Starting a purchase: the row and the hold on the lot in one transaction.
--
--    Checkout used to insert the purchase and then, in a second statement, mark the lot
--    pending_funding. A close between the two would have picked a winner for a lot that somebody
--    was already paying for outright. Now the two happen under one lock, after any stale attempt
--    on the lot has been cleared.
--
--    Returns the purchase id. Raises the guard's reasons, plus 'spot_being_taken' when another
--    patron's checkout is still live.
-- ---------------------------------------------------------------
create or replace function public.begin_lot_purchase(
  p_lot_id uuid,
  p_patron_id uuid,
  p_amount_cents int,
  p_fee_cents int,
  p_bid_id uuid default null,
  p_expires_at timestamptz default null,
  p_now timestamptz default now()
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot lots%rowtype;
  v_expires timestamptz := coalesce(p_expires_at, p_now + interval '45 minutes');
  v_purchase_id uuid;
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then raise exception 'lot_not_found' using errcode = 'no_data_found'; end if;

  perform expire_stale_checkouts(p_lot_id, p_now);
  select * into v_lot from lots where id = p_lot_id;

  if exists (select 1 from purchases where lot_id = p_lot_id and payment_status in ('held', 'released')) then
    raise exception 'spot_taken' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from purchases where lot_id = p_lot_id and payment_status = 'requires_payment') then
    raise exception 'spot_being_taken' using errcode = 'unique_violation';
  end if;

  insert into purchases (lot_id, patron_id, amount_cents, fee_cents, bid_id, expires_at)
  values (p_lot_id, p_patron_id, p_amount_cents, p_fee_cents, p_bid_id, v_expires)
  returning id into v_purchase_id;

  -- A won bid keeps the deadline from its email. Anything taken outright is held for the checkout.
  if p_bid_id is null then
    update lots set status = 'pending_funding', funding_deadline = v_expires where id = p_lot_id and status = 'open';
  end if;
  return v_purchase_id;
end;
$$;

-- ---------------------------------------------------------------
-- 9. Clearing attempts that ran out.
--
--    An unpaid purchase past its expires_at is nobody's live attempt. It goes, and a hold it was
--    keeping on a fixed-price or take-it-now lot is lifted. A lot won at auction is left with its
--    winner: their 48 hours are the roll's business, not this one's.
--
--    Returns the Stripe session ids of what it deleted, so the caller can expire them at Stripe
--    too. Best effort there: a session past its own expiry cannot complete anyway.
-- ---------------------------------------------------------------
create or replace function public.expire_stale_checkouts(p_lot_id uuid, p_now timestamptz default now())
returns text[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot lots%rowtype;
  v_sessions text[];
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then return array[]::text[]; end if;

  with gone as (
    delete from purchases
     where lot_id = p_lot_id and payment_status = 'requires_payment' and expires_at is not null and expires_at <= p_now
    returning stripe_checkout_session_id
  )
  select coalesce(array_agg(stripe_checkout_session_id) filter (where stripe_checkout_session_id is not null), array[]::text[])
    into v_sessions from gone;

  if v_lot.status = 'pending_funding' and v_lot.winner_bid_id is null
     and not exists (select 1 from purchases where lot_id = p_lot_id and payment_status in ('requires_payment', 'held', 'released')) then
    update lots set status = 'open', funding_deadline = null, funding_token = null where id = p_lot_id;
  end if;
  return v_sessions;
end;
$$;

-- ---------------------------------------------------------------
-- 10. Closing an auction. The top bid at or above the reserve wins and gets the offer.
--
--     outcome: won | unsold | not_due | already | missing
-- ---------------------------------------------------------------
create or replace function public.close_auction(p_lot_id uuid, p_now timestamptz default now(), p_funding_hours int default 48)
returns table (outcome text, winner_bid_id uuid, funding_token text, funding_deadline timestamptz, offer_version int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot lots%rowtype;
  v_run_status run_status;
  v_closes_at timestamptz;
  v_bid bids%rowtype;
  v_token text;
  v_deadline timestamptz;
  v_version int;
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then return query select 'missing', null::uuid, null::text, null::timestamptz, null::int; return; end if;
  if v_lot.mode <> 'auction' or v_lot.status <> 'open' then
    return query select 'already', v_lot.winner_bid_id, null::text, v_lot.funding_deadline, v_lot.offer_version; return;
  end if;

  select status into v_run_status from runs where id = v_lot.run_id;
  v_closes_at := lot_close_time(p_lot_id);
  if v_run_status not in ('open', 'live') or v_closes_at is null or v_closes_at > p_now then
    return query select 'not_due', null::uuid, null::text, null::timestamptz, v_lot.offer_version; return;
  end if;

  select * into v_bid from bids
   where lot_id = p_lot_id and passed_at is null and amount_cents >= v_lot.price_cents
   order by amount_cents desc, created_at asc
   limit 1;
  if not found then
    update lots set status = 'unsold', funding_deadline = null, funding_token = null where id = p_lot_id;
    return query select 'unsold', null::uuid, null::text, null::timestamptz, v_lot.offer_version; return;
  end if;

  v_token := new_funding_token();
  v_deadline := p_now + make_interval(hours => p_funding_hours);
  update lots
     set status = 'pending_funding', winner_bid_id = v_bid.id, funding_deadline = v_deadline, funding_token = v_token,
         offer_version = lots.offer_version + 1, funding_charge_error = null
   where id = p_lot_id
   returning lots.offer_version into v_version;
  return query select 'won', v_bid.id, v_token, v_deadline, v_version;
end;
$$;

-- ---------------------------------------------------------------
-- 11. Rolling an offer whose winner let the clock run out.
--
--     A purchase in requires_payment is an attempt to pay and is left alone until it expires. A
--     paid purchase means fulfilment has the lot, or is about to. A lapsed hold with no winner
--     (a take-it-now or a fixed price nobody finished paying for) goes back on the board.
--
--     outcome: rolled | unsold | reopened | waiting | not_due | already | missing
-- ---------------------------------------------------------------
create or replace function public.roll_offer(p_lot_id uuid, p_now timestamptz default now(), p_funding_hours int default 48)
returns table (outcome text, passed_bid_id uuid, winner_bid_id uuid, funding_token text, funding_deadline timestamptz, offer_version int, expired_sessions text[])
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot lots%rowtype;
  v_bid bids%rowtype;
  v_token text;
  v_deadline timestamptz;
  v_version int;
  v_sessions text[] := array[]::text[];
begin
  select * into v_lot from lots where id = p_lot_id for update;
  if not found then return query select 'missing', null::uuid, null::uuid, null::text, null::timestamptz, null::int, v_sessions; return; end if;
  if v_lot.status <> 'pending_funding' then
    return query select 'already', null::uuid, v_lot.winner_bid_id, null::text, v_lot.funding_deadline, v_lot.offer_version, v_sessions; return;
  end if;
  if v_lot.funding_deadline is null or v_lot.funding_deadline > p_now then
    return query select 'not_due', null::uuid, v_lot.winner_bid_id, null::text, v_lot.funding_deadline, v_lot.offer_version, v_sessions; return;
  end if;
  if exists (select 1 from purchases where lot_id = p_lot_id and payment_status in ('held', 'released')) then
    return query select 'already', null::uuid, v_lot.winner_bid_id, null::text, v_lot.funding_deadline, v_lot.offer_version, v_sessions; return;
  end if;
  if exists (select 1 from purchases where lot_id = p_lot_id and payment_status = 'requires_payment' and (expires_at is null or expires_at > p_now)) then
    return query select 'waiting', null::uuid, v_lot.winner_bid_id, null::text, v_lot.funding_deadline, v_lot.offer_version, v_sessions; return;
  end if;

  v_sessions := expire_stale_checkouts(p_lot_id, p_now);

  if v_lot.winner_bid_id is null then
    -- expire_stale_checkouts has already put it back on the board.
    return query select 'reopened', null::uuid, null::uuid, null::text, null::timestamptz, v_lot.offer_version, v_sessions; return;
  end if;

  update bids set passed_at = p_now where id = v_lot.winner_bid_id and passed_at is null;

  select * into v_bid from bids
   where lot_id = p_lot_id and passed_at is null and amount_cents >= v_lot.price_cents
   order by amount_cents desc, created_at asc
   limit 1;
  if not found then
    update lots set status = 'unsold', funding_deadline = null, funding_token = null where id = p_lot_id;
    return query select 'unsold', v_lot.winner_bid_id, null::uuid, null::text, null::timestamptz, v_lot.offer_version, v_sessions; return;
  end if;

  v_token := new_funding_token();
  v_deadline := p_now + make_interval(hours => p_funding_hours);
  update lots
     set winner_bid_id = v_bid.id, funding_deadline = v_deadline, funding_token = v_token,
         offer_version = lots.offer_version + 1, funding_charge_error = null
   where id = p_lot_id
   returning lots.offer_version into v_version;
  return query select 'rolled', v_lot.winner_bid_id, v_bid.id, v_token, v_deadline, v_version, v_sessions;
end;
$$;

-- ---------------------------------------------------------------
-- 12. Fulfilment. The money has landed; is this still the sale it was made for?
--
--     The purchase moves to held either way, because the charge is real. Only a purchase whose
--     offer is still current gets the lot: 'sold'. 'stale' is the caller's cue to queue the
--     refund. Locks the lot before the purchase, the same order as the writers above, so a roll
--     and a fulfilment on the same lot queue rather than deadlock.
--
--     outcome: sold | already | stale | missing
-- ---------------------------------------------------------------
create or replace function public.fulfil_lot_purchase(
  p_purchase_id uuid,
  p_payment_intent_id text default null,
  p_charge_id text default null,
  p_checkout_session_id text default null
)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot_id uuid;
  v_lot lots%rowtype;
  v_p purchases%rowtype;
  v_current boolean;
begin
  select lot_id into v_lot_id from purchases where id = p_purchase_id;
  if v_lot_id is null then return 'missing'; end if;
  select * into v_lot from lots where id = v_lot_id for update;
  select * into v_p from purchases where id = p_purchase_id for update;
  if v_p.payment_status <> 'requires_payment' then return 'already'; end if;

  v_current := case
    when v_p.bid_id is not null then
      v_lot.status = 'pending_funding' and v_lot.winner_bid_id = v_p.bid_id and v_lot.offer_version = v_p.offer_version
    else
      v_lot.status = 'pending_funding' and v_lot.winner_bid_id is null
      and v_lot.offer_version = coalesce(v_p.offer_version, v_lot.offer_version)
  end;

  update purchases
     set payment_status = 'held',
         stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
         stripe_charge_id = coalesce(p_charge_id, stripe_charge_id),
         stripe_checkout_session_id = coalesce(p_checkout_session_id, stripe_checkout_session_id)
   where id = p_purchase_id;

  if not v_current then return 'stale'; end if;

  update lots set status = 'sold', funding_deadline = null, funding_token = null where id = v_lot_id;
  return 'sold';
end;
$$;

-- ---------------------------------------------------------------
-- 13. Grants. Nothing here is for the browser. The trigger functions are reachable only through
--     their triggers; the rest are called by the service role from the worker and the actions.
-- ---------------------------------------------------------------
revoke execute on function public.bid_step_cents(int)                                              from public, anon, authenticated;
revoke execute on function public.top_bid_cents(uuid)                                              from public, anon, authenticated;
revoke execute on function public.minimum_bid_cents(uuid)                                          from public, anon, authenticated;
revoke execute on function public.lot_close_time(uuid)                                             from public, anon, authenticated;
revoke execute on function public.new_funding_token()                                              from public, anon, authenticated;
revoke execute on function public.trusted_load()                                                   from public, anon, authenticated;
revoke execute on function public.guard_bid_insert()                                               from public, anon, authenticated;
revoke execute on function public.freeze_bid()                                                     from public, anon, authenticated;
revoke execute on function public.place_bid(uuid, uuid, int, boolean, text, text, timestamptz)    from public, anon, authenticated;
revoke execute on function public.freeze_lot_terms()                                               from public, anon, authenticated;
revoke execute on function public.guard_purchase_insert()                                          from public, anon, authenticated;
revoke execute on function public.begin_lot_purchase(uuid, uuid, int, int, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.expire_stale_checkouts(uuid, timestamptz)                        from public, anon, authenticated;
revoke execute on function public.close_auction(uuid, timestamptz, int)                            from public, anon, authenticated;
revoke execute on function public.roll_offer(uuid, timestamptz, int)                               from public, anon, authenticated;
revoke execute on function public.fulfil_lot_purchase(uuid, text, text, text)                      from public, anon, authenticated;

comment on function public.place_bid(uuid, uuid, int, boolean, text, text, timestamptz) is
  'Places a bid under the lot''s row lock: checks the clock and the minimum and inserts in one transaction. Raises check_violation with the reason as the message and the minimum as the detail. Added in 0035.';
comment on function public.close_auction(uuid, timestamptz, int) is
  'Closes one due auction under its row lock: the top bid at or above the reserve becomes the offer, with a fresh token, deadline and offer_version. Idempotent: a closed lot answers already. Added in 0035.';
comment on function public.roll_offer(uuid, timestamptz, int) is
  'Passes a winner whose deadline ran out and offers the lot to the next bid, under the row lock. Leaves a live checkout alone. Added in 0035.';
comment on function public.fulfil_lot_purchase(uuid, text, text, text) is
  'Marks a purchase held and, only if it still pays for the lot''s current offer, marks the lot sold. Answers stale when the offer moved on; the caller queues the refund. Added in 0035.';
comment on column public.lots.offer_version is 'Bumped on every offer to a bidder (close, roll). A purchase records the version it pays for. Added in 0035.';
