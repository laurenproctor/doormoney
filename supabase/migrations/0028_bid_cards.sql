-- ---------------------------------------------------------------
-- A bid carries the card that will pay if it wins.
--
-- Bidding took no card. The winner got an emailed link and 48 hours, and a bid from somebody who
-- never meant to pay cost the act those 48 hours and then rolled to the next bid. Now the card is
-- saved when the bid is placed and charged off-session at the close.
--
-- Nothing is charged at bid time. A SetupIntent only stores the card against a Stripe customer, so
-- an outbid patron has nothing to release and no money held: that is the reason this is a
-- SetupIntent rather than an authorization hold, which would expire long before a close that is
-- usually weeks out.
--
-- The claim link and the 48-hour clock stay exactly as they are. They stop being the normal path
-- and become the fallback for a card that fails at the close.
-- ---------------------------------------------------------------

alter table public.bids
  -- The saved card, as Stripe knows it. Written only after the server has read the SetupIntent back
  -- from Stripe and confirmed it succeeded, so a payment method id from a browser is never trusted.
  add column if not exists stripe_payment_method_id text,
  -- The SetupIntent it came from. Kept for tracing a bid back to the moment its card was stored.
  add column if not exists stripe_setup_intent_id text;

-- A bid that has been charged points at what paid it, so a retried close cannot charge twice and a
-- support question can be answered without going to the Stripe dashboard.
alter table public.bids
  add column if not exists charged_purchase_id uuid references public.purchases(id) on delete set null;

create unique index if not exists bids_charged_purchase_idx
  on public.bids (charged_purchase_id) where charged_purchase_id is not null;

-- ---------------------------------------------------------------
-- These three columns are not in the select grant that 0022 wrote for bids, which names its columns
-- explicitly (id, lot_id, amount_cents, anonymous, passed_at, created_at). Nothing more is granted
-- here on purpose: a card id is not board data, and bids are written by the service role only.
--
-- Stated rather than done, because the safest change to that grant is no change at all. If a future
-- migration widens it, these columns must not be swept in.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- Where the failure goes.
--
-- An off-session charge can fail for reasons that have nothing to do with intent: a card that needs
-- 3-D Secure cannot be authenticated with nobody present, a balance can be short, a card can have
-- expired between the bid and the close. The reason is recorded on the lot so the act and Door
-- Money can tell "this patron was never going to pay" from "the bank wanted the patron there".
-- ---------------------------------------------------------------
alter table public.lots
  add column if not exists funding_charge_error text;

-- ---------------------------------------------------------------
-- patrons closes, which 0022 never got to.
--
-- 0022 revoked and re-granted acts, lots, bids and profiles column by column. patrons was left with
-- the blanket grant a Supabase project starts with. Nothing leaked, because no RLS policy on
-- patrons lets an anonymous caller see a row, so the count has always come back zero. But the grant
-- was the only thing standing between a future policy and every patron's email address, and from
-- today it would also stand in front of stripe_customer_id.
--
-- Nothing reads patrons through the Data API. Every read in the app goes through the service role,
-- which is unaffected by grants, and the four views that touch patrons (lot_buyers, patron_names,
-- public_bids, run_backers) are security_invoker=false, so they run as their owner and keep working.
-- All of that was checked against a real Postgres before this was written, because 0022 taught the
-- expensive version of this lesson: revoking a column that an inline RLS policy needed took every
-- board to 404.
-- ---------------------------------------------------------------
revoke select on public.patrons from anon, authenticated;
