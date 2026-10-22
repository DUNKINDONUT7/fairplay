-- ============================================================================
-- REVISION W01 / W03 / W05 / W06 — Tournament results, draws and completion
--
-- Run after 02_corrections_and_audit.sql. Safe to re-run.
--
-- The bracket engine (src/utils/bracketEngine.js) still computes progression
-- in the app, but the database now decides whether a change is ALLOWED and
-- rejects anything that breaks these rules, whichever client sends it:
--
--   * Draw (pairings) — only the event organizer. Free while the event is
--     unapproved and nothing is played. After the official pairing (event
--     approved) or once any result exists, a redraw needs a written reason
--     and is logged with the old and new pairings.
--   * Match result — only an ACTIVE scorer assigned to the event (or its
--     sub-event), only while scoring is open. A scorer can never change a
--     match that already has a saved result. Re-sending the same result is
--     accepted once and ignored after (safe retries, no duplicates).
--   * Correction / undo of a saved result — only the organizer (or admin),
--     with a reason, logged with old and new values. A correction that would
--     wipe later results is refused: correct the latest match first.
--   * Champion — can only be stored when every non-bye match is completed.
--   * Finalize — only the organizer, only when complete. Permanent.
--
-- Every write carries the revision number the client last saw; if someone
-- else saved in between, the write is refused instead of overwriting them.
-- ============================================================================

alter table public.tournaments add column if not exists revision integer not null default 0;
alter table public.tournaments add column if not exists draw_count integer not null default 0;
alter table public.tournaments add column if not exists sub_event_id text;

-- One row per result a scorer saved — the trace of who entered what, when.
create table if not exists public.match_result_entries (
  id bigint generated always as identity primary key,
  tournament_id bigint not null,
  event_id bigint references public.events(id) on delete cascade,
  match_id text not null,
  team1_id text,
  team1_name text,
  team2_id text,
  team2_name text,
  score1 numeric,
  score2 numeric,
  winner_id text,
  entry_type text not null default 'result' check (entry_type in ('result', 'correction', 'undo')),
  staff_id uuid,
  recorded_by text,
  recorded_at timestamptz not null default timezone('utc', now())
);

create index if not exists match_result_entries_tournament_idx on public.match_result_entries (tournament_id, recorded_at desc);

alter table public.match_result_entries enable row level security;
revoke all on public.match_result_entries from anon, authenticated;
grant select on public.match_result_entries to anon, authenticated;

drop policy if exists "Anyone can read match result entries" on public.match_result_entries;
create policy "Anyone can read match result entries"
on public.match_result_entries for select
to anon, authenticated
using (true);

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------
create or replace function public.match_num(p_value jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(p_value #>> '{}', '')::numeric, 0);
$$;

-- The parts of a match that make up its result.
create or replace function public.match_signature(p_match jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'status', coalesce(p_match->>'status', 'pending'),
    'team1', p_match #>> '{team1,id}',
    'team2', p_match #>> '{team2,id}',
    'score1', public.match_num(p_match->'score1'),
    'score2', public.match_num(p_match->'score2'),
    'winner', p_match #>> '{winner,id}'
  );
$$;

-- Pairings only (who meets whom), used to tell a redraw from other edits.
-- Round robin: every match is drawn up front. Group/league formats: the
-- first-stage matches. Elimination: the opening round (later rounds and
-- knockout slots are filled by results, not by the draw).
create or replace function public.draw_signature(p_matches jsonb, p_bracket_type text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(m->>'id', m #>> '{team1,id}', m #>> '{team2,id}') order by m->>'id'), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as entry(m)
  where p_bracket_type = 'round-robin'
     or m->>'stage' in ('group', 'league')
     or (coalesce(m->>'stage', '') <> 'knockout' and coalesce((m->>'round')::int, 1) = 1);
$$;

create or replace function public.matches_complete(p_matches jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select count(*) filter (where coalesce(m->>'status', '') <> 'bye') > 0
     and count(*) filter (where coalesce(m->>'status', '') not in ('bye', 'completed')) = 0
  from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as entry(m);
$$;

create or replace function public.has_champion(p_champion jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_champion is not null
     and jsonb_typeof(p_champion) not in ('null')
     and p_champion <> '{}'::jsonb
     and p_champion <> '""'::jsonb;
$$;

-- Every completed (non-bye) match of the old state is unchanged in the new
-- state, except p_except. Returns the id of the first one that changed.
create or replace function public.first_changed_result(p_old jsonb, p_new jsonb, p_except text)
returns text
language sql
immutable
set search_path = public
as $$
  select o->>'id'
  from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) as old_entry(o)
  left join lateral (
    select n from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) as new_entry(n)
    where n->>'id' = o->>'id'
    limit 1
  ) found on true
  where o->>'status' = 'completed'
    and o->>'id' is distinct from p_except
    and (found.n is null or public.match_signature(o) is distinct from public.match_signature(found.n))
  limit 1;
$$;

create or replace function public.find_match(p_matches jsonb, p_match_id text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select m from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as entry(m)
  where m->>'id' = p_match_id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Database-level guard (W05): no champion and no finalization while any
-- match is unfinished. Holds for every writer, including the service role.
-- ---------------------------------------------------------------------------
create or replace function public.guard_tournament_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Checked whenever results or the champion are written. A write that
  -- touches neither (e.g. publishing an old bracket) leaves an existing row
  -- as it is, so old data never blocks unrelated changes.
  if public.has_champion(new.champion) and not public.matches_complete(new.matches)
     and (tg_op = 'INSERT' or new.champion is distinct from old.champion or new.matches is distinct from old.matches) then
    raise exception 'A champion can only be declared once every match has a saved result.' using errcode = '23514';
  end if;
  if coalesce(new.live_status, '') = 'completed' and not public.has_champion(new.champion) then
    new.live_status := 'live';
  end if;
  if coalesce(new.is_finalized, false) and (tg_op = 'INSERT' or not coalesce(old.is_finalized, false))
     and not (public.matches_complete(new.matches) and public.has_champion(new.champion)) then
    raise exception 'A bracket can only be finalized once every match is played and a champion is decided.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_tournament_completion on public.tournaments;
create trigger guard_tournament_completion
before insert or update on public.tournaments
for each row execute function public.guard_tournament_completion();

-- Existing rows are deliberately NOT rewritten here (no data is changed by
-- this revision). A premature champion already stored in an old bracket is
-- ignored by the app (tournamentStore re-derives the champion from the
-- matches) and is replaced the next time that bracket is saved.

-- ---------------------------------------------------------------------------
-- Internal: load a tournament for writing and run the shared checks.
-- ---------------------------------------------------------------------------
create or replace function public.tournament_for_write(p_tournament_id bigint, p_expected_revision integer)
returns public.tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tournaments%rowtype;
begin
  select * into v_row from public.tournaments where id = p_tournament_id for update;
  if v_row.id is null then
    raise exception 'Bracket not found.' using errcode = '22023';
  end if;
  if coalesce(v_row.is_finalized, false) then
    raise exception 'This bracket has been finalized. Its results can no longer be changed.' using errcode = '42501';
  end if;
  if p_expected_revision is not null and p_expected_revision <> v_row.revision then
    -- PT409: PostgREST answers HTTP 409 and does not retry. (40001, the
    -- standard serialization-failure code, makes the API retry the request
    -- over and over until it times out.)
    raise exception 'This bracket was changed by someone else a moment ago. Reload it and try again.' using errcode = 'PT409';
  end if;
  return v_row;
end;
$$;

-- Fields the app may set on a tournament (results-related ones included);
-- id, event_id, finalization and revision are never taken from the client.
create or replace function public.apply_tournament_payload(p_row public.tournaments, p_payload jsonb)
returns public.tournaments
language plpgsql
immutable
set search_path = public
as $$
declare
  v public.tournaments := p_row;
begin
  if p_payload ? 'name' then v.name := coalesce(p_payload->>'name', v.name); end if;
  if p_payload ? 'title' then v.title := p_payload->>'title'; end if;
  if p_payload ? 'status' then v.status := coalesce(p_payload->>'status', v.status); end if;
  if p_payload ? 'bracket_type' then v.bracket_type := coalesce(p_payload->>'bracket_type', v.bracket_type); end if;
  if p_payload ? 'teams' then v.teams := coalesce(p_payload->'teams', '[]'::jsonb); end if;
  if p_payload ? 'matches' then v.matches := coalesce(p_payload->'matches', '[]'::jsonb); end if;
  if p_payload ? 'rounds' then v.rounds := coalesce(p_payload->'rounds', '[]'::jsonb); end if;
  if p_payload ? 'standings' then v.standings := coalesce(p_payload->'standings', '[]'::jsonb); end if;
  if p_payload ? 'current_round' then v.current_round := coalesce((p_payload->>'current_round')::int, 0); end if;
  if p_payload ? 'total_rounds' then v.total_rounds := coalesce((p_payload->>'total_rounds')::int, 0); end if;
  if p_payload ? 'total_slots' then v.total_slots := coalesce((p_payload->>'total_slots')::int, 0); end if;
  if p_payload ? 'byes' then v.byes := coalesce((p_payload->>'byes')::int, 0); end if;
  if p_payload ? 'live_status' then v.live_status := coalesce(p_payload->>'live_status', v.live_status); end if;
  if p_payload ? 'champion' then v.champion := coalesce(p_payload->'champion', '{}'::jsonb); end if;
  if p_payload ? 'stream_title' then v.stream_title := p_payload->>'stream_title'; end if;
  if p_payload ? 'stream_message' then v.stream_message := p_payload->>'stream_message'; end if;
  if p_payload ? 'history_log' then v.history_log := coalesce(p_payload->'history_log', '[]'::jsonb); end if;
  if p_payload ? 'entrant_snapshot' then v.entrant_snapshot := coalesce(p_payload->'entrant_snapshot', '[]'::jsonb); end if;
  if p_payload ? 'sub_event_id' then v.sub_event_id := p_payload->>'sub_event_id'; end if;
  if v.champion is null or v.champion = 'null'::jsonb then v.champion := '{}'::jsonb; end if;
  return v;
end;
$$;

create or replace function public.save_tournament_row(p_row public.tournaments)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tournaments
  set name = p_row.name, title = p_row.title, status = p_row.status, bracket_type = p_row.bracket_type,
      teams = p_row.teams, matches = p_row.matches, rounds = p_row.rounds, standings = p_row.standings,
      current_round = p_row.current_round, total_rounds = p_row.total_rounds, total_slots = p_row.total_slots,
      byes = p_row.byes, live_status = p_row.live_status, champion = p_row.champion,
      stream_title = p_row.stream_title, stream_message = p_row.stream_message,
      history_log = p_row.history_log, entrant_snapshot = p_row.entrant_snapshot,
      sub_event_id = p_row.sub_event_id, draw_count = p_row.draw_count,
      revision = revision + 1, last_synced_at = timezone('utc', now())
  where id = p_row.id;
  return (select to_jsonb(t) from public.tournaments t where t.id = p_row.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer: create a bracket record
-- ---------------------------------------------------------------------------
create or replace function public.tournament_create(p_event_id bigint, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tournaments;
  v_id bigint := coalesce(nullif(p_payload->>'id', '')::bigint, (extract(epoch from clock_timestamp()) * 1000)::bigint);
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'Only the event organizer can create its bracket.' using errcode = '42501';
  end if;
  if exists (select 1 from public.tournaments where id = v_id) then
    return (select to_jsonb(t) from public.tournaments t where t.id = v_id);
  end if;

  v_row.id := v_id;
  v_row.event_id := p_event_id;
  v_row.name := 'Tournament';
  v_row.status := 'draft';
  v_row.bracket_type := 'single';
  v_row.live_status := 'waiting';
  v_row.champion := '{}'::jsonb;
  v_row := public.apply_tournament_payload(v_row, p_payload);
  -- A new bracket record never starts with results.
  v_row.matches := '[]'::jsonb;
  v_row.champion := '{}'::jsonb;

  insert into public.tournaments (
    id, event_id, name, title, status, bracket_type, teams, matches, rounds, standings,
    current_round, total_rounds, total_slots, byes, live_status, champion,
    stream_title, stream_message, history_log, entrant_snapshot, sub_event_id,
    is_locked, is_published, revision, draw_count
  ) values (
    v_row.id, v_row.event_id, v_row.name, v_row.title, v_row.status, v_row.bracket_type,
    coalesce(v_row.teams, '[]'::jsonb), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    0, 0, 0, 0, v_row.live_status, '{}'::jsonb,
    v_row.stream_title, v_row.stream_message, '[]'::jsonb, coalesce(v_row.entrant_snapshot, '[]'::jsonb), v_row.sub_event_id,
    false, false, 0, 0
  );
  return (select to_jsonb(t) from public.tournaments t where t.id = v_row.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer: set entrants / (re)draw the bracket (W06)
-- ---------------------------------------------------------------------------
create or replace function public.tournament_save_draw(
  p_tournament_id bigint,
  p_payload jsonb,
  p_expected_revision integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.tournaments;
  v_new public.tournaments;
  v_event public.events%rowtype;
  v_official boolean;
  v_has_results boolean;
  v_redraw boolean;
  v_reason text;
  v_bad text;
begin
  v_old := public.tournament_for_write(p_tournament_id, p_expected_revision);
  if not public.is_event_owner(v_old.event_id) then
    raise exception 'Only the event organizer can change the draw.' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = v_old.event_id;

  v_new := public.apply_tournament_payload(v_old, p_payload);

  -- A draw may carry byes, never played results that the old state lacked.
  select n->>'id' into v_bad
  from jsonb_array_elements(coalesce(v_new.matches, '[]'::jsonb)) as entry(n)
  where n->>'status' in ('completed', 'in-progress')
    and public.match_signature(n) is distinct from public.match_signature(public.find_match(v_old.matches, n->>'id'))
  limit 1;
  if v_bad is not null then
    raise exception 'Results are recorded by the assigned scorer, not through the draw.' using errcode = '42501';
  end if;

  v_has_results := exists (
    select 1 from jsonb_array_elements(coalesce(v_old.matches, '[]'::jsonb)) as entry(m)
    where m->>'status' in ('completed', 'in-progress')
  );
  v_official := jsonb_array_length(coalesce(v_old.matches, '[]'::jsonb)) > 0
    and coalesce(v_event.status, 'draft') not in ('draft', 'pending', 'rejected');
  v_redraw := jsonb_array_length(coalesce(v_old.matches, '[]'::jsonb)) > 0
    and (public.draw_signature(v_old.matches, v_old.bracket_type) is distinct from public.draw_signature(v_new.matches, v_new.bracket_type)
         or v_new.bracket_type is distinct from v_old.bracket_type);

  if v_redraw and (v_official or v_has_results) then
    v_reason := public.require_reason(p_reason);
  elsif not v_redraw and v_has_results and public.first_changed_result(v_old.matches, v_new.matches, null) is not null then
    raise exception 'Saved results cannot be changed here. Use a correction.' using errcode = '42501';
  end if;

  -- A fresh draw never carries a champion.
  if v_redraw or jsonb_array_length(coalesce(v_old.matches, '[]'::jsonb)) = 0 then
    v_new.champion := '{}'::jsonb;
  end if;
  if v_redraw or (jsonb_array_length(coalesce(v_old.matches, '[]'::jsonb)) = 0 and jsonb_array_length(coalesce(v_new.matches, '[]'::jsonb)) > 0) then
    v_new.draw_count := coalesce(v_old.draw_count, 0) + 1;
  end if;

  if v_reason is not null then
    perform public.log_result_change(
      v_old.event_id, v_old.id, 'redraw', v_old.id::text,
      coalesce(v_old.title, v_old.name) || ' — draw #' || v_new.draw_count,
      jsonb_build_object('bracketType', v_old.bracket_type, 'pairings', public.draw_signature(v_old.matches, v_old.bracket_type),
                         'matches', v_old.matches, 'hadResults', v_has_results),
      jsonb_build_object('bracketType', v_new.bracket_type, 'pairings', public.draw_signature(v_new.matches, v_new.bracket_type)),
      v_reason
    );
  end if;

  return public.save_tournament_row(v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scorer: record one match result (W01)
-- ---------------------------------------------------------------------------
create or replace function public.tournament_record_result(
  p_tournament_id bigint,
  p_match_id text,
  p_payload jsonb,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.tournaments;
  v_new public.tournaments;
  v_staff uuid;
  v_old_match jsonb;
  v_new_match jsonb;
  v_changed text;
begin
  if auth.uid() is null then
    raise exception 'Sign in as an assigned scorer to record results.' using errcode = '42501';
  end if;

  -- Same result sent again (a retry after a dropped connection): accept once.
  select * into v_old from public.tournaments where id = p_tournament_id;
  if v_old.id is null then
    raise exception 'Bracket not found.' using errcode = '22023';
  end if;

  v_staff := public.active_staff_id(v_old.event_id, 'scorer', coalesce(v_old.sub_event_id, v_old.name));
  if v_staff is null then
    raise exception 'You are not an active scorer for this event, so you cannot record its results.' using errcode = '42501';
  end if;
  if not public.event_scoring_open(v_old.event_id) then
    raise exception 'Scoring is not open for this event.' using errcode = '42501';
  end if;

  v_old_match := public.find_match(v_old.matches, p_match_id);
  v_new_match := public.find_match(p_payload->'matches', p_match_id);
  if v_old_match is null or v_new_match is null then
    raise exception 'Match not found in this bracket.' using errcode = '22023';
  end if;

  if v_old_match->>'status' = 'completed' then
    if public.match_signature(v_old_match) = public.match_signature(v_new_match) then
      return (select to_jsonb(t) || jsonb_build_object('alreadySaved', true) from public.tournaments t where t.id = p_tournament_id);
    end if;
    raise exception 'This match already has a saved result. Only the organizer can correct it.' using errcode = '42501';
  end if;

  v_old := public.tournament_for_write(p_tournament_id, p_expected_revision);

  if (v_old_match #>> '{team1,id}') is null or (v_old_match #>> '{team2,id}') is null then
    raise exception 'Both teams must be known before this match can be scored.' using errcode = '22023';
  end if;
  if v_new_match->>'status' <> 'completed' then
    raise exception 'The result must be saved as completed.' using errcode = '22023';
  end if;
  if (v_new_match #>> '{team1,id}') is distinct from (v_old_match #>> '{team1,id}')
     or (v_new_match #>> '{team2,id}') is distinct from (v_old_match #>> '{team2,id}') then
    raise exception 'The teams in this match cannot be changed while scoring.' using errcode = '42501';
  end if;
  if public.match_num(v_new_match->'score1') < 0 or public.match_num(v_new_match->'score2') < 0 then
    raise exception 'Scores cannot be negative.' using errcode = '22023';
  end if;

  v_new := public.apply_tournament_payload(v_old, p_payload);
  -- A scorer's write cannot change the draw or the bracket's setup.
  v_new.bracket_type := v_old.bracket_type;
  v_new.teams := v_old.teams;
  v_new.entrant_snapshot := v_old.entrant_snapshot;
  if public.draw_signature(v_new.matches, v_new.bracket_type) is distinct from public.draw_signature(v_old.matches, v_old.bracket_type) then
    raise exception 'The draw cannot be changed while recording a result.' using errcode = '42501';
  end if;

  v_changed := public.first_changed_result(v_old.matches, v_new.matches, p_match_id);
  if v_changed is not null then
    raise exception 'Saving this result would change match %, which already has a result.', v_changed using errcode = '42501';
  end if;

  insert into public.match_result_entries (
    tournament_id, event_id, match_id, team1_id, team1_name, team2_id, team2_name,
    score1, score2, winner_id, entry_type, staff_id, recorded_by
  ) values (
    v_old.id, v_old.event_id, p_match_id,
    v_new_match #>> '{team1,id}', v_new_match #>> '{team1,name}',
    v_new_match #>> '{team2,id}', v_new_match #>> '{team2,name}',
    public.match_num(v_new_match->'score1'), public.match_num(v_new_match->'score2'),
    v_new_match #>> '{winner,id}', 'result', v_staff, auth.uid()::text
  );

  return public.save_tournament_row(v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer: correct or undo a saved result (W03)
-- ---------------------------------------------------------------------------
create or replace function public.tournament_correct_result(
  p_tournament_id bigint,
  p_match_id text,
  p_payload jsonb,
  p_expected_revision integer,
  p_reason text,
  p_kind text default 'correction'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.tournaments;
  v_new public.tournaments;
  v_reason text := public.require_reason(p_reason);
  v_old_match jsonb;
  v_new_match jsonb;
  v_changed text;
begin
  if p_kind not in ('correction', 'undo') then
    raise exception 'Unknown correction type.' using errcode = '22023';
  end if;
  v_old := public.tournament_for_write(p_tournament_id, p_expected_revision);
  if not public.is_event_owner(v_old.event_id) then
    raise exception 'Only the event organizer can correct a saved result.' using errcode = '42501';
  end if;
  if public.event_results_final(v_old.event_id) then
    raise exception 'This event''s results are final and can no longer be corrected.' using errcode = '42501';
  end if;

  v_old_match := public.find_match(v_old.matches, p_match_id);
  v_new_match := public.find_match(p_payload->'matches', p_match_id);
  if v_old_match is null or v_new_match is null then
    raise exception 'Match not found in this bracket.' using errcode = '22023';
  end if;
  if v_old_match->>'status' <> 'completed' then
    raise exception 'Only a match with a saved result can be corrected.' using errcode = '22023';
  end if;
  if p_kind = 'undo' and v_new_match->>'status' = 'completed' then
    raise exception 'An undo must clear the saved result.' using errcode = '22023';
  end if;
  if p_kind = 'correction' and v_new_match->>'status' <> 'completed' then
    raise exception 'A corrected result must still be a completed result.' using errcode = '22023';
  end if;
  if public.match_signature(v_old_match) = public.match_signature(v_new_match) then
    raise exception 'Nothing changed in this result.' using errcode = '22023';
  end if;

  v_new := public.apply_tournament_payload(v_old, p_payload);
  v_new.bracket_type := v_old.bracket_type;
  v_new.teams := v_old.teams;
  v_new.entrant_snapshot := v_old.entrant_snapshot;
  if public.draw_signature(v_new.matches, v_new.bracket_type) is distinct from public.draw_signature(v_old.matches, v_old.bracket_type) then
    raise exception 'A correction cannot change the draw. Use a redraw instead.' using errcode = '42501';
  end if;

  v_changed := public.first_changed_result(v_old.matches, v_new.matches, p_match_id);
  if v_changed is not null then
    raise exception 'This change would also alter match %, which already has a result. Correct the later match first.', v_changed using errcode = '42501';
  end if;

  insert into public.match_result_entries (
    tournament_id, event_id, match_id, team1_id, team1_name, team2_id, team2_name,
    score1, score2, winner_id, entry_type, recorded_by
  ) values (
    v_old.id, v_old.event_id, p_match_id,
    v_new_match #>> '{team1,id}', v_new_match #>> '{team1,name}',
    v_new_match #>> '{team2,id}', v_new_match #>> '{team2,name}',
    public.match_num(v_new_match->'score1'), public.match_num(v_new_match->'score2'),
    v_new_match #>> '{winner,id}', p_kind, auth.uid()::text
  );

  perform public.log_result_change(
    v_old.event_id, v_old.id, case when p_kind = 'undo' then 'match_undo' else 'match_correction' end,
    p_match_id,
    coalesce(v_old_match #>> '{team1,name}', 'TBD') || ' vs ' || coalesce(v_old_match #>> '{team2,name}', 'TBD'),
    public.match_signature(v_old_match) || jsonb_build_object('champion', v_old.champion),
    public.match_signature(v_new_match) || jsonb_build_object('champion', v_new.champion),
    v_reason
  );

  return public.save_tournament_row(v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer: finalize, publish, delete
-- ---------------------------------------------------------------------------
create or replace function public.tournament_finalize(p_tournament_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tournaments;
begin
  v_row := public.tournament_for_write(p_tournament_id, null);
  if not public.is_event_owner(v_row.event_id) then
    raise exception 'Only the event organizer can finalize results.' using errcode = '42501';
  end if;
  if not public.matches_complete(v_row.matches) then
    raise exception 'Every match must have a saved result before the results can be finalized.' using errcode = '23514';
  end if;
  if not public.has_champion(v_row.champion) then
    raise exception 'No champion has been decided yet.' using errcode = '23514';
  end if;

  update public.tournaments
  set is_finalized = true, is_locked = true, finalized_at = timezone('utc', now()),
      live_status = 'completed', stream_message = 'Results are final.', revision = revision + 1
  where id = p_tournament_id;

  perform public.log_result_change(
    v_row.event_id, v_row.id, 'finalize', v_row.id::text, coalesce(v_row.title, v_row.name),
    null, jsonb_build_object('champion', v_row.champion), 'Results finalized by the organizer'
  );
  return (select to_jsonb(t) from public.tournaments t where t.id = p_tournament_id);
end;
$$;

create or replace function public.tournament_set_visibility(
  p_tournament_id bigint,
  p_is_published boolean,
  p_stream_title text default null,
  p_stream_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event bigint;
begin
  select event_id into v_event from public.tournaments where id = p_tournament_id;
  if v_event is null or not public.is_event_owner(v_event) then
    raise exception 'Only the event organizer can change bracket visibility.' using errcode = '42501';
  end if;
  update public.tournaments
  set is_published = coalesce(p_is_published, is_published),
      published_at = case when p_is_published then coalesce(published_at, timezone('utc', now())) else null end,
      stream_title = coalesce(p_stream_title, stream_title),
      stream_message = coalesce(p_stream_message, stream_message)
  where id = p_tournament_id;
  return (select to_jsonb(t) from public.tournaments t where t.id = p_tournament_id);
end;
$$;

create or replace function public.tournament_delete(p_tournament_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tournaments;
begin
  v_row := public.tournament_for_write(p_tournament_id, null);
  if not public.is_event_owner(v_row.event_id) then
    raise exception 'Only the event organizer can delete a bracket.' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_row.matches, '[]'::jsonb)) as entry(m)
    where m->>'status' in ('completed', 'in-progress')
  ) then
    raise exception 'This bracket already has results and cannot be deleted.' using errcode = '42501';
  end if;
  delete from public.tournaments where id = p_tournament_id;
  return true;
end;
$$;

-- An organizer cannot also be a scorer/judge of their own event.
create or replace function public.guard_staff_not_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.events e
    join public.profiles p on p.id = e.owner_id
    where e.id = new.event_id and lower(p.email) = lower(new.email)
  ) then
    raise exception 'The event organizer cannot be assigned as its own % — results must be entered by someone else.', new.role using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_staff_not_owner on public.event_staff;
create trigger guard_staff_not_owner
before insert on public.event_staff
for each row execute function public.guard_staff_not_owner();

-- ---------------------------------------------------------------------------
-- Lock the table: reads stay public (bracket pages), every write is an RPC.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow anon full access to tournaments" on public.tournaments;
drop policy if exists "Anyone can read tournaments" on public.tournaments;
create policy "Anyone can read tournaments"
on public.tournaments for select
to anon, authenticated
using (true);

revoke insert, update, delete, truncate on public.tournaments from anon, authenticated;
grant select on public.tournaments to anon, authenticated;

-- Privileges
revoke execute on function public.match_num(jsonb) from public, anon, authenticated;
revoke execute on function public.match_signature(jsonb) from public, anon, authenticated;
revoke execute on function public.draw_signature(jsonb, text) from public, anon, authenticated;
revoke execute on function public.matches_complete(jsonb) from public, anon, authenticated;
revoke execute on function public.has_champion(jsonb) from public, anon, authenticated;
revoke execute on function public.first_changed_result(jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.find_match(jsonb, text) from public, anon, authenticated;
revoke execute on function public.guard_tournament_completion() from public, anon, authenticated;
revoke execute on function public.tournament_for_write(bigint, integer) from public, anon, authenticated;
revoke execute on function public.apply_tournament_payload(public.tournaments, jsonb) from public, anon, authenticated;
revoke execute on function public.save_tournament_row(public.tournaments) from public, anon, authenticated;
revoke execute on function public.guard_staff_not_owner() from public, anon, authenticated;
revoke execute on function public.tournament_create(bigint, jsonb) from public, anon;
revoke execute on function public.tournament_save_draw(bigint, jsonb, integer, text) from public, anon;
revoke execute on function public.tournament_record_result(bigint, text, jsonb, integer) from public, anon;
revoke execute on function public.tournament_correct_result(bigint, text, jsonb, integer, text, text) from public, anon;
revoke execute on function public.tournament_finalize(bigint) from public, anon;
revoke execute on function public.tournament_set_visibility(bigint, boolean, text, text) from public, anon;
revoke execute on function public.tournament_delete(bigint) from public, anon;

grant execute on function public.tournament_create(bigint, jsonb) to authenticated;
grant execute on function public.tournament_save_draw(bigint, jsonb, integer, text) to authenticated;
grant execute on function public.tournament_record_result(bigint, text, jsonb, integer) to authenticated;
grant execute on function public.tournament_correct_result(bigint, text, jsonb, integer, text, text) to authenticated;
grant execute on function public.tournament_finalize(bigint) to authenticated;
grant execute on function public.tournament_set_visibility(bigint, boolean, text, text) to authenticated;
grant execute on function public.tournament_delete(bigint) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_result_entries'
  ) then
    alter publication supabase_realtime add table public.match_result_entries;
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
