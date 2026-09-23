-- A fundraiser is not published while a sponsorship option on it lacks the terms a sponsor reads
-- before paying, and the options that were on sale before this rule are left as they are.
--
-- The product contract lists what an offer states before a purchase (placement and format, how
-- many appearances or a schedule, when it is delivered by, who it reaches, the basis of any reach
-- estimate, who pays production, what exclusivity covers, what the sponsor provides and who accepts
-- it, at least one deliverable, and how each one is documented). Since 0056 the application asks
-- for all of it and refuses none of it: a draft saves whatever is written. Publishing is where the
-- question has to be answered, and until now nothing asked it. `publishRun` counted spots, and the
-- 0041 trigger checks the fundraiser's three sentences, so an option with a price and nothing else
-- could go on sale, from the dashboard or from a direct update of `runs.status`.
--
-- Two things this does.
--
--   1. `lots.terms_grandfathered`. Written once, here, and by nothing else: true for every spot that
--      exists at this moment on a fundraiser that has already been published (`runs.category_locked`,
--      which 0038 and 0041 set the first time a fundraiser leaves draft and never clear). Those are
--      the options that were eligible before this rule, and the ones sponsors have already read.
--      A spot made after this migration starts false, on every fundraiser, old or new. So taking an
--      older fundraiser down, adding an option and putting it back up holds the new option to the
--      rule and the old ones to nothing, which is the compatibility rule in one column. No client
--      may write it: it is in no insert or update grant.
--
--   2. `guard_publication_offer_terms`, before `runs.status` moves from draft to open or live, for
--      every role. It refuses while any spot on the fundraiser is open, not grandfathered, has no
--      sibling on the same template that is bid on or sold, and fails `offer_terms_complete`. A spot
--      whose template has a frozen sibling is exempt because its terms are the purchased ones,
--      copied from that sibling (src/app/actions/lots.ts, `termsFor`; 0035 and 0056 freeze them),
--      and it would otherwise be a spot nobody could ever finish.
--
-- `offer_terms_complete` is the product contract's list in SQL, and it has to say the same thing
-- as `offerTermsRequirements` in src/lib/offer-terms.ts, which is what the builder shows as
-- "Still missing" and what `publishRun` refuses on. Change one, change both.
--
-- What it does not do. It rewrites no term on any spot, grandfathered or not. It does not touch
-- `purchase_snapshots`, `lots.offer_terms`, or any spot that is bid on or sold. It does not stop a
-- fundraiser being taken down, or a grandfathered one going back up. It does not widen any grant:
-- `authenticated` may read the new column, and nobody may write it.
--
-- Numbered 0060: 0059 is on main and applied to the hosted project.
begin;

alter table public.lots add column terms_grandfathered boolean not null default false;
comment on column public.lots.terms_grandfathered is
  'True for a spot that was on a fundraiser already published when 0060 ran: its offer terms are not required for the fundraiser to publish again. Written by that migration only.';

update public.lots l
   set terms_grandfathered = true
  from public.runs r
 where r.id = l.run_id
   and r.category_locked;

-- The organizer reads it, so the checklist can say which options the rule applies to. Nobody writes it.
grant select (terms_grandfathered) on public.lots to authenticated;

-- The product contract's list, in the same order as offerTermsRequirements. An empty document fails
-- every line. A reach estimate is the lot's own column and needs its basis (0053 already refuses
-- the pair stored apart; this repeats the question for a row written before that).
create function public.offer_terms_complete(terms jsonb, reach_estimate integer, reach_basis text)
returns boolean language sql immutable as $$
  select
        nullif(btrim(terms #>> '{placement,description}'), '') is not null
    and nullif(btrim(terms #>> '{placement,format}'), '') is not null
    and (nullif(terms #>> '{appearances,quantity}', '') is not null or nullif(btrim(terms #>> '{appearances,schedule}'), '') is not null)
    and (nullif(terms #>> '{delivery_window,ends_on}', '') is not null or nullif(terms #>> '{delivery_window,deadline_on}', '') is not null)
    and nullif(btrim(terms #>> '{audience,description}'), '') is not null
    and (reach_estimate is null or nullif(btrim(reach_basis), '') is not null)
    and ((terms #>> '{production,included}') = 'true' or nullif(terms #>> '{production,who_pays}', '') is not null)
    and ((terms #>> '{exclusivity,exclusive}') is distinct from 'true' or nullif(btrim(terms #>> '{exclusivity,scope}'), '') is not null)
    and (nullif(terms #>> '{sponsor_materials,type}', '') is not null or nullif(btrim(terms #>> '{sponsor_materials,description}'), '') is not null)
    and ((terms #>> '{sponsor_materials,type}') = 'none' or nullif(terms #>> '{approval,rule}', '') is not null)
    and coalesce(jsonb_array_length(case when jsonb_typeof(terms -> 'deliverables') = 'array' then terms -> 'deliverables' end), 0) > 0
    and not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(terms -> 'deliverables') = 'array' then terms -> 'deliverables' else '[]'::jsonb end) d
       where nullif(d ->> 'evidence_method', '') is null
    )
$$;
revoke all on function public.offer_terms_complete(jsonb, integer, text) from public, anon, authenticated;

-- Security definer for the reason 0041 gives: the check has to read every spot on the fundraiser,
-- whatever the role moving the status. It accepts no caller-supplied identity and exposes no row.
create function public.guard_publication_offer_terms()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare unfinished text;
begin
  if old.status = 'draft' and new.status in ('open', 'live') then
    select l.surface_key into unfinished
      from public.lots l
     where l.run_id = new.id
       and l.status = 'open'
       and not l.terms_grandfathered
       and not exists (
         select 1 from public.lots f
          where f.run_id = l.run_id and f.surface_key = l.surface_key and f.status <> 'open'
       )
       and not public.offer_terms_complete(coalesce(l.offer_terms, '{}'::jsonb), l.reach_estimate, l.reach_basis)
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
revoke all on function public.guard_publication_offer_terms() from public, anon, authenticated;

create trigger runs_guard_publication_offer_terms
  before update of status on public.runs
  for each row execute function public.guard_publication_offer_terms();

commit;
