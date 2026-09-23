-- ---------------------------------------------------------------
-- An organizer's public address, claimed for the organizer alone.
--
-- Decision 8 gave every account one word doing two jobs, the sign-in handle and the organizer's
-- public address, and claim_username (migration 0024) moves the pair in one transaction. That is
-- right while the organizer *is* the account holder: whoever signs in as `gutter-hymns` is the
-- one whose page is at /gutter-hymns.
--
-- It stops being right the moment an account stands up a business, a team or a group. Harbor House
-- is not a credential. Suggesting /harbor-house on the setup screen must never rename the word
-- somebody signs in with, and 0024 had no way to say so: every path into an address went through
-- claim_username, which always moved both.
--
-- So this adds the second door rather than replacing the first:
--
--   claim_username   the person's word. Still moves an act's address with it, but only the act
--                    that was holding that same word (below).
--   claim_act_slug   the organizer's word, and nothing else. profiles.username is never read for
--                    a write and never written.
--
-- Both take the same advisory lock on the same string, so the two doors cannot hand one word to
-- two holders. Nothing here changes an existing row: every act today holds its owner's username,
-- which is exactly the case both functions leave alone.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- 1. Claiming a word for an organizer, without touching the account's credentials.
--
-- Creates the organizer row, because the word and the row it belongs to have to arrive in one
-- transaction: reserving a slug against a row that does not exist yet is not something a unique
-- index can hold. Only name, slug and owner are written here. Everything optional is written
-- afterwards by the caller, under the owner's own session and its row level security.
--
-- It also renames an organizer that is holding a word of its own, because an organization that
-- cannot correct its own address is worse than one that can: the word it leaves behind goes to
-- username_history, so nobody else is ever given it and the old address redirects, exactly as a
-- retired handle does.
--
-- One case it refuses: an organizer whose address *is* the account's handle. That pair is decision
-- 8's, it moves once every twelve months, and it moves through claim_username. 'is_handle' says so.
-- ---------------------------------------------------------------
create or replace function public.claim_act_slug(p_user_id uuid, p_slug text, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_act_id uuid;
  v_slug text;
  v_username text;
begin
  if p_user_id is null then
    return 'no_account';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$' then
    return 'invalid';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 then
    return 'invalid_name';
  end if;

  -- The same lock claim_username takes, on the same string. One word, one queue, whichever door
  -- it is claimed through.
  perform pg_advisory_xact_lock(hashtext('doormoney.username:' || p_slug));

  select username into v_username from profiles where id = p_user_id;
  if not found then
    return 'no_account';
  end if;

  -- One organizer per account (acts_one_per_owner, migration 0022), so this is the one or none.
  select id, slug into v_act_id, v_slug from acts where owner_id = p_user_id order by created_at limit 1;

  -- Saying the same word again is not a change, which is what makes a second submit harmless.
  if v_act_id is not null and v_slug = p_slug then
    return 'ok';
  end if;

  -- The organizer's address is the account's handle. That pair belongs to claim_username, which
  -- holds the twelve-month rule and moves both together.
  if v_act_id is not null and v_username is not null and v_slug = v_username then
    return 'is_handle';
  end if;

  if exists (select 1 from reserved_handles r where r.name = p_slug) then
    return 'reserved';
  end if;

  -- Held by another account, as a handle or as an organizer's address, or retired by one before.
  -- The same three places claim_username looks, so neither door can hand out the other's word.
  if exists (select 1 from profiles where username = p_slug and id <> p_user_id)
     or exists (select 1 from acts where slug = p_slug and owner_id is distinct from p_user_id)
     or exists (select 1 from username_history where username = p_slug and profile_id <> p_user_id)
  then
    return 'taken';
  end if;

  if v_act_id is not null then
    -- The word it leaves behind is kept for good, so nobody else is given it and /<old> still
    -- knows where this organizer went. currentSlugFor reads exactly this row.
    perform pg_advisory_xact_lock(hashtext('doormoney.username:' || v_slug));
    insert into username_history (profile_id, username)
    values (p_user_id, v_slug)
    on conflict (username) do nothing;
    update acts set slug = p_slug where id = v_act_id;
    return 'ok';
  end if;

  insert into acts (owner_id, slug, name) values (p_user_id, p_slug, btrim(p_name));

  -- profiles.username is deliberately not read and not written. Setting up an organizer never
  -- changes what somebody signs in with.
  return 'ok';
exception
  when unique_violation then
    return 'taken';
end;
$$;

comment on function public.claim_act_slug(uuid, text, text) is
  'Claims a public address for a new organizer and creates the row. Never reads or writes profiles.username.';

revoke all on function public.claim_act_slug(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_act_slug(uuid, text, text) to service_role;

-- ---------------------------------------------------------------
-- 2. claim_username moves the address that was the username, and no other.
--
-- 0024 moved whichever organizer the account owned, whatever word it was holding. That was the
-- one-word promise, and it holds as long as the two words are one. Now that an organizer can hold
-- a word of its own, the same line would rename a business because its owner changed the name they
-- sign in with, and the links to it would rot without anybody being asked.
--
-- So the move is conditional on what it was always assuming: the organizer is moved when it is
-- holding the word being retired. Every row that exists today satisfies that, so this changes the
-- outcome for nothing already stored.
-- ---------------------------------------------------------------
create or replace function public.claim_username(p_user_id uuid, p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_set_at timestamptz;
  v_act_id uuid;
  v_act_slug text;
begin
  if p_username is null or p_username !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$' then
    return 'invalid';
  end if;

  -- Serialise every claim on this word. Held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtext('doormoney.username:' || p_username));

  select username, username_set_at into v_current, v_set_at
    from profiles where id = p_user_id for update;
  if not found then
    return 'no_account';
  end if;

  -- Already theirs. Saying the same word again is not a change and does not restart the year.
  if v_current is not distinct from p_username then
    return 'ok';
  end if;

  if v_current is not null then
    perform pg_advisory_xact_lock(hashtext('doormoney.username:' || v_current));
    if v_set_at is not null and now() < v_set_at + interval '12 months' then
      return 'too_soon';
    end if;
  end if;

  -- Held by another account, as a handle or as an organizer's address, or retired by one before.
  if exists (select 1 from profiles where username = p_username and id <> p_user_id)
     or exists (select 1 from acts where slug = p_username and owner_id is distinct from p_user_id)
     or exists (select 1 from username_history where username = p_username and profile_id <> p_user_id)
  then
    return 'taken';
  end if;

  if v_current is not null then
    insert into username_history (profile_id, username)
    values (p_user_id, v_current)
    on conflict (username) do nothing;
  end if;

  update profiles set username = p_username, username_set_at = now() where id = p_user_id;

  -- One word, both addresses, for the organizer that was holding that word. The word it leaves
  -- behind redirects, because it is in the history now. An organizer holding a word of its own
  -- keeps it: it was never this account's handle, and nothing here asked to move it.
  select id, slug into v_act_id, v_act_slug from acts where owner_id = p_user_id order by created_at limit 1;
  if v_act_id is not null and v_current is not null and v_act_slug = v_current then
    update acts set slug = p_username where id = v_act_id;
  end if;

  return 'ok';
exception
  when unique_violation then
    return 'taken';
end;
$$;

revoke all on function public.claim_username(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_username(uuid, text) to service_role;
