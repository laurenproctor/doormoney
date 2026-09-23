-- A sponsorship option on a public fundraiser keeps complete offer terms, whoever writes it, and a
-- spot is exempt for its sold sibling's sake only while it carries that sibling's document.
--
-- 0060 asks the question when a fundraiser moves from draft to open. It does not ask it again
-- afterwards, and after publication the spots keep changing: the organizer adds an option, adds a
-- spot, edits the terms. `saveLots` writes those rows under the organizer's own session, and so
-- could any authenticated client through the Data API, because the column grants from 0022, 0053
-- and 0056 allow it. So an option with a price and nothing else could be added to a public
-- fundraiser, and the terms of an unsold option could be emptied out from under its page, with
-- neither trigger looking. This closes that: the same predicate 0060 applies at publication is
-- applied to every insert and update of a spot whose fundraiser is already open or live.
--
-- The predicate is `lot_offer_terms_unfinished`, one function both triggers call, so the two gates
-- cannot disagree. Held to the rule: a spot that is open, not grandfathered (0060), and on a
-- fundraiser that is public. Exempt for a frozen sibling: only when a bid-on or sold spot on the
-- same template carries the same offer terms document (jsonb equality), because that is what
-- `saveLots` copies onto a spot added beside a sale (src/app/actions/lots.ts, `termsFor`) and it
-- is the document the sponsor bought. Sharing the template with an empty or different document
-- exempts nothing. 0060's own trigger is replaced here to say the same.
--
-- What this leaves alone. A private draft saves a partial option exactly as before: the fundraiser
-- is not public, so the predicate is not asked. A grandfathered spot is never held to it, whatever
-- is written on it. A spot that is bid on or sold is not open and is not asked either; its terms
-- are frozen by 0035 and 0056 regardless. Nothing here rewrites a term or touches a snapshot, and
-- no grant changes.
--
-- Numbered 0061: 0060 is on this branch and has been applied to a database, so it is not edited.
begin;

-- The one question. `lot_id` is the row's own id, left out of the sibling search on an update.
create function public.lot_offer_terms_unfinished(
  lot_id uuid, run_id uuid, surface_key text, lot_status public.lot_status, grandfathered boolean,
  terms jsonb, reach_estimate integer, reach_basis text
) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select lot_status = 'open'
     and not grandfathered
     and not public.offer_terms_complete(coalesce(terms, '{}'::jsonb), reach_estimate, reach_basis)
     and not exists (
       select 1 from public.lots f
        where f.run_id = lot_offer_terms_unfinished.run_id
          and f.surface_key = lot_offer_terms_unfinished.surface_key
          and f.status <> 'open'
          and (lot_id is null or f.id <> lot_id)
          and coalesce(f.offer_terms, '{}'::jsonb) = coalesce(terms, '{}'::jsonb)
     )
$$;
revoke all on function public.lot_offer_terms_unfinished(uuid, uuid, text, public.lot_status, boolean, jsonb, integer, text) from public, anon, authenticated;

-- 0060's gate, on the shared predicate.
create or replace function public.guard_publication_offer_terms()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare unfinished text;
begin
  if old.status = 'draft' and new.status in ('open', 'live') then
    select l.surface_key into unfinished
      from public.lots l
     where l.run_id = new.id
       and public.lot_offer_terms_unfinished(l.id, l.run_id, l.surface_key, l.status, l.terms_grandfathered, l.offer_terms, l.reach_estimate, l.reach_basis)
     order by l.created_at
     limit 1;
    if unfinished is not null then
      raise exception 'a published fundraiser cannot carry a sponsorship option whose offer terms are incomplete: %', unfinished
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- The same gate on the spot itself, once its fundraiser is public. Every role: the organizer's
-- session through the dashboard, an authenticated client through the Data API, the service role.
create function public.guard_public_lot_terms()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare fundraiser_status public.run_status;
begin
  select status into fundraiser_status from public.runs where id = new.run_id;
  if fundraiser_status in ('open', 'live')
     and public.lot_offer_terms_unfinished(new.id, new.run_id, new.surface_key, new.status, new.terms_grandfathered, new.offer_terms, new.reach_estimate, new.reach_basis) then
    raise exception 'a sponsorship option on a public fundraiser needs complete offer terms: %', new.surface_key
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_public_lot_terms() from public, anon, authenticated;

create trigger lots_guard_public_terms
  before insert or update on public.lots
  for each row execute function public.guard_public_lot_terms();

commit;
