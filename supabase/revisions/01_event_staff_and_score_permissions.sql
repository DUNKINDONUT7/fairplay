-- ============================================================================
-- REVISION W01 / W10 / W12 — Event staff accounts and backend score permissions
--
-- Run after supabase/schema.sql (+ the other files listed in
-- supabase/revisions/README.md). Safe to re-run.
--
-- Who may do what, enforced here in the database (not only in the UI):
--   * judge   — an account assigned to the event as an ACTIVE judge may
--               submit criterion scores for that event, and only while the
--               event's scoring is open. Nobody else can (organizers included).
--   * scorer  — an account assigned as an ACTIVE scorer may record sports
--               match results (see 03_tournament_controls.sql).
--   * organizer (event owner) / admin — manage the event and its staff, view
--               results, and make CORRECTIONS with a written reason
--               (see 02_corrections_and_audit.sql). They cannot submit
--               original judge scores or match results.
--
-- Direct INSERT/UPDATE/DELETE on public.scores is revoked from the API
-- roles; every write goes through submit_judge_score() below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles: judge and scorer accounts come from staff invitations. Self sign-up
-- may pick any non-privileged role; staff powers come only from an ACTIVE
-- row in event_staff, never from profiles.role alone.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role text := coalesce(new.raw_user_meta_data->>'role', 'participant');
  v_role text := case
    when v_requested_role in ('participant', 'organizer', 'judge', 'scorer') then v_requested_role
    else 'participant'
  end;
begin
  insert into public.profiles (id, email, full_name, role, status, metadata, created_at, updated_at)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    case when v_role = 'organizer' then 'pending' else 'active' end,
    jsonb_strip_nulls(jsonb_build_object(
      'studentId', nullif(btrim(new.raw_user_meta_data->>'student_id'), ''),
      'section', nullif(btrim(new.raw_user_meta_data->>'section'), '')
    )),
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_event_owner(p_event_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.owner_id = auth.uid()::text
  ) or public.is_admin_user();
$$;

-- ---------------------------------------------------------------------------
-- event_staff: one row per person assigned to judge or score an event.
-- ---------------------------------------------------------------------------
create table if not exists public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  sub_event_id text,
  sub_event_name text,
  role text not null check (role in ('judge', 'scorer')),
  user_id text references public.profiles(id) on delete set null,
  email text not null,
  full_name text not null,
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked', 'replaced')),
  invited_by text,
  created_at timestamptz not null default timezone('utc', now()),
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  status_reason text,
  replaces_id uuid references public.event_staff(id) on delete set null,
  replaced_by_id uuid references public.event_staff(id) on delete set null,
  -- A judging "seat": a replacement judge takes over the seat of the judge
  -- they replace, so one seat never counts twice in the results while every
  -- sheet stays attributed to the person who actually gave it.
  seat_id uuid,
  -- Invitation delivery is tracked separately from the assignment itself,
  -- so a successful import is never mistaken for a delivered invitation.
  delivery_status text not null default 'not_sent'
    check (delivery_status in ('not_sent', 'sent', 'failed', 'link_copied')),
  delivery_error text,
  delivered_at timestamptz,
  import_batch text
);

create index if not exists event_staff_event_idx on public.event_staff (event_id);
create index if not exists event_staff_user_idx on public.event_staff (user_id);

alter table public.event_staff add column if not exists seat_id uuid;
update public.event_staff set seat_id = id where seat_id is null;

-- One live (invited/active) assignment per person, role and event.
create unique index if not exists event_staff_live_unique
  on public.event_staff (event_id, role, lower(email))
  where status in ('invited', 'active');

-- Activation tokens live in their own table with no API grants at all, so
-- the token can never be read by selecting from event_staff.
create table if not exists public.event_staff_tokens (
  staff_id uuid primary key references public.event_staff(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.event_staff enable row level security;
alter table public.event_staff_tokens enable row level security;

revoke all on public.event_staff from anon, authenticated;
revoke all on public.event_staff_tokens from anon, authenticated;
grant select on public.event_staff to authenticated;

drop policy if exists "Owners, admins and the staff member can read staff" on public.event_staff;
create policy "Owners, admins and the staff member can read staff"
on public.event_staff for select
to authenticated
using (public.is_event_owner(event_id) or user_id = auth.uid()::text);

-- Is the signed-in account an ACTIVE staff member of this event in this role?
-- A NULL sub-event assignment covers the whole event.
create or replace function public.active_staff_id(p_event_id bigint, p_role text, p_sub_event_id text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.event_staff s
  where s.event_id = p_event_id
    and s.role = p_role
    and s.status = 'active'
    and s.user_id = auth.uid()::text
    and (s.sub_event_id is null or p_sub_event_id is null or s.sub_event_id = p_sub_event_id)
  order by (s.sub_event_id is null) asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Staff management RPCs (organizer = event owner, or admin)
-- ---------------------------------------------------------------------------
create or replace function public.staff_add(
  p_event_id bigint,
  p_role text,
  p_email text,
  p_full_name text,
  p_sub_event_id text default null,
  p_sub_event_name text default null,
  p_import_batch text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_id uuid;
  v_user text;
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'Only the event organizer can assign judges or scorers.' using errcode = '42501';
  end if;
  if p_role not in ('judge', 'scorer') then
    raise exception 'Role must be judge or scorer.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required.' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'The full name is required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.event_staff s
    where s.event_id = p_event_id and s.role = p_role and lower(s.email) = v_email
      and s.status in ('invited', 'active')
  ) then
    raise exception 'This person is already assigned as % for this event.', p_role using errcode = '23505';
  end if;

  -- An account that already exists for this email is linked right away; the
  -- assignment still has to be activated by that person with their link.
  select p.id into v_user from public.profiles p where lower(p.email) = v_email limit 1;

  v_id := gen_random_uuid();
  insert into public.event_staff (id, seat_id, event_id, sub_event_id, sub_event_name, role, user_id, email, full_name, invited_by, import_batch)
  values (v_id, v_id, p_event_id, nullif(p_sub_event_id, ''), nullif(p_sub_event_name, ''), p_role, null, v_email, v_name, auth.uid()::text, p_import_batch);

  insert into public.event_staff_tokens (staff_id) values (v_id);

  return jsonb_build_object('id', v_id, 'email', v_email, 'existingAccount', v_user is not null);
end;
$$;

-- The activation link for one assignment, for the organizer to send or copy.
create or replace function public.staff_invite_token(p_staff_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event bigint;
  v_status text;
  v_token text;
begin
  select s.event_id, s.status into v_event, v_status from public.event_staff s where s.id = p_staff_id;
  if v_event is null or not public.is_event_owner(v_event) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if v_status <> 'invited' then
    raise exception 'This assignment is %; it no longer has an activation link.', v_status using errcode = '22023';
  end if;
  select t.token into v_token from public.event_staff_tokens t where t.staff_id = p_staff_id;
  return v_token;
end;
$$;

create or replace function public.staff_mark_delivery(p_staff_id uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event bigint;
begin
  select s.event_id into v_event from public.event_staff s where s.id = p_staff_id;
  if v_event is null or not public.is_event_owner(v_event) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'link_copied', 'not_sent') then
    raise exception 'Unknown delivery status.' using errcode = '22023';
  end if;
  update public.event_staff
  set delivery_status = p_status,
      delivery_error = case when p_status = 'failed' then left(coalesce(p_error, 'Unknown error'), 500) else null end,
      delivered_at = case when p_status in ('sent', 'link_copied') then timezone('utc', now()) else delivered_at end
  where id = p_staff_id;
end;
$$;

-- Public, read-only: what an activation link is for (no token = no data).
create or replace function public.staff_invite_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'email', s.email,
    'fullName', s.full_name,
    'role', s.role,
    'status', s.status,
    'eventId', s.event_id,
    'eventTitle', e.title,
    'subEventName', s.sub_event_name
  )
  from public.event_staff_tokens t
  join public.event_staff s on s.id = t.staff_id
  join public.events e on e.id = s.event_id
  where t.token = p_token
  limit 1;
$$;

-- The invited person, signed in with the invited email, accepts the link.
create or replace function public.staff_activate(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.event_staff%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in first to activate this assignment.' using errcode = '42501';
  end if;

  select s.* into v_staff
  from public.event_staff_tokens t
  join public.event_staff s on s.id = t.staff_id
  where t.token = p_token
  for update of s;

  if v_staff.id is null then
    raise exception 'This activation link is invalid.' using errcode = '22023';
  end if;
  if v_staff.status = 'active' and v_staff.user_id = auth.uid()::text then
    return jsonb_build_object('id', v_staff.id, 'eventId', v_staff.event_id, 'role', v_staff.role, 'alreadyActive', true);
  end if;
  if v_staff.status <> 'invited' then
    raise exception 'This assignment was % and can no longer be activated.', v_staff.status using errcode = '42501';
  end if;
  if lower(v_staff.email) <> v_email then
    raise exception 'This invitation was sent to %. Sign in with that email address.', v_staff.email using errcode = '42501';
  end if;

  update public.event_staff
  set status = 'active', user_id = auth.uid()::text, activated_at = timezone('utc', now())
  where id = v_staff.id;

  -- The link is single-use.
  delete from public.event_staff_tokens where staff_id = v_staff.id;

  return jsonb_build_object('id', v_staff.id, 'eventId', v_staff.event_id, 'role', v_staff.role, 'alreadyActive', false);
end;
$$;

-- Assignments of the signed-in account (for the judge/scorer dashboards).
create or replace function public.my_staff_assignments()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'eventId', s.event_id,
    'eventTitle', e.title,
    'eventStatus', e.status,
    'eventType', e.type,
    'scoringActive', coalesce((e.metadata->>'scoringActive')::boolean, false),
    'role', s.role,
    'status', s.status,
    'subEventId', s.sub_event_id,
    'subEventName', s.sub_event_name,
    'activatedAt', s.activated_at,
    'seatId', s.seat_id,
    'startDate', e.start_date,
    'location', e.location
  )
  from public.event_staff s
  join public.events e on e.id = s.event_id
  where s.user_id = auth.uid()::text
  order by e.start_date desc nulls last;
$$;

-- ---------------------------------------------------------------------------
-- Rubric versions (W02 / W12): every change to an event's criteria is kept,
-- and the rubric is frozen once the first score exists.
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists rubric_version integer not null default 1;

create table if not exists public.rubric_versions (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  version integer not null,
  criteria jsonb not null,
  changed_by text,
  changed_at timestamptz not null default timezone('utc', now()),
  unique (event_id, version)
);

alter table public.rubric_versions enable row level security;
revoke all on public.rubric_versions from anon, authenticated;
grant select on public.rubric_versions to anon, authenticated;

drop policy if exists "Anyone can read rubric versions" on public.rubric_versions;
create policy "Anyone can read rubric versions"
on public.rubric_versions for select
to anon, authenticated
using (true);

-- BEFORE UPDATE: freeze the rubric once scoring has begun, otherwise bump
-- the version number whenever the criteria change.
create or replace function public.guard_rubric_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.criteria is distinct from old.criteria then
    if exists (select 1 from public.scores sc where sc.event_id = old.id) then
      raise exception 'Judging has started for this event, so its rubric can no longer change.' using errcode = '42501';
    end if;
    new.rubric_version := coalesce(old.rubric_version, 1) + 1;
  else
    new.rubric_version := old.rubric_version;
  end if;
  return new;
end;
$$;

-- AFTER INSERT/UPDATE: keep a copy of every rubric version.
create or replace function public.record_rubric_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.rubric_version is distinct from old.rubric_version then
    insert into public.rubric_versions (event_id, version, criteria, changed_by)
    values (new.id, coalesce(new.rubric_version, 1), coalesce(new.criteria, '[]'::jsonb), auth.uid()::text)
    on conflict (event_id, version) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists guard_rubric_change on public.events;
create trigger guard_rubric_change
before update on public.events
for each row execute function public.guard_rubric_change();

drop trigger if exists record_rubric_version on public.events;
create trigger record_rubric_version
after insert or update on public.events
for each row execute function public.record_rubric_version();

-- Backfill version 1 for events that existed before this revision.
insert into public.rubric_versions (event_id, version, criteria)
select e.id, coalesce(e.rubric_version, 1), coalesce(e.criteria, '[]'::jsonb)
from public.events e
on conflict (event_id, version) do nothing;

-- ---------------------------------------------------------------------------
-- Judge scores
-- ---------------------------------------------------------------------------
alter table public.scores add column if not exists staff_id uuid references public.event_staff(id) on delete set null;
alter table public.scores add column if not exists rubric_version integer;
alter table public.scores add column if not exists submitted_at timestamptz;
alter table public.scores add column if not exists seat_id text;
-- A voided sheet stays on record (who gave it, when, and why it was voided)
-- but no longer counts toward the results. See void_judge_score().
alter table public.scores add column if not exists voided boolean not null default false;
alter table public.scores add column if not exists voided_reason text;

-- Is the event open for scoring? Approved (not draft/pending/rejected), the
-- organizer opened scoring, and not completed/archived.
create or replace function public.event_scoring_open(p_event_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and coalesce(e.status, 'draft') not in ('draft', 'pending', 'rejected', 'completed', 'archived')
      and coalesce(e.metadata->>'scoringActive', 'false') = 'true'
  );
$$;

-- Numeric range of a criterion's scoringRange text, e.g. '1-10' or '0 – 100'.
create or replace function public.criterion_range(p_range text)
returns numeric[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_numbers numeric[];
begin
  select array_agg(m[1]::numeric) into v_numbers
  from regexp_matches(coalesce(p_range, ''), '(\d+(?:\.\d+)?)', 'g') as m;
  if v_numbers is null or array_length(v_numbers, 1) = 0 then
    return array[1, 10]::numeric[];
  end if;
  if array_length(v_numbers, 1) = 1 then
    return array[0, v_numbers[1]]::numeric[];
  end if;
  return array[v_numbers[1], v_numbers[array_length(v_numbers, 1)]]::numeric[];
end;
$$;

-- The authoritative weighted total of one judge's sheet:
--   total = Σ(score_i × weight_i) / Σ(weight_i)
-- (a plain average when no weights are set). Rounded to 2 decimals once.
create or replace function public.weighted_sheet_total(p_criteria jsonb, p_scores jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_sum numeric := 0;
  v_weights numeric := 0;
  v_count integer := 0;
  v_plain numeric := 0;
  c jsonb;
  v_score numeric;
  v_weight numeric;
begin
  for c in select * from jsonb_array_elements(coalesce(p_criteria, '[]'::jsonb)) loop
    v_score := nullif(coalesce(p_scores ->> (c->>'id'), p_scores ->> (c->>'name')), '')::numeric;
    if v_score is null then
      continue;
    end if;
    v_weight := coalesce(nullif(c->>'weight', '')::numeric, 0);
    v_sum := v_sum + v_score * v_weight;
    v_weights := v_weights + v_weight;
    v_plain := v_plain + v_score;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    return 0;
  end if;
  if v_weights = 0 then
    return round(v_plain / v_count, 2);
  end if;
  return round(v_sum / v_weights, 2);
end;
$$;

create or replace function public.submit_judge_score(
  p_event_id bigint,
  p_contestant_id text,
  p_criteria_scores jsonb,
  p_comments jsonb default '{}'::jsonb,
  p_remarks text default '',
  p_round_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_staff_id uuid;
  v_staff public.event_staff%rowtype;
  v_contestant jsonb;
  v_existing public.scores%rowtype;
  v_id text;
  c jsonb;
  v_range numeric[];
  v_value numeric;
  v_total numeric;
  v_clean jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in as an assigned judge to submit scores.' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then
    raise exception 'Event not found.' using errcode = '22023';
  end if;

  v_staff_id := public.active_staff_id(p_event_id, 'judge', null);
  if v_staff_id is null then
    raise exception 'You are not an active judge for this event, so you cannot submit scores here.' using errcode = '42501';
  end if;
  select * into v_staff from public.event_staff where id = v_staff_id;

  if not public.event_scoring_open(p_event_id) then
    raise exception 'Scoring is not open for this event.' using errcode = '42501';
  end if;

  select entry.value into v_contestant
  from jsonb_array_elements(coalesce(v_event.contestants, '[]'::jsonb)) as entry(value)
  where entry.value->>'id' = p_contestant_id
  limit 1;
  if v_contestant is null then
    raise exception 'That contestant is not registered in this event.' using errcode = '22023';
  end if;
  if coalesce(v_event.metadata->'eliminatedContestantIds', '[]'::jsonb) ? p_contestant_id then
    raise exception 'That contestant is no longer competing in this event.' using errcode = '22023';
  end if;

  -- Every criterion of the current rubric must be scored, inside its range.
  for c in select * from jsonb_array_elements(coalesce(v_event.criteria, '[]'::jsonb)) loop
    v_value := nullif(coalesce(p_criteria_scores ->> (c->>'id'), p_criteria_scores ->> (c->>'name')), '')::numeric;
    if v_value is null then
      raise exception 'Missing a score for "%".', c->>'name' using errcode = '22023';
    end if;
    v_range := public.criterion_range(c->>'scoringRange');
    if v_value < v_range[1] or v_value > v_range[2] then
      raise exception 'The score for "%" must be between % and %.', c->>'name', v_range[1], v_range[2] using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object(c->>'id', v_value);
  end loop;

  v_total := public.weighted_sheet_total(v_event.criteria, v_clean);
  -- One sheet per judge, contestant and round: a locked round-1 sheet must
  -- not block (or be overwritten by) the same judge's round-2 sheet.
  v_id := p_event_id::text || '_' || auth.uid()::text || '_' || p_contestant_id
    || coalesce('__' || nullif(p_round_name, ''), '');

  select * into v_existing from public.scores where id = v_id for update;
  if v_existing.id is not null and coalesce(v_existing.locked, false) then
    raise exception 'This score was already submitted as final. Ask the organizer for a correction.' using errcode = '42501';
  end if;

  insert into public.scores (
    id, event_id, judge_id, staff_id, seat_id, contestant_id, contestant_name, event_title, judge_name,
    criteria_scores, comments, remarks, round_name, total_score, rubric_version,
    locked, submitted_at, created_at, updated_at
  ) values (
    v_id, p_event_id, auth.uid()::text, v_staff_id, coalesce(v_staff.seat_id, v_staff.id)::text, p_contestant_id, v_contestant->>'name', v_event.title, v_staff.full_name,
    v_clean, coalesce(p_comments, '{}'::jsonb), coalesce(p_remarks, ''), nullif(p_round_name, ''), v_total, v_event.rubric_version,
    false, timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
  )
  on conflict (id) do update set
    criteria_scores = excluded.criteria_scores,
    comments = excluded.comments,
    remarks = excluded.remarks,
    round_name = excluded.round_name,
    total_score = excluded.total_score,
    rubric_version = excluded.rubric_version,
    judge_name = excluded.judge_name,
    staff_id = excluded.staff_id,
    seat_id = excluded.seat_id,
    submitted_at = excluded.submitted_at,
    updated_at = excluded.updated_at;

  return (select to_jsonb(s) from public.scores s where s.id = v_id);
end;
$$;

-- A judge marks their own sheets final (locked). Corrections afterwards need
-- the organizer (02_corrections_and_audit.sql).
create or replace function public.lock_my_judge_scores(p_event_id bigint, p_contestant_id text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if public.active_staff_id(p_event_id, 'judge', null) is null then
    raise exception 'You are not an active judge for this event.' using errcode = '42501';
  end if;
  update public.scores
  set locked = true, locked_at = timezone('utc', now())
  where event_id = p_event_id
    and judge_id = auth.uid()::text
    and coalesce(locked, false) = false
    and (p_contestant_id is null or contestant_id = p_contestant_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Finalizing an event locks every sheet. Only the organizer/admin.
create or replace function public.finalize_event_scores(p_event_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'Only the event organizer can finalize scores.' using errcode = '42501';
  end if;
  update public.scores
  set locked = true, locked_at = coalesce(locked_at, timezone('utc', now()))
  where event_id = p_event_id and coalesce(locked, false) = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- No more direct table writes on scores from the API roles.
drop policy if exists "Scores can be inserted unlocked" on public.scores;
drop policy if exists "Unlocked scores can be updated" on public.scores;
drop policy if exists "Staff can delete scores" on public.scores;
drop policy if exists "Allow anon full access to scores" on public.scores;
revoke insert, update, delete, truncate on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges. New functions are executable by anon by default in
-- this project (see the default privileges at the top of schema.sql), so
-- each one is set explicitly here.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_event_owner(bigint) from public, anon;
revoke execute on function public.active_staff_id(bigint, text, text) from public, anon;
revoke execute on function public.event_scoring_open(bigint) from public;
revoke execute on function public.guard_rubric_change() from public, anon, authenticated;
revoke execute on function public.record_rubric_version() from public, anon, authenticated;
revoke execute on function public.staff_add(bigint, text, text, text, text, text, text) from public, anon;
revoke execute on function public.staff_invite_token(uuid) from public, anon;
revoke execute on function public.staff_mark_delivery(uuid, text, text) from public, anon;
revoke execute on function public.staff_activate(text) from public, anon;
revoke execute on function public.my_staff_assignments() from public, anon;
revoke execute on function public.submit_judge_score(bigint, text, jsonb, jsonb, text, text) from public, anon;
revoke execute on function public.lock_my_judge_scores(bigint, text) from public, anon;
revoke execute on function public.finalize_event_scores(bigint) from public, anon;

grant execute on function public.is_event_owner(bigint) to authenticated;
grant execute on function public.active_staff_id(bigint, text, text) to authenticated;
grant execute on function public.event_scoring_open(bigint) to anon, authenticated;
grant execute on function public.criterion_range(text) to anon, authenticated;
grant execute on function public.weighted_sheet_total(jsonb, jsonb) to anon, authenticated;
grant execute on function public.staff_invite_preview(text) to anon, authenticated;
grant execute on function public.staff_add(bigint, text, text, text, text, text, text) to authenticated;
grant execute on function public.staff_invite_token(uuid) to authenticated;
grant execute on function public.staff_mark_delivery(uuid, text, text) to authenticated;
grant execute on function public.staff_activate(text) to authenticated;
grant execute on function public.my_staff_assignments() to authenticated;
grant execute on function public.submit_judge_score(bigint, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.lock_my_judge_scores(bigint, text) to authenticated;
grant execute on function public.finalize_event_scores(bigint) to authenticated;

-- Audit every change to staff assignments.
drop trigger if exists audit_event_staff on public.event_staff;
create trigger audit_event_staff
after insert or update or delete on public.event_staff
for each row execute function public.write_audit_log();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_staff'
  ) then
    alter publication supabase_realtime add table public.event_staff;
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
