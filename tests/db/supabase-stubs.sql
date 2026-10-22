-- Minimal stand-ins for the Supabase pieces schema.sql relies on, so the real
-- SQL files can run on plain Postgres (PGlite) for offline testing.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
alter table storage.objects enable row level security;

create schema if not exists extensions;
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid
$$;
create or replace function cron.unschedule(p_jobid bigint) returns boolean language sql as $$
  delete from cron.job where jobid = p_jobid returning true
$$;

do $$ begin create publication supabase_realtime; exception when others then null; end $$;

-- pgcrypto stand-in (test only)
create or replace function public.gen_random_bytes(n integer) returns bytea language sql volatile as $$
  select decode(substr(md5(random()::text || clock_timestamp()::text) || md5(random()::text || n::text), 1, n * 2), 'hex')
$$;
