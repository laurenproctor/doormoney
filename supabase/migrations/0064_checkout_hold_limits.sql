-- ---------------------------------------------------------------
-- Who may hold an option at checkout.
--
-- /api/checkout holds a fixed-price option for whoever posts to it: no account, no card, nothing
-- but a name and an email address. begin_lot_purchase (migration 0035) then refuses every other
-- buyer until the hold lapses. That is the right rule for one honest buyer and the wrong one for
-- a script, which could hold every option on the site with a request per option and hold them
-- again the moment each lapsed, so that nobody could buy anything. Nothing counted the requests,
-- because the request handler runs on a serverless platform whose memory does not survive from
-- one request to the next. So the counting lives here, in the one place every request reaches.
--
--   checkout_attempts             every request that got as far as asking for a hold: where it
--                                 came from, which option, which address, and the purchase it made
--                                 if it made one. Private. Pruned after a day.
--   begin_lot_purchase_limited    records the attempt, refuses it when a limit is reached, and
--                                 otherwise hands the decision to begin_lot_purchase, exactly as
--                                 before. begin_lot_purchase itself is untouched and stays the one
--                                 place a hold is decided; this only decides who may ask.
--   prune_checkout_attempts       the daily job's housekeeping.
--
-- Four limits, all counted at the database's clock against the attempts table, so that they hold
-- for every instance of the request handler at once:
--
--   1. Attempts from one address:  at most 10 in 10 minutes.
--   2. Attempts on one option:     at most 30 in 10 minutes, from anywhere.
--   3. Open holds from one address: at most 3 at a time.
--   4. Open holds for one email:   at most 2 at a time.
--
-- An attempt counts whether or not it was refused, so a client that keeps trying keeps itself
-- locked out. An open hold is a purchase this route made that is still waiting for payment and
-- still inside its expiry; a hold that lapsed no longer counts against anybody. A buyer paying
-- for an auction they won is paying for a hold the close already made, not making a new one, so
-- the hold caps (3 and 4) are not asked of a claim; the attempt limits (1 and 2) are.
--
-- The checks and the hold run under one advisory lock per address and one per email, taken in
-- that order, so two requests from the same place cannot both count the holds, both find room
-- and both take one.
--
-- What the caller is told is a word, never an error: a refusal here has to leave the attempt row
-- behind, and a raised exception would take it with it. begin_lot_purchase's own refusals are
-- caught and passed back as the same word they were raised with, so the route reads them exactly
-- as it did. The words for the limits are deliberately not distinguishable to a visitor: the route
-- says the same sentence for all four.
-- ---------------------------------------------------------------

create table public.checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  client_ip text not null,
  lot_id uuid not null references public.lots (id) on delete cascade,
  email text not null,
  -- The purchase this attempt made, while it exists. A hold that is released is deleted
  -- (expire_stale_checkouts, releaseLot), and the reference goes with it.
  purchase_id uuid references public.purchases (id) on delete set null,
  created_at timestamptz not null default now()
);

create index checkout_attempts_ip_idx on public.checkout_attempts (client_ip, created_at desc);
create index checkout_attempts_lot_idx on public.checkout_attempts (lot_id, created_at desc);
create index checkout_attempts_email_idx on public.checkout_attempts (email, created_at desc);
create index checkout_attempts_purchase_idx on public.checkout_attempts (purchase_id) where purchase_id is not null;

-- Addresses and email addresses: nothing in a browser reads or writes a byte of it. The functions
-- below are security definer, so service_role's default grant is all the route needs.
alter table public.checkout_attempts enable row level security;
revoke all on public.checkout_attempts from public, anon, authenticated;

create or replace function public.begin_lot_purchase_limited(
  p_client_ip text,
  p_email text,
  p_lot_id uuid,
  p_patron_id uuid,
  p_amount_cents int,
  p_fee_cents int,
  p_bid_id uuid default null,
  p_expires_at timestamptz default null,
  p_now timestamptz default now()
)
returns table (purchase_id uuid, refusal text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ip text := coalesce(nullif(trim(p_client_ip), ''), 'unknown');
  v_email text := lower(trim(p_email));
  v_window interval := interval '10 minutes';
  v_ip_attempts int := 10;
  v_lot_attempts int := 30;
  v_ip_holds int := 3;
  v_email_holds int := 2;
  v_attempt_id uuid;
  v_purchase_id uuid;
begin
  -- One request from a place at a time, so the counts below are read and acted on under a lock.
  -- Address first, email second, everywhere, so two requests can never wait on each other.
  perform pg_advisory_xact_lock(hashtext('checkout_ip'), hashtext(v_ip));
  perform pg_advisory_xact_lock(hashtext('checkout_email'), hashtext(v_email));

  insert into checkout_attempts (client_ip, lot_id, email, created_at)
  values (v_ip, p_lot_id, v_email, p_now)
  returning id into v_attempt_id;

  -- 1. Attempts from one address. This attempt is already in the count.
  if (select count(*) from checkout_attempts
       where client_ip = v_ip and created_at > p_now - v_window and created_at <= p_now) > v_ip_attempts then
    return query select null::uuid, 'too_many_from_ip'::text; return;
  end if;

  -- 2. Attempts on one option, from anywhere.
  if (select count(*) from checkout_attempts
       where lot_id = p_lot_id and created_at > p_now - v_window and created_at <= p_now) > v_lot_attempts then
    return query select null::uuid, 'too_many_on_lot'::text; return;
  end if;

  -- 3 and 4. Holds still open, from this address and for this email. A claim makes no new hold.
  if p_bid_id is null then
    if (select count(*) from checkout_attempts a join purchases p on p.id = a.purchase_id
         where a.client_ip = v_ip and p.payment_status = 'requires_payment' and p.expires_at > p_now) >= v_ip_holds then
      return query select null::uuid, 'too_many_holds_ip'::text; return;
    end if;
    if (select count(*) from checkout_attempts a join purchases p on p.id = a.purchase_id
         where a.email = v_email and p.payment_status = 'requires_payment' and p.expires_at > p_now) >= v_email_holds then
      return query select null::uuid, 'too_many_holds_email'::text; return;
    end if;
  end if;

  -- The hold itself, decided where it always was. A refusal there comes back as its word, and the
  -- attempt row above stays: only this block's own work is rolled back.
  begin
    v_purchase_id := begin_lot_purchase(p_lot_id, p_patron_id, p_amount_cents, p_fee_cents, p_bid_id, p_expires_at, p_now);
  exception when others then
    return query select null::uuid, sqlerrm::text; return;
  end;

  update checkout_attempts set purchase_id = v_purchase_id where id = v_attempt_id;
  return query select v_purchase_id, null::text;
end;
$$;

-- Housekeeping. A day is longer than any window above, and an address or an email has no
-- business being kept past that.
create or replace function public.prune_checkout_attempts(p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int;
begin
  delete from checkout_attempts where created_at < p_now - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.begin_lot_purchase_limited(text, text, uuid, uuid, int, int, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.prune_checkout_attempts(timestamptz) from public, anon, authenticated;
