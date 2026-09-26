create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- service_role normally bypasses grants/RLS entirely by default in a
-- Supabase project — this project's service_role has been observed
-- returning "permission denied for table ..." on plain REST/table queries
-- (confirmed for profiles and judge_invites; see notify-judge-invite and
-- create-organizer, both of which had to work around it) even though its
-- Admin Auth API calls (createUser, listUsers, etc.) work fine — those are
-- a separate code path that only checks the JWT's role claim, not this
-- schema's table grants. Explicit grants here fix the REST/table side.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

create table if not exists public.profiles (
  id text primary key,
  email text,
  full_name text,
  role text default 'participant',
  avatar_url text,
  status text default 'active',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.events (
  id bigint primary key,
  title text not null,
  type text default 'contest',
  organizer_id bigint,
  participants integer default 0,
  max_participants integer,
  metadata jsonb default '{}'::jsonb,
  criteria jsonb default '[]'::jsonb,
  contestants jsonb default '[]'::jsonb,
  judges jsonb default '[]'::jsonb,
  sub_events jsonb default '[]'::jsonb,
  approval_workflow jsonb default '[]'::jsonb,
  external_judge_invites jsonb default '[]'::jsonb,
  audience_attendance integer default 0,
  attendance_tracking boolean default false,
  tournament_format text default 'single',
  status text default 'draft',
  start_date timestamptz,
  end_date timestamptz,
  scheduled_date timestamptz,
  location text,
  enable_certificates boolean default false,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.teams (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  name text not null,
  members jsonb default '[]'::jsonb,
  coach_name text,
  school_name text,
  division text,
  status text default 'active',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.registrations (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  participant_id bigint,
  team_id bigint references public.teams(id) on delete set null,
  participant_name text not null,
  email text,
  category text,
  status text default 'pending',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.scores (
  id text primary key,
  event_id bigint references public.events(id) on delete cascade,
  judge_id bigint,
  participant_id bigint,
  team_id bigint references public.teams(id) on delete set null,
  criteria_scores jsonb default '[]'::jsonb,
  comments jsonb default '{}'::jsonb,
  total_score numeric(10,2) default 0,
  remarks text,
  round_name text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.audience_scores (
  id text primary key,
  event_id bigint references public.events(id) on delete cascade,
  contestant_id text not null,
  contestant_name text,
  voter_key text not null,
  score numeric(10,2) not null check (score >= 1 and score <= 10),
  created_at timestamptz default timezone('utc', now()),
  unique(event_id, contestant_id, voter_key)
);

create table if not exists public.judges (
  id bigint primary key,
  name text not null,
  email text,
  role text default 'judge',
  specialty text,
  status text default 'active',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.judge_assignments (
  id text primary key,
  judge_id bigint references public.judges(id) on delete cascade,
  event_id bigint references public.events(id) on delete cascade,
  sub_event_id text,
  assigned_at timestamptz default timezone('utc', now()),
  status text default 'assigned',
  notes text
);

create table if not exists public.attendance (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  participant_id bigint,
  participant_name text not null,
  qr_code text,
  checked_in_at timestamptz default timezone('utc', now()),
  status text default 'present'
);

create table if not exists public.certificates (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  participant_id bigint,
  participant_name text not null,
  certificate_type text default 'participation',
  file_url text,
  metadata jsonb default '{}'::jsonb,
  issued_at timestamptz default timezone('utc', now())
);

create table if not exists public.notifications (
  id text primary key,
  title text not null,
  message text not null,
  type text default 'info',
  category text default 'system',
  target_roles text[] default '{}',
  target_user_ids text[] default '{}',
  target_emails text[] default '{}',
  source_key text,
  entity_type text,
  entity_id text,
  action_url text,
  is_read boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.tournaments (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  name text not null,
  format text default 'single',
  bracket jsonb default '{}'::jsonb,
  standings jsonb default '[]'::jsonb,
  status text default 'draft',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.event_categories (
  id bigint primary key,
  name text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  status text default 'active',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.event_locations (
  id bigint primary key,
  name text not null,
  address text,
  venue text,
  metadata jsonb default '{}'::jsonb,
  status text default 'active',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.team_members (
  id bigint primary key,
  team_id bigint references public.teams(id) on delete cascade,
  name text not null,
  email text,
  role text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.solo_participants (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  status text default 'active',
  category text default 'solo',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.brackets (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  name text not null,
  description text,
  format text default 'single',
  status text default 'draft',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.matches (
  id bigint primary key,
  bracket_id bigint references public.brackets(id) on delete cascade,
  round_number integer default 1,
  match_order integer default 0,
  participant_a_id text,
  participant_b_id text,
  participant_a_name text,
  participant_b_name text,
  winner_id text,
  score_a numeric(10,2) default 0,
  score_b numeric(10,2) default 0,
  status text default 'pending',
  scheduled_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.match_participants (
  id bigint primary key,
  match_id bigint references public.matches(id) on delete cascade,
  participant_id text,
  team_id bigint references public.teams(id) on delete set null,
  participant_name text,
  score numeric(10,2) default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.judge_status_logs (
  id bigint primary key,
  judge_id bigint references public.judges(id) on delete cascade,
  event_id bigint references public.events(id) on delete set null,
  status text default 'active',
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.ai_detections (
  id text primary key,
  target_type text not null default 'system',
  target_id text,
  target_name text,
  actor_id text,
  actor_name text,
  risk_level text not null default 'low',
  status text not null default 'open',
  reason text not null,
  metadata jsonb default '{}'::jsonb,
  detected_at timestamptz default timezone('utc', now()),
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.events add column if not exists description text;
alter table public.events add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.events add column if not exists audience_impact_enabled boolean default false;
alter table public.events add column if not exists audience_impact_weight numeric(5,2) default 10;
alter table public.events add column if not exists audience_voting_open boolean default false;
alter table public.events add column if not exists audience_qr_token text;

alter table public.teams add column if not exists players jsonb default '[]'::jsonb;
alter table public.teams add column if not exists stats jsonb default '{}'::jsonb;
alter table public.team_members add column if not exists school_year text;

alter table public.registrations add column if not exists registration_type text default 'individual';
alter table public.registrations add column if not exists team_name text;
alter table public.registrations add column if not exists roster jsonb default '[]'::jsonb;
alter table public.registrations add column if not exists individual_details jsonb default '{}'::jsonb;

-- Re-running this file on a database that already has the scores RLS
-- policies from a previous run (defined much further down, around the
-- "Score immutability" section) hits "cannot alter type of a column used in
-- a policy definition" here otherwise — those policies' WITH CHECK clauses
-- call judge_assignment_revoked(judge_id, ...), which depends on judge_id's
-- type. Dropping them before the type change and letting the later
-- create policy statements recreate them keeps this file safely re-runnable
-- on a fresh database (nothing to drop, silent no-op) and on one that has
-- already been through a previous run.
drop policy if exists "Scores can be inserted unlocked" on public.scores;
drop policy if exists "Unlocked scores can be updated" on public.scores;

alter table public.scores alter column id type text using id::text;
alter table public.scores alter column judge_id type text using judge_id::text;

-- judge_assignments.id was originally bigint, same as scores.id above, but
-- every write path (claim_judge_invite, JudgeSessionGate.jsx, judgeStore.js)
-- has always built it as a composite "{judgeId}_{eventId}" string — a value
-- like '12345_67' was never a valid bigint literal, so every one of those
-- inserts/upserts has been silently failing (or, for claim_judge_invite,
-- visibly erroring with "column 'id' is of type bigint but expression is of
-- type text") until this migration brings the column in line with what the
-- application has assumed all along.
alter table public.judge_assignments alter column id type text using id::text;
alter table public.scores add column if not exists contestant_id text;
alter table public.scores add column if not exists contestant_name text;
alter table public.scores add column if not exists event_title text;
alter table public.scores add column if not exists judge_name text;
alter table public.scores add column if not exists comments jsonb default '{}'::jsonb;
alter table public.scores add column if not exists locked boolean default false;
alter table public.scores add column if not exists locked_at timestamptz;

alter table public.judges add column if not exists score_count integer default 0;

alter table public.attendance alter column id type text using id::text;
alter table public.attendance add column if not exists sub_event_id text;
alter table public.attendance add column if not exists attendee_id text;
alter table public.attendance add column if not exists attendee_name text;
alter table public.attendance add column if not exists attendee_type text default 'participant';
alter table public.attendance add column if not exists role text default 'participant';
alter table public.attendance add column if not exists qr_token text;
alter table public.attendance add column if not exists scanner_id text;
alter table public.attendance add column if not exists source text default 'manual';
alter table public.attendance add column if not exists notes text;
alter table public.attendance add column if not exists check_in_status text default 'checked-in';
alter table public.attendance add column if not exists metadata jsonb default '{}'::jsonb;
update public.attendance
set
  attendee_id = coalesce(attendee_id, participant_id::text),
  attendee_name = coalesce(attendee_name, participant_name),
  attendee_type = coalesce(attendee_type, 'participant'),
  role = coalesce(role, 'participant'),
  check_in_status = coalesce(check_in_status, 'checked-in')
where attendee_name is null or attendee_id is null;

-- The old columns above are superseded by attendee_id/attendee_name/etc.
-- (nothing in the app reads or writes participant_id, participant_name,
-- qr_code, or status anymore — see normalizeAttendance in
-- attendanceStore.js) and should have been dropped once the backfill above
-- ran. Instead `participant_name text not null` was left behind, so every
-- check-in insert since has failed with a 23502 not-null-constraint error —
-- checkInAttendee() only recognizes error code 23505 (a duplicate) as a
-- non-fatal case, so this one always re-threw and got surfaced to the
-- organizer as a generic "Unable to save this check-in," with nothing ever
-- actually reaching the attendance table.
alter table public.attendance drop column if exists participant_id;
alter table public.attendance drop column if exists participant_name;
alter table public.attendance drop column if exists qr_code;
alter table public.attendance drop column if exists status;

alter table public.certificates alter column id type text using id::text;
alter table public.certificates add column if not exists event_title text;
alter table public.certificates add column if not exists recipient_id text;
alter table public.certificates add column if not exists recipient_name text;
alter table public.certificates add column if not exists category text default 'participant';
alter table public.certificates add column if not exists placement integer;
alter table public.certificates add column if not exists score numeric(10,2);
alter table public.certificates add column if not exists status text default 'generated';
alter table public.certificates add column if not exists template jsonb default '{}'::jsonb;
alter table public.certificates add column if not exists notes text;
alter table public.certificates add column if not exists verification_code text;
alter table public.certificates add column if not exists verification_url text;
alter table public.certificates add column if not exists qr_value text;
alter table public.certificates add column if not exists updated_at timestamptz default timezone('utc', now());
update public.certificates
set
  recipient_id = coalesce(recipient_id, participant_id::text),
  recipient_name = coalesce(recipient_name, participant_name),
  category = coalesce(category, 'participant'),
  status = coalesce(status, 'generated')
where recipient_name is null or recipient_id is null;

alter table public.tournaments add column if not exists title text;
alter table public.tournaments alter column name drop not null;
alter table public.tournaments alter column name set default 'Tournament';
alter table public.tournaments add column if not exists bracket_type text default 'single';
alter table public.tournaments add column if not exists teams jsonb default '[]'::jsonb;
alter table public.tournaments add column if not exists matches jsonb default '[]'::jsonb;
alter table public.tournaments add column if not exists rounds jsonb default '[]'::jsonb;
alter table public.tournaments add column if not exists history_log jsonb default '[]'::jsonb;
alter table public.tournaments add column if not exists entrant_snapshot jsonb default '[]'::jsonb;
alter table public.tournaments add column if not exists current_round integer default 0;
alter table public.tournaments add column if not exists total_rounds integer default 0;
alter table public.tournaments add column if not exists total_slots integer default 0;
alter table public.tournaments add column if not exists byes integer default 0;
alter table public.tournaments add column if not exists live_status text default 'waiting';
alter table public.tournaments add column if not exists champion jsonb default '{}'::jsonb;
alter table public.tournaments add column if not exists is_locked boolean default false;
alter table public.tournaments add column if not exists is_published boolean default false;
alter table public.tournaments add column if not exists published_at timestamptz;
alter table public.tournaments add column if not exists last_synced_at timestamptz default timezone('utc', now());
alter table public.tournaments add column if not exists stream_title text;
alter table public.tournaments add column if not exists stream_message text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'participant';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists status text default 'active';
alter table public.profiles add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz default timezone('utc', now());
update public.tournaments
set
  title = coalesce(title, name),
  name = coalesce(name, title, 'Tournament'),
  bracket_type = coalesce(bracket_type, format, 'single'),
  history_log = coalesce(history_log, '[]'::jsonb),
  entrant_snapshot = coalesce(entrant_snapshot, teams, '[]'::jsonb)
where title is null or bracket_type is null or name is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

drop trigger if exists set_registrations_updated_at on public.registrations;
create trigger set_registrations_updated_at
before update on public.registrations
for each row execute function public.set_updated_at();

drop trigger if exists set_scores_updated_at on public.scores;
create trigger set_scores_updated_at
before update on public.scores
for each row execute function public.set_updated_at();

drop trigger if exists set_judges_updated_at on public.judges;
create trigger set_judges_updated_at
before update on public.judges
for each row execute function public.set_updated_at();

drop trigger if exists set_tournaments_updated_at on public.tournaments;
create trigger set_tournaments_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();

drop trigger if exists set_event_categories_updated_at on public.event_categories;
create trigger set_event_categories_updated_at
before update on public.event_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_event_locations_updated_at on public.event_locations;
create trigger set_event_locations_updated_at
before update on public.event_locations
for each row execute function public.set_updated_at();

drop trigger if exists set_team_members_updated_at on public.team_members;
create trigger set_team_members_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();

drop trigger if exists set_solo_participants_updated_at on public.solo_participants;
create trigger set_solo_participants_updated_at
before update on public.solo_participants
for each row execute function public.set_updated_at();

drop trigger if exists set_brackets_updated_at on public.brackets;
create trigger set_brackets_updated_at
before update on public.brackets
for each row execute function public.set_updated_at();

drop trigger if exists set_matches_updated_at on public.matches;
create trigger set_matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists set_match_participants_updated_at on public.match_participants;
create trigger set_match_participants_updated_at
before update on public.match_participants
for each row execute function public.set_updated_at();

drop trigger if exists set_judge_status_logs_updated_at on public.judge_status_logs;
create trigger set_judge_status_logs_updated_at
before update on public.judge_status_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.teams enable row level security;
alter table public.registrations enable row level security;
alter table public.scores enable row level security;
alter table public.audience_scores enable row level security;
alter table public.judges enable row level security;
alter table public.judge_assignments enable row level security;
alter table public.attendance enable row level security;
alter table public.certificates enable row level security;
alter table public.notifications enable row level security;
alter table public.tournaments enable row level security;
alter table public.event_categories enable row level security;
alter table public.event_locations enable row level security;
alter table public.team_members enable row level security;
alter table public.solo_participants enable row level security;
alter table public.brackets enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.judge_status_logs enable row level security;
alter table public.ai_detections enable row level security;

drop policy if exists "Profiles can read their own record" on public.profiles;
create policy "Profiles can read their own record"
on public.profiles for select
to anon, authenticated
using (auth.uid()::text = id);

drop policy if exists "Profiles can insert their own record" on public.profiles;
create policy "Profiles can insert their own record"
on public.profiles for insert
to anon, authenticated
with check (auth.uid()::text = id);

drop policy if exists "Allow organizer signup requests" on public.profiles;
create policy "Allow organizer signup requests"
on public.profiles for insert
to anon, authenticated
with check (role = 'organizer' and status = 'active');

drop policy if exists "Allow organizer signup request updates" on public.profiles;
create policy "Allow organizer signup request updates"
on public.profiles for update
to anon, authenticated
using (role = 'organizer')
with check (role = 'organizer' and status = 'active');

drop policy if exists "Profiles can update their own record" on public.profiles;
create policy "Profiles can update their own record"
on public.profiles for update
to anon, authenticated
using (auth.uid()::text = id)
with check (auth.uid()::text = id);

drop policy if exists "Allow profile list for demo dashboards" on public.profiles;
create policy "Allow profile list for demo dashboards"
on public.profiles for select
to anon, authenticated
using (true);

drop policy if exists "Allow profile management for demo dashboards" on public.profiles;
create policy "Allow profile management for demo dashboards"
on public.profiles for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to events" on public.events;
create policy "Allow anon full access to events"
on public.events for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to teams" on public.teams;
create policy "Allow anon full access to teams"
on public.teams for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to registrations" on public.registrations;
create policy "Allow anon full access to registrations"
on public.registrations for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to scores" on public.scores;
create policy "Allow anon full access to scores"
on public.scores for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to audience scores" on public.audience_scores;
create policy "Allow anon full access to audience scores"
on public.audience_scores for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to notifications" on public.notifications;
create policy "Allow anon full access to notifications"
on public.notifications for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to judges" on public.judges;
create policy "Allow anon full access to judges"
on public.judges for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to judge_assignments" on public.judge_assignments;
create policy "Allow anon full access to judge_assignments"
on public.judge_assignments for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to attendance" on public.attendance;
create policy "Allow anon full access to attendance"
on public.attendance for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to certificates" on public.certificates;
create policy "Allow anon full access to certificates"
on public.certificates for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to tournaments" on public.tournaments;
create policy "Allow anon full access to tournaments"
on public.tournaments for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to event_categories" on public.event_categories;
create policy "Allow anon full access to event_categories"
on public.event_categories for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to event_locations" on public.event_locations;
create policy "Allow anon full access to event_locations"
on public.event_locations for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to team_members" on public.team_members;
create policy "Allow anon full access to team_members"
on public.team_members for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to solo_participants" on public.solo_participants;
create policy "Allow anon full access to solo_participants"
on public.solo_participants for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to brackets" on public.brackets;
create policy "Allow anon full access to brackets"
on public.brackets for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to matches" on public.matches;
create policy "Allow anon full access to matches"
on public.matches for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to match_participants" on public.match_participants;
create policy "Allow anon full access to match_participants"
on public.match_participants for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow anon full access to judge_status_logs" on public.judge_status_logs;
create policy "Allow anon full access to judge_status_logs"
on public.judge_status_logs for all
to anon, authenticated
using (true)
with check (true);

drop trigger if exists set_ai_detections_updated_at on public.ai_detections;
create trigger set_ai_detections_updated_at
before update on public.ai_detections
for each row execute function public.set_updated_at();

drop policy if exists "Allow anon full access to ai_detections" on public.ai_detections;
create or replace function public.is_admin_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()::text
      and profiles.role = 'admin'
  );
$$;

drop policy if exists "Admins can manage ai_detections" on public.ai_detections;
create policy "Admins can manage ai_detections"
on public.ai_detections for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

-- ============================================================================
-- SECTION: Access-control hardening
-- Everything below tightens security without removing any existing working
-- flow. Re-running this whole file is safe (idempotent), same as above.
-- ============================================================================

create or replace function public.is_staff_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()::text
      and profiles.role in ('admin', 'organizer')
  );
$$;

-- ----------------------------------------------------------------------------
-- Judge invites: per-judge email invite with a unique, unguessable token.
-- No table grants for anon/authenticated at all — every read/write goes
-- through the SECURITY DEFINER functions below, or through the
-- notify-judge-invite edge function (service role, creates the row).
-- ----------------------------------------------------------------------------

create table if not exists public.judge_invites (
  id bigint primary key,
  event_id bigint references public.events(id) on delete cascade,
  event_title text,
  judge_email text not null,
  judge_name text not null,
  token text not null unique,
  status text not null default 'pending',
  created_at timestamptz default timezone('utc', now()),
  claimed_at timestamptz
);

alter table public.judge_invites enable row level security;

drop policy if exists "Staff can view judge invites" on public.judge_invites;
create policy "Staff can view judge invites"
on public.judge_invites for select
to authenticated
using (public.is_staff_user());

-- This table had SELECT covered but no INSERT policy, which silently made
-- creating an invite impossible for every caller regardless of role — the
-- notify-judge-invite Edge Function runs as the caller (not service role),
-- so RLS applies to its insert the same as it would to any client request.
drop policy if exists "Staff can create judge invites" on public.judge_invites;
create policy "Staff can create judge invites"
on public.judge_invites for insert
to authenticated
with check (public.is_staff_user());

create or replace function public.resolve_judge_invite(p_token text)
returns table (
  event_id bigint,
  event_title text,
  judge_name text,
  judge_email text,
  status text
)
language sql
security definer
set search_path = public
stable
as $$
  select event_id, event_title, judge_name, judge_email, status
  from public.judge_invites
  where token = p_token
  limit 1;
$$;

grant execute on function public.resolve_judge_invite(text) to anon, authenticated;

create or replace function public.claim_judge_invite(p_token text)
returns table (judge_id bigint, judge_name text, judge_email text, event_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.judge_invites%rowtype;
  v_judge_id bigint;
begin
  select * into v_invite from public.judge_invites where token = p_token limit 1;

  if v_invite.token is null or v_invite.status = 'revoked' then
    raise exception 'Invalid or revoked invite.';
  end if;

  select judges.id into v_judge_id
  from public.judges
  where judges.email = lower(trim(v_invite.judge_email))
  limit 1;

  if v_judge_id is null then
    v_judge_id := (extract(epoch from now()) * 1000)::bigint;
    insert into public.judges (id, name, email, status, score_count, created_at)
    values (v_judge_id, v_invite.judge_name, lower(trim(v_invite.judge_email)), 'active', 0, timezone('utc', now()));
  end if;

  -- Conflict target is the real identity constraint
  -- (judge_assignments_judge_event_unique on judge_id+event_id), not the
  -- synthetic `id` — a judge who already has an assignment row from an
  -- older insert path (a differently-formatted id) would otherwise hit a
  -- duplicate-key violation instead of being matched and updated.
  --
  -- Named by ON CONFLICT ON CONSTRAINT rather than ON CONFLICT (judge_id,
  -- event_id): this function's own `returns table` declares judge_id and
  -- event_id as implicit output variables, and plpgsql resolves a bare
  -- column list in that position against both the variables and the table's
  -- columns, which Postgres then rejects as ambiguous. A constraint name is
  -- a plain identifier, not a column reference, so it sidesteps that lookup
  -- entirely — this is exactly the same class of bug fixed above for
  -- revoke_judge_invite's `event_id`, just not fixable by table-qualifying
  -- since ON CONFLICT's column-list form can't take a table alias.
  insert into public.judge_assignments (id, judge_id, event_id, status, assigned_at)
  values (v_judge_id::text || '_' || v_invite.event_id::text, v_judge_id, v_invite.event_id, 'active', timezone('utc', now()))
  on conflict on constraint judge_assignments_judge_event_unique do update set status = 'active';

  update public.judge_invites
  set status = 'claimed', claimed_at = timezone('utc', now())
  where token = p_token;

  return query select v_judge_id, v_invite.judge_name, v_invite.judge_email, v_invite.event_id;
end;
$$;

grant execute on function public.claim_judge_invite(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Revoke a judge invite: lets an organizer/admin cut off a judge who was
-- already emailed a link but should no longer be able to enter the scoring
-- session (e.g. a no-show). One action covers both cases — not-yet-claimed
-- (the invite itself is flagged, so claim_judge_invite's existing revoked
-- check at claim time blocks it) and already-claimed (the matching
-- judge_assignments row is flagged too, so JudgeLiveScoring/JudgeSessionGate
-- and the scores RLS below can reject that judge going forward).
--
-- Flags every invite row for this judge+event, not just the one clicked.
-- A judge with more than one invite to the same event (a duplicate send, a
-- resend before this feature existed, leftover test data) would otherwise
-- still have an untouched, claimable invite sitting there — claiming it
-- runs the same on-conflict-do-update in claim_judge_invite and silently
-- resurrects the assignment we just revoked. Sending a genuinely brand-new
-- invite is still the intended "undo": it does not exist yet at revoke
-- time, so this update cannot touch it, and claiming it later still resets
-- the assignment via the existing on-conflict clause above.
-- ----------------------------------------------------------------------------

alter table public.judge_invites add column if not exists revoked_at timestamptz;
alter table public.judge_invites add column if not exists revoked_by text;

create or replace function public.revoke_judge_invite(p_invite_id bigint)
returns table (invite_id bigint, event_id bigint, assignment_revoked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.judge_invites%rowtype;
  v_judge_id bigint;
  v_hit boolean := false;
begin
  if not public.is_staff_user() then
    raise exception 'Organizer or admin access required.';
  end if;

  select * into v_invite from public.judge_invites where id = p_invite_id;
  if v_invite.id is null then
    raise exception 'Invite not found.';
  end if;

  -- Every invite for this exact judge_email + event, not just p_invite_id —
  -- see the comment above the function for why a single-row update leaves a
  -- resurrection path open.
  --
  -- Table-qualified for the same reason as judge_assignments' update below:
  -- bare `event_id` collides with this function's returns-table output
  -- column of the same name, and plpgsql picks the variable over the
  -- column, which Postgres then rejects as ambiguous.
  update public.judge_invites ji
  set status = 'revoked', revoked_at = timezone('utc', now()), revoked_by = auth.uid()::text
  where ji.event_id = v_invite.event_id
    and lower(trim(ji.judge_email)) = lower(trim(v_invite.judge_email));

  select judges.id into v_judge_id
  from public.judges
  where judges.email = lower(trim(v_invite.judge_email))
  limit 1;

  if v_judge_id is not null then
    -- Bare `event_id` here previously collided with the returns-table output
    -- column of the same name, plpgsql picked the wrong one, and Postgres
    -- rejected the whole statement as ambiguous — table-qualify it.
    update public.judge_assignments ja
    set status = 'revoked'
    where ja.judge_id = v_judge_id and ja.event_id = v_invite.event_id;
    v_hit := found;
  end if;

  return query select v_invite.id, v_invite.event_id, v_hit;
end;
$$;

revoke all on function public.revoke_judge_invite(bigint) from public, anon;
grant execute on function public.revoke_judge_invite(bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- Delete a judge invite record outright — for clearing out duplicates,
-- typos, and test entries so the list stays legible, distinct from revoke
-- (which keeps a record that access was cut off). Only removes the invite
-- row itself; the judge/assignment/scores it may have produced are left
-- alone, since those can be shared with other invites for the same
-- judge+event and deleting them here would be a much bigger, unrelated
-- blast radius than "tidy up this one row".
-- ----------------------------------------------------------------------------

create or replace function public.delete_judge_invite(p_invite_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff_user() then
    raise exception 'Organizer or admin access required.';
  end if;

  delete from public.judge_invites where id = p_invite_id;
  return found;
end;
$$;

revoke all on function public.delete_judge_invite(bigint) from public, anon;
grant execute on function public.delete_judge_invite(bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- Score immutability: once a score is locked, nothing can change or delete
-- it — not the app, not a direct API call, not a raw SQL session. The
-- trigger is the real guarantee (fires for every role, RLS or not); the RLS
-- policies below are a first line of defense for anon/authenticated callers.
-- ----------------------------------------------------------------------------

create or replace function public.prevent_locked_score_mutation()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.locked then
      raise exception 'Locked scores cannot be deleted.';
    end if;
    return OLD;
  end if;

  if OLD.locked then
    raise exception 'Locked scores cannot be modified.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists lock_scores_immutable on public.scores;
create trigger lock_scores_immutable
before update or delete on public.scores
for each row execute function public.prevent_locked_score_mutation();

drop policy if exists "Allow anon full access to scores" on public.scores;

drop policy if exists "Scores are readable by anyone" on public.scores;
create policy "Scores are readable by anyone"
on public.scores for select
to anon, authenticated
using (true);

-- Deny-list, not allow-list: scores.judge_id is left NULL by scoreStore.js's
-- own writes and by anonymous QR/audience scoring, so a policy that required
-- a matching judge_assignments row would break those existing, legitimate
-- write paths (NULL never matches, so this function returns false for them
-- and they pass through unaffected). This only blocks a judge_id that
-- matches an assignment the organizer has explicitly revoked.
create or replace function public.judge_assignment_revoked(p_judge_id text, p_event_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.judge_assignments ja
    where ja.judge_id::text = p_judge_id
      and ja.event_id = p_event_id
      and ja.status = 'revoked'
  );
$$;

grant execute on function public.judge_assignment_revoked(text, bigint) to anon, authenticated;

drop policy if exists "Scores can be inserted unlocked" on public.scores;
create policy "Scores can be inserted unlocked"
on public.scores for insert
to anon, authenticated
with check (
  coalesce(locked, false) = false
  and not public.judge_assignment_revoked(judge_id, event_id)
);

drop policy if exists "Unlocked scores can be updated" on public.scores;
create policy "Unlocked scores can be updated"
on public.scores for update
to anon, authenticated
using (coalesce(locked, false) = false)
with check (
  coalesce(locked, false) = false
  and not public.judge_assignment_revoked(judge_id, event_id)
);

drop policy if exists "Staff can delete scores" on public.scores;
create policy "Staff can delete scores"
on public.scores for delete
to authenticated
using (public.is_staff_user());

-- ----------------------------------------------------------------------------
-- profiles: close the role/status self-escalation hole. Any anon or
-- authenticated caller could previously PATCH their own row's `role` to
-- 'admin' via the old "Allow profile management for demo dashboards" policy.
-- Read access and self-updates to non-privileged fields stay open; only
-- role/status changes now require an admin (checked in a trigger, so it
-- can't be bypassed by any RLS policy that permits the underlying UPDATE).
-- ----------------------------------------------------------------------------

drop policy if exists "Allow profile management for demo dashboards" on public.profiles;

drop policy if exists "Admins can manage any profile" on public.profiles;
create policy "Admins can manage any profile"
on public.profiles for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if (NEW.role is distinct from OLD.role or NEW.status is distinct from OLD.status)
     and not public.is_admin_user() then
    raise exception 'Only admins can change role or status.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_profile_role_escalation on public.profiles;
create trigger guard_profile_role_escalation
before update on public.profiles
for each row execute function public.prevent_role_self_escalation();

-- ----------------------------------------------------------------------------
-- Everything else: read/write stays open (these flows are anonymous by
-- design — registration, audience voting, QR check-in), but DELETE is
-- narrowed to staff only. A RESTRICTIVE policy ANDs with the existing
-- permissive "using (true)" policies already on these tables, so only
-- DELETE is affected — nothing else changes.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'events', 'teams', 'tournaments', 'brackets', 'matches', 'match_participants',
    'event_categories', 'event_locations', 'judges', 'judge_assignments', 'judge_status_logs',
    'registrations', 'audience_scores', 'notifications', 'solo_participants', 'team_members',
    'certificates', 'attendance'
  ]
  loop
    execute format('drop policy if exists "Only staff can delete" on public.%I', t);
    execute format(
      'create policy "Only staff can delete" on public.%I as restrictive for delete to anon, authenticated using (public.is_staff_user())',
      t
    );
  end loop;
end $$;

-- ============================================================================
-- SECTION: Real authentication for organizer self-registration
-- The old flow never called supabase.auth.signUp() — it just inserted a
-- profiles row with a fake id and stored the password IN PLAINTEXT in
-- profiles.metadata.pendingPassword, readable by anyone who can select from
-- profiles. Registration now uses real Supabase Auth (bcrypt-hashed
-- passwords, a real auth.users row); this trigger creates the matching
-- profiles row automatically the moment someone signs up, reading the name/
-- role passed in supabase.auth.signUp()'s options.data.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'organizer');
begin
  -- Self-registered organizers start 'pending' and need an admin's approval
  -- (see approve_organizer in the section below) before they can sign in.
  -- Any other role reaching this trigger is created elsewhere by staff
  -- (judge invites, admin-created accounts), so it's trusted immediately.
  insert into public.profiles (id, email, full_name, role, status, created_at, updated_at)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    case when v_role = 'organizer' then 'pending' else 'active' end,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- The client no longer inserts its own profile row (the trigger above does
-- it, server-side, from a real authenticated signup) — these two policies
-- let ANY anon caller insert/update an "active organizer" profile with no
-- authentication at all. Removing them closes that self-service-abuse hole.
drop policy if exists "Allow organizer signup requests" on public.profiles;
drop policy if exists "Allow organizer signup request updates" on public.profiles;

-- ============================================================================
-- SECTION: Rubric template library
-- Lets organizers save a generated/edited rubric and reuse it for a future
-- event instead of regenerating one from scratch every time.
-- ============================================================================

create table if not exists public.rubric_templates (
  id bigint primary key,
  name text not null,
  event_type text,
  criteria jsonb not null default '[]'::jsonb,
  scoring_method text,
  tie_breaker jsonb default '[]'::jsonb,
  judge_instructions text,
  created_by text,
  created_at timestamptz default timezone('utc', now())
);

alter table public.rubric_templates enable row level security;

drop policy if exists "Staff can view rubric templates" on public.rubric_templates;
create policy "Staff can view rubric templates"
on public.rubric_templates for select
to authenticated
using (public.is_staff_user());

drop policy if exists "Staff can save rubric templates" on public.rubric_templates;
create policy "Staff can save rubric templates"
on public.rubric_templates for insert
to authenticated
with check (public.is_staff_user());

drop policy if exists "Staff can delete their rubric templates" on public.rubric_templates;
create policy "Staff can delete their rubric templates"
on public.rubric_templates for delete
to authenticated
using (public.is_staff_user());

-- ============================================================================
-- SECTION: Attendance check-in de-duplication
-- Two scanner devices checking the same badge in within the same instant can
-- both pass the client-side (in-memory) duplicate check before either write
-- lands, producing two "checked-in" rows for the same attendee. This adds a
-- real DB-level guard so the second insert fails fast instead of silently
-- succeeding, and the app treats that failure as "already checked in".
--
-- Only rows with a populated attendee_id are constrained (Postgres never
-- treats NULL = NULL, so anonymous/manual entries with no attendee_id are
-- unaffected and can still have any number of rows). A row's check_in_status
-- is part of the key on purpose: it only blocks two simultaneous
-- 'checked-in' rows for the same attendee at the same event — a later status
-- change (e.g. 'absent') is a different row and stays allowed.
--
-- The de-dupe step below removes any duplicates that already exist today
-- (keeping only the earliest 'checked-in' row per attendee/event) so the
-- constraint can be added without failing on old data. Re-running this
-- section is safe: once de-duped, there is nothing left to delete, and the
-- constraint is only added if it doesn't already exist.
-- ============================================================================

delete from public.attendance a
using public.attendance b
where a.event_id = b.event_id
  and a.attendee_id = b.attendee_id
  and a.check_in_status = b.check_in_status
  and a.check_in_status = 'checked-in'
  and a.attendee_id is not null
  and (a.checked_in_at, a.id) > (b.checked_in_at, b.id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_event_attendee_status_key'
  ) then
    alter table public.attendance
      add constraint attendance_event_attendee_status_key unique (event_id, attendee_id, check_in_status);
  end if;
end $$;

-- ============================================================================
-- SECTION: Automatic event closing
-- An organizer who never manually closes a finished event leaves it stuck in
-- an "open" status (active/ongoing/upcoming/etc.) forever, which keeps it
-- registrable/scoreable in every screen that checks for those statuses. This
-- job moves any event that isn't already draft/completed/archived/rejected
-- to 'completed' once 5 full days have passed since its end_date, matching
-- the terminal status the rest of the app already uses (see
-- OrganizerEventDetail.jsx and ParticipantDashboard.jsx's HIDDEN_STATUSES).
-- There is no separate 'Open'/'Closed' status in this schema, so this reuses
-- the existing status vocabulary rather than inventing a parallel one.
-- ============================================================================

create index if not exists idx_events_status_end_date on public.events (status, end_date);

create or replace function public.auto_close_expired_events()
returns setof public.events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.events
  set status = 'completed',
      updated_at = timezone('utc', now())
  where status not in ('draft', 'completed', 'archived', 'rejected')
    and end_date is not null
    and end_date + interval '5 days' <= timezone('utc', now())
  returning *;
end;
$$;

grant execute on function public.auto_close_expired_events() to service_role;

-- pg_cron is a Supabase-managed extension: on most plans this needs to be
-- turned on once via Dashboard > Database > Extensions before the create
-- extension statement below is allowed to succeed.
create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'auto-close-expired-events';
end $$;

select cron.schedule(
  'auto-close-expired-events',
  '0 0 * * *', -- once a day at 00:00 UTC
  $$select public.auto_close_expired_events();$$
);

-- ============================================================================
-- SECTION: Anonymous judging
-- Lets an organizer hide contestant names from judges for bias-prone events
-- (pageants, singing, dance) and show a randomly assigned "Contestant #N"
-- instead. There is no separate `participants` table in this schema —
-- contestants for an event live in the `events.contestants` jsonb array
-- (see normalizeContestants in eventStore.js), so the per-contestant number
-- lives as a `number` field inside that same array rather than as its own
-- column; uniqueness is enforced client-side when numbers are assigned
-- (OrganizerEventDetail.jsx shuffles 1..N with no repeats) since it only
-- ever needs to be unique within one event's own contestant list.
-- ============================================================================

alter table public.events add column if not exists anonymous_judging boolean default false;

-- ============================================================================
-- SECTION: Participant profile management
-- Adds the "About Me" / phone fields the Manage Profile page writes to, and
-- an `avatars` storage bucket for profile picture uploads. Every signed-in
-- user (any role, not just participants — mapProfileRow/updateUser in
-- authStore.js are shared) can read any avatar (they're public-facing
-- images shown across the app) but can only write inside a folder path
-- prefixed with their own auth uid, so one account can never overwrite
-- another's picture.
-- ============================================================================

alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists phone text default '';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- SECTION: Audit log
-- Every insert, update and delete on the tracked tables below is recorded by
-- a trigger, with who did it. Admins can read it; nobody (not even admins)
-- can edit or delete entries through the app. Safe to re-run.
-- ============================================================================

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default timezone('utc', now()),
  actor_id text,
  actor_email text,
  actor_role text,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id text,
  summary text,
  changed_fields text[],
  old_data jsonb,
  new_data jsonb
);

create index if not exists audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- The grants at the top of this file hand every table to anon/authenticated;
-- take write access back so entries can only come from the trigger below.
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated, service_role;
grant select on public.audit_log to authenticated, service_role;

drop policy if exists "Admins can read the audit log" on public.audit_log;
create policy "Admins can read the audit log"
on public.audit_log for select
to authenticated
using (public.is_admin_user());

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_changed text[];
  v_old_diff jsonb;
  v_new_diff jsonb;
  v_actor text := auth.uid()::text;
  v_email text;
  v_role text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key),
           jsonb_object_agg(n.key, v_old -> n.key),
           jsonb_object_agg(n.key, n.value)
      into v_changed, v_old_diff, v_new_diff
      from jsonb_each(v_new) as n
     where n.key <> 'updated_at'
       and (v_old -> n.key) is distinct from n.value;

    -- Nothing but updated_at changed: not worth an entry.
    if v_changed is null then
      return new;
    end if;
    v_old := v_old_diff;
    v_new := v_new_diff;
  end if;

  if v_actor is not null then
    select p.email, p.role into v_email, v_role from public.profiles p where p.id = v_actor;
    v_email := coalesce(v_email, auth.jwt() ->> 'email');
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, table_name, record_id,
    summary, changed_fields, old_data, new_data
  ) values (
    v_actor, v_email, v_role, lower(tg_op), tg_table_name, v_row ->> 'id',
    coalesce(v_row ->> 'title', v_row ->> 'full_name', v_row ->> 'name',
             v_row ->> 'participant_name', v_row ->> 'judge_name', v_row ->> 'email'),
    v_changed, v_old, v_new
  );

  return coalesce(new, old);
exception when others then
  -- Logging must never block the real change.
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'events', 'teams', 'registrations', 'scores', 'judges',
    'judge_assignments', 'attendance', 'certificates', 'tournaments',
    'brackets', 'matches', 'rubric_templates'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
      execute format(
        'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.write_audit_log()',
        t
      );
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- SECTION: Platform settings
-- One row of platform-wide switches the admin controls from Platform
-- Settings: maintenance mode (with a message and an expected return time)
-- and turning AI features on or off. Everyone can read it (the app must know
-- about maintenance even before sign-in); only admins can change it.
-- Run after the Audit log section. Safe to re-run.
-- ============================================================================

create table if not exists public.platform_settings (
  id integer primary key default 1 check (id = 1),
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default '',
  maintenance_until timestamptz,
  ai_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists "Anyone can read platform settings" on public.platform_settings;
create policy "Anyone can read platform settings"
on public.platform_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update platform settings" on public.platform_settings;
create policy "Admins can update platform settings"
on public.platform_settings for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop trigger if exists set_platform_settings_updated_at on public.platform_settings;
create trigger set_platform_settings_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

drop trigger if exists audit_platform_settings on public.platform_settings;
create trigger audit_platform_settings
after insert or update or delete on public.platform_settings
for each row execute function public.write_audit_log();

-- Lets open browsers pick up maintenance mode the moment it is switched on.
do $$
begin
  alter publication supabase_realtime add table public.platform_settings;
exception when others then
  null;
end;
$$;

-- ============================================================================
-- SECTION: Backups
-- History of full-database backups. The backup files live in the private
-- "backups" storage bucket; this table lists them. Only the admin-backup
-- Edge Function (service role) writes here; admins can read. Safe to re-run.
-- ============================================================================

create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  kind text not null default 'manual' check (kind in ('manual', 'automatic', 'pre-restore', 'uploaded')),
  note text,
  storage_path text not null,
  size_bytes bigint not null default 0,
  table_counts jsonb not null default '{}'::jsonb,
  total_records integer not null default 0,
  created_by text,
  created_by_email text,
  source_created_at timestamptz
);

create index if not exists backups_created_at_idx on public.backups (created_at desc);

alter table public.backups enable row level security;

revoke all on public.backups from anon;
revoke insert, update, delete, truncate on public.backups from authenticated;
grant select on public.backups to authenticated;
grant all on public.backups to service_role;

drop policy if exists "Admins can read backups" on public.backups;
create policy "Admins can read backups"
on public.backups for select
to authenticated
using (public.is_admin_user());

-- Private bucket: no storage policies, so only the service role (the
-- admin-backup Edge Function) can read or write backup files.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do update set public = false;

notify pgrst, 'reload schema';

-- ============================================================================
-- SECTION: Realtime
-- Lets open browsers receive row changes the moment they happen, so pages
-- update without a reload. Tables already in the publication are skipped.
-- Safe to re-run.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'events', 'teams', 'registrations', 'scores', 'audience_scores',
    'judges', 'judge_assignments', 'judge_invites', 'attendance', 'certificates',
    'notifications', 'tournaments', 'brackets', 'matches', 'match_participants',
    'rubric_templates', 'ai_detections', 'platform_settings'
  ]
  loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- SECTION: Organizer approval needs a confirmed email
-- An admin cannot approve (activate) an organizer until that organizer has
-- clicked the link in their confirmation email. Safe to re-run.
-- ============================================================================

create or replace function public.require_confirmed_email_for_organizer_approval()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.role = 'organizer'
     and new.status = 'active'
     and old.status is distinct from 'active'
     and exists (
       select 1 from auth.users u
       where u.id::text = new.id
         and u.email_confirmed_at is null
     ) then
    raise exception 'This organizer has not confirmed their email yet. Ask them to click the link in the confirmation email, then approve again.';
  end if;
  return new;
end;
$$;

drop trigger if exists require_confirmed_email_before_approval on public.profiles;
create trigger require_confirmed_email_before_approval
before update on public.profiles
for each row execute function public.require_confirmed_email_for_organizer_approval();
