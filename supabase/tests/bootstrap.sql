-- Enough of a Supabase project for the migrations and permissions_test.sql to run on plain
-- Postgres, so the Phase 1 gate can be a CI job rather than something somebody remembers to run.
--
-- This is a stand-in, not a copy. It provides exactly what the migrations and the tests reach for:
-- the three API roles, the default grants a Supabase project hands out, an auth schema with the
-- three columns the sign-up trigger reads, auth.uid(), the storage tables migration 0006 puts
-- policies on, and the realtime publication migration 0011 adds to.
--
-- Run this as a superuser against an empty database, before applying supabase/migrations.

-- ---------------------------------------------------------------
-- 1. The three roles PostgREST authenticates as. Roles are cluster-wide and survive a dropped
--    database, so each one is created only if it is not already there.
-- ---------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. The default grants, and why they matter more than they look.
--
-- A real Supabase project hands anon and authenticated a blanket grant on every table in public,
-- which is what migration 0022 spends its length taking back. Without these lines every table
-- starts out unreadable, every "refuses" assertion passes for the wrong reason, and a missing
-- grant is indistinguishable from a working policy. Set before the migrations create anything, so
-- tables inherit the grant the way they do on a real project.
-- ---------------------------------------------------------------
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 2b. extensions. A Supabase project keeps its extensions out of public, and permissions_test.sql
--     installs pgTAP there. The schema has to be on the search path too, or plan() and lives_ok()
--     are unresolvable names the moment the test file starts.
-- ---------------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
do $$ begin
  execute format('alter database %I set search_path = public, extensions', current_database());
end $$;

-- ---------------------------------------------------------------
-- 3. auth. The sign-up trigger in 0005 reads id, email and raw_user_meta_data off the new row;
--    permissions_test.sql inserts the columns a real auth.users carries, so they exist here too.
-- ---------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The tests set request.jwt.claims, which is what Supabase's own auth.uid() reads. The older
-- request.jwt.claim.sub is accepted too, so a psql session can become a user with one set_config.
--
-- The empty string has to be nulled out *before* the jsonb cast, not after. An anonymous caller
-- clears the setting, current_setting then returns '' rather than null, and ''::jsonb raises
-- 22P02 inside whatever policy called auth.uid(). Real Supabase nulls it in the same place.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''),
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )::uuid;
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. storage. Migration 0006 creates a bucket and puts policies on objects, so both tables need
--    the columns it names. Nothing here stores a file; the rows only have to be addressable.
-- ---------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  path_tokens text[],
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. Realtime. Migration 0011 adds bids to this publication, which has to exist first.
-- ---------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
