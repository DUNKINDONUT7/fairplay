-- ============================================================================
-- REVISION W03 / W04 / W10 — Corrections, undo, reassignment and their log
--
-- Run after 01_event_staff_and_score_permissions.sql. Safe to re-run.
--
-- Rules:
--   * A saved result can only be changed through a correction, by the event
--     organizer (owner) or an admin, with a written reason.
--   * Every correction, undo, redraw, staff revoke and staff replacement is
--     written to public.result_changes with the old value, new value, reason,
--     who did it and when. Nobody can edit or delete those entries.
--   * Once an event's results are finalized nothing can be corrected.
--   * Times are stored in UTC and shown in Philippine time (Asia/Manila,
--     UTC+8) with an explicit "PHT" label.
-- ============================================================================

create table if not exists public.result_changes (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default timezone('utc', now()),
  event_id bigint references public.events(id) on delete set null,
  tournament_id bigint,
  change_type text not null check (change_type in (
    'judge_score_correction', 'judge_score_void',
    'match_correction', 'match_undo',
    'redraw', 'finalize',
    'staff_revoke', 'staff_replace',
    'attendance_override', 'vote_void'
  )),
  target_id text,
  target_label text,
  old_value jsonb,
  new_value jsonb,
  reason text not null,
  actor_id text,
  actor_email text,
  actor_role text
);

create index if not exists result_changes_event_idx on public.result_changes (event_id, occurred_at desc);
create index if not exists result_changes_type_idx on public.result_changes (change_type, occurred_at desc);

alter table public.result_changes enable row level security;
revoke all on public.result_changes from anon, authenticated;
grant select on public.result_changes to authenticated;

drop policy if exists "Organizer of the event and admins can read changes" on public.result_changes;
create policy "Organizer of the event and admins can read changes"
on public.result_changes for select
to authenticated
using (public.is_admin_user() or (event_id is not null and public.is_event_owner(event_id)));

-- Readable log with a fixed Philippine-time label next to the UTC instant.
create or replace view public.result_changes_ph
with (security_invoker = true)
as
select
  rc.*,
  to_char(rc.occurred_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS') || ' PHT' as occurred_at_ph,
  e.title as event_title
from public.result_changes rc
left join public.events e on e.id = rc.event_id;

grant select on public.result_changes_ph to authenticated;

-- Internal: write one change entry as the signed-in user. Not callable
-- through the API.
create or replace function public.log_result_change(
  p_event_id bigint,
  p_tournament_id bigint,
  p_change_type text,
  p_target_id text,
  p_target_label text,
  p_old jsonb,
  p_new jsonb,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_email text;
  v_role text;
begin
  select p.email, p.role into v_email, v_role from public.profiles p where p.id = auth.uid()::text;
  insert into public.result_changes (
    event_id, tournament_id, change_type, target_id, target_label,
    old_value, new_value, reason, actor_id, actor_email, actor_role
  ) values (
    p_event_id, p_tournament_id, p_change_type, p_target_id, p_target_label,
    p_old, p_new, p_reason, auth.uid()::text, coalesce(v_email, auth.jwt() ->> 'email'), v_role
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason (at least 5 characters) is required for this change.' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

-- An event's results are final once it is completed with scoring closed.
create or replace function public.event_results_final(p_event_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.status in ('completed', 'archived')
      and coalesce(e.metadata->>'scoringActive', 'false') <> 'true'
  );
$$;

-- Locked sheets stay immutable, except inside a correction function, which
-- turns this on for its own transaction only. API callers cannot set it:
-- they have no direct table access to scores at all (see revision 01).
create or replace function public.prevent_locked_score_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('fairplay.correction', true), '') = 'on' then
    return coalesce(NEW, OLD);
  end if;

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

-- ---------------------------------------------------------------------------
-- Judge score correction / void
-- ---------------------------------------------------------------------------
create or replace function public.correct_judge_score(p_score_id text, p_criteria_scores jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score public.scores%rowtype;
  v_event public.events%rowtype;
  v_reason text := public.require_reason(p_reason);
  c jsonb;
  v_value numeric;
  v_range numeric[];
  v_clean jsonb := '{}'::jsonb;
  v_total numeric;
begin
  select * into v_score from public.scores where id = p_score_id for update;
  if v_score.id is null then
    raise exception 'Score not found.' using errcode = '22023';
  end if;
  if not public.is_event_owner(v_score.event_id) then
    raise exception 'Only the event organizer can correct a saved score.' using errcode = '42501';
  end if;
  if public.event_results_final(v_score.event_id) then
    raise exception 'This event''s results are final and can no longer be corrected.' using errcode = '42501';
  end if;
  if v_score.voided then
    raise exception 'This sheet was voided and cannot be corrected.' using errcode = '22023';
  end if;

  select * into v_event from public.events where id = v_score.event_id;
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

  if v_clean = v_score.criteria_scores then
    raise exception 'The corrected scores are the same as the saved ones.' using errcode = '22023';
  end if;

  perform set_config('fairplay.correction', 'on', true);
  update public.scores
  set criteria_scores = v_clean, total_score = v_total, updated_at = timezone('utc', now())
  where id = p_score_id;
  perform set_config('fairplay.correction', 'off', true);

  perform public.log_result_change(
    v_score.event_id, null, 'judge_score_correction', v_score.id,
    coalesce(v_score.judge_name, 'Judge') || ' → ' || coalesce(v_score.contestant_name, v_score.contestant_id),
    jsonb_build_object('criteriaScores', v_score.criteria_scores, 'total', v_score.total_score),
    jsonb_build_object('criteriaScores', v_clean, 'total', v_total),
    v_reason
  );

  return (select to_jsonb(s) from public.scores s where s.id = p_score_id);
end;
$$;

create or replace function public.void_judge_score(p_score_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score public.scores%rowtype;
  v_reason text := public.require_reason(p_reason);
begin
  select * into v_score from public.scores where id = p_score_id for update;
  if v_score.id is null then
    raise exception 'Score not found.' using errcode = '22023';
  end if;
  if not public.is_event_owner(v_score.event_id) then
    raise exception 'Only the event organizer can void a score.' using errcode = '42501';
  end if;
  if public.event_results_final(v_score.event_id) then
    raise exception 'This event''s results are final and can no longer be corrected.' using errcode = '42501';
  end if;
  if v_score.voided then
    return to_jsonb(v_score);
  end if;

  perform set_config('fairplay.correction', 'on', true);
  update public.scores
  set voided = true, voided_reason = v_reason, updated_at = timezone('utc', now())
  where id = p_score_id;
  perform set_config('fairplay.correction', 'off', true);

  perform public.log_result_change(
    v_score.event_id, null, 'judge_score_void', v_score.id,
    coalesce(v_score.judge_name, 'Judge') || ' → ' || coalesce(v_score.contestant_name, v_score.contestant_id),
    jsonb_build_object('criteriaScores', v_score.criteria_scores, 'total', v_score.total_score, 'voided', false),
    jsonb_build_object('voided', true),
    v_reason
  );

  return (select to_jsonb(s) from public.scores s where s.id = p_score_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff revoke / replace (reassignment), both logged.
-- ---------------------------------------------------------------------------
create or replace function public.staff_revoke(p_staff_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.event_staff%rowtype;
  v_reason text := public.require_reason(p_reason);
begin
  select * into v_staff from public.event_staff where id = p_staff_id for update;
  if v_staff.id is null or not public.is_event_owner(v_staff.event_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if v_staff.status not in ('invited', 'active') then
    raise exception 'This assignment is already %.', v_staff.status using errcode = '22023';
  end if;

  update public.event_staff
  set status = 'revoked', revoked_at = timezone('utc', now()), revoked_by = auth.uid()::text, status_reason = v_reason
  where id = p_staff_id;
  delete from public.event_staff_tokens where staff_id = p_staff_id;

  perform public.log_result_change(
    v_staff.event_id, null, 'staff_revoke', v_staff.id::text,
    v_staff.full_name || ' (' || v_staff.role || ')',
    jsonb_build_object('status', v_staff.status, 'email', v_staff.email),
    jsonb_build_object('status', 'revoked'),
    v_reason
  );
  return jsonb_build_object('id', p_staff_id, 'status', 'revoked');
end;
$$;

create or replace function public.staff_replace(p_staff_id uuid, p_email text, p_full_name text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.event_staff%rowtype;
  v_reason text := public.require_reason(p_reason);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_new uuid := gen_random_uuid();
begin
  select * into v_old from public.event_staff where id = p_staff_id for update;
  if v_old.id is null or not public.is_event_owner(v_old.event_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if v_old.status not in ('invited', 'active', 'revoked') then
    raise exception 'This assignment was already replaced.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_name) < 2 then
    raise exception 'The replacement needs a full name and a valid email address.' using errcode = '22023';
  end if;
  if v_email = lower(v_old.email) then
    raise exception 'The replacement must be a different person (different email).' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.event_staff s
    where s.event_id = v_old.event_id and s.role = v_old.role and lower(s.email) = v_email
      and s.status in ('invited', 'active')
  ) then
    raise exception 'That person is already assigned as % for this event.', v_old.role using errcode = '23505';
  end if;

  insert into public.event_staff (
    id, seat_id, event_id, sub_event_id, sub_event_name, role, email, full_name, invited_by, replaces_id
  ) values (
    v_new, coalesce(v_old.seat_id, v_old.id), v_old.event_id, v_old.sub_event_id, v_old.sub_event_name,
    v_old.role, v_email, v_name, auth.uid()::text, v_old.id
  );
  insert into public.event_staff_tokens (staff_id) values (v_new);

  update public.event_staff
  set status = 'replaced', replaced_by_id = v_new,
      revoked_at = coalesce(revoked_at, timezone('utc', now())),
      revoked_by = coalesce(revoked_by, auth.uid()::text),
      status_reason = v_reason
  where id = v_old.id;
  delete from public.event_staff_tokens where staff_id = v_old.id;

  perform public.log_result_change(
    v_old.event_id, null, 'staff_replace', v_old.id::text,
    v_old.full_name || ' → ' || v_name || ' (' || v_old.role || ')',
    jsonb_build_object('staffId', v_old.id, 'name', v_old.full_name, 'email', v_old.email, 'status', v_old.status),
    jsonb_build_object('staffId', v_new, 'name', v_name, 'email', v_email, 'status', 'invited', 'seatId', coalesce(v_old.seat_id, v_old.id)),
    v_reason
  );

  return jsonb_build_object('id', v_new, 'replaces', v_old.id, 'seatId', coalesce(v_old.seat_id, v_old.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.log_result_change(bigint, bigint, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.require_reason(text) from public, anon, authenticated;
revoke execute on function public.event_results_final(bigint) from public;
revoke execute on function public.prevent_locked_score_mutation() from public, anon, authenticated;
revoke execute on function public.correct_judge_score(text, jsonb, text) from public, anon;
revoke execute on function public.void_judge_score(text, text) from public, anon;
revoke execute on function public.staff_revoke(uuid, text) from public, anon;
revoke execute on function public.staff_replace(uuid, text, text, text) from public, anon;

grant execute on function public.event_results_final(bigint) to anon, authenticated;
grant execute on function public.correct_judge_score(text, jsonb, text) to authenticated;
grant execute on function public.void_judge_score(text, text) to authenticated;
grant execute on function public.staff_revoke(uuid, text) to authenticated;
grant execute on function public.staff_replace(uuid, text, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'result_changes'
  ) then
    alter publication supabase_realtime add table public.result_changes;
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
