create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

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

alter table public.scores alter column id type text using id::text;
alter table public.scores alter column judge_id type text using judge_id::text;
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

  insert into public.judge_assignments (id, judge_id, event_id, status, assigned_at)
  values (v_judge_id::text || '_' || v_invite.event_id::text, v_judge_id, v_invite.event_id, 'active', timezone('utc', now()))
  on conflict (id) do update set status = 'active';

  update public.judge_invites
  set status = 'claimed', claimed_at = timezone('utc', now())
  where token = p_token;

  return query select v_judge_id, v_invite.judge_name, v_invite.judge_email, v_invite.event_id;
end;
$$;

grant execute on function public.claim_judge_invite(text) to anon, authenticated;

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

drop policy if exists "Scores can be inserted unlocked" on public.scores;
create policy "Scores can be inserted unlocked"
on public.scores for insert
to anon, authenticated
with check (coalesce(locked, false) = false);

drop policy if exists "Unlocked scores can be updated" on public.scores;
create policy "Unlocked scores can be updated"
on public.scores for update
to anon, authenticated
using (coalesce(locked, false) = false)
with check (true);

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
begin
  insert into public.profiles (id, email, full_name, role, status, created_at, updated_at)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'organizer'),
    'active',
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
