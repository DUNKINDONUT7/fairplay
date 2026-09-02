-- ════════════════════════════════════════════════════════════════════════
-- FairPlay — one-paste setup
--
-- Does everything in one run:
--   1. Sets passwords for organizer@fairplay.com and admin@fairplay.com
--   2. Promotes admin@fairplay.com to a real admin
--   3. Loads sample events, teams, judges, registrations, scores, bracket
--   4. Re-points EVERY event at organizer@fairplay.com
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor and Run.
-- Run it normally — do NOT enable any "run with RLS" / role-impersonation
-- option, or the policies will reject these writes.
--
-- Safe to run more than once. Every statement is an upsert or an idempotent
-- update, and it uses no temp tables (those do not survive the SQL Editor's
-- connection pooler).
--
-- TO UNDO the sample data, see the CLEANUP block at the very bottom.
--
-- ⚠ ONE THING TO DECIDE — the admin password on line ~70. This repo is public
-- on GitHub, and the app's Supabase URL and anon key ship inside the browser
-- bundle by design, so anyone can reach the login form. 'Admin123!' was also
-- published in the README until recently. Changing just that one string to
-- something private closes the admin account off; nothing else changes.
--
-- NOTE ON COLUMNS: written against this project's LIVE tables, which have
-- drifted ahead of supabase/schema.sql (tournaments keeps rounds/matches/
-- teams in their own columns rather than inside `bracket`; scores carries
-- contestant_name / judge_name / event_title). Do not "simplify" to match
-- schema.sql or the bracket will render empty.
-- ════════════════════════════════════════════════════════════════════════

-- pgcrypto lives in `extensions` on some Supabase projects and `public` on
-- others; naming both makes crypt()/gen_salt() resolve either way.
set search_path = public, extensions;


-- ── 0. Helper: the app's organizer-id hash ───────────────────────────────
-- The app resolves an organizer's events by hashing the signed-in profile id
-- (hashToSafeInteger in src/utils/identity.js) and filtering
-- events.organizer_id by it. This reproduces that hash exactly. It is a
-- normal function (not pg_temp) so every statement below can see it, and it
-- is dropped again at the end.

create or replace function public.fairplay_seed_actor_id(input text)
returns bigint
language plpgsql
immutable
as $$
declare
  h numeric := 17;
  i int;
begin
  if input is null or length(btrim(input)) = 0 then
    return null;
  end if;

  for i in 1..length(input) loop
    h := (h * 31 + ascii(substr(input, i, 1))) % 9007199254740000;
  end loop;

  -- The JS version ends with `Number(hash || 1n)`, so a zero hash becomes 1.
  return (case when h = 0 then 1 else h end)::bigint;
end;
$$;


-- ── 1. Account passwords ─────────────────────────────────────────────────
-- Supabase stores passwords as bcrypt hashes in auth.users. email_confirmed_at
-- is filled in too, because a null there makes the login fail with
-- "Email not confirmed" even when the password is correct. coalesce keeps an
-- existing confirmation timestamp untouched.

update auth.users
set encrypted_password = crypt('Organizer123!', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at         = now()
where lower(email) = 'organizer@fairplay.com';

-- ⚠ Change 'Admin123!' below to something private if you want the admin
--   account closed off. This is the only line you need to touch.
update auth.users
set encrypted_password = crypt('Admin123!', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at         = now()
where lower(email) = 'admin@fairplay.com';


-- ── 2. Make admin@fairplay.com an actual admin ───────────────────────────
-- It existed as role 'participant', so nobody could open the Admin panel or
-- approve the organizers sitting in 'pending'.
--
-- This is a bootstrap problem. The guard_profile_role_escalation trigger only
-- lets an admin change a role, and it decides that with is_admin_user(),
-- which reads auth.uid(). The SQL Editor has no signed-in user, so auth.uid()
-- is null and the trigger refuses:
--     ERROR: Only admins can change role or status.
-- With no admin in the table yet, there is no way to satisfy it — so the
-- guard is switched off for this one statement and switched straight back on.
--
-- The whole script runs inside one transaction, so if anything below fails,
-- the re-enable rolls back with it and the guard is never left off.

alter table public.profiles disable trigger guard_profile_role_escalation;

update public.profiles
set role       = 'admin',
    status     = 'active',
    updated_at = timezone('utc', now())
where lower(email) = 'admin@fairplay.com';

alter table public.profiles enable trigger guard_profile_role_escalation;


-- ── 3. Sample events ─────────────────────────────────────────────────────
-- Owner is resolved inside this one statement: organizer@fairplay.com if it
-- exists, else any active organizer, else a null-owner row so the seed still
-- loads on a fresh database (events then show on public pages only).

with owner as (
  select
    p.id                                as profile_id,
    p.email                             as email,
    public.fairplay_seed_actor_id(p.id) as actor_id
  from public.profiles p
  where p.role in ('organizer', 'admin')
    and coalesce(p.status, 'active') = 'active'
  order by
    (case when lower(p.email) = 'organizer@fairplay.com' then 0 else 1 end),
    (case when p.role = 'organizer' then 0 else 1 end),
    p.created_at
  limit 1
),
owner_row as (
  select profile_id, email, actor_id from owner
  union all
  select null::text, null::text, null::bigint
  where not exists (select 1 from owner)
)
insert into public.events (
  id, title, type, description, organizer_id, participants, max_participants,
  status, tournament_format, location, start_date, end_date, metadata
)
select
  v.id, v.title, v.type, v.description, o.actor_id, v.participants,
  v.max_participants, v.status, v.tournament_format, v.location,
  v.start_date, v.end_date,
  jsonb_build_object(
    'organizerEmail', o.email,
    'organizerAuthProfileId', o.profile_id,
    'sportType', v.sport_type,
    'seedSample', true
  )
from owner_row o
cross join (values
  (
    900000000001::bigint, 'Intramurals Volleyball Championship', 'tournament',
    'Inter-department volleyball tournament running across three days.',
    4, 16, 'active', 'single', 'Main Gymnasium',
    (now() - interval '1 day'), (now() + interval '2 days'), 'volleyball'
  ),
  (
    900000000002::bigint, 'Campus Battle of the Bands', 'contest',
    'Live band competition judged on vocals, instrumentation, and stage presence.',
    2, 12, 'upcoming', 'single', 'Open Amphitheater',
    (now() + interval '9 days'), (now() + interval '9 days 6 hours'), ''
  ),
  (
    900000000003::bigint, 'Programming Sprint 2026', 'contest',
    'Timed algorithmic problem solving with live scoring.',
    10, 20, 'completed', 'single', 'Computer Laboratory 3',
    (now() - interval '20 days'), (now() - interval '19 days'), ''
  )
) as v(
  id, title, type, description, participants, max_participants, status,
  tournament_format, location, start_date, end_date, sport_type
)
on conflict (id) do update
set title        = excluded.title,
    description  = excluded.description,
    status       = excluded.status,
    organizer_id = excluded.organizer_id,
    start_date   = excluded.start_date,
    end_date     = excluded.end_date,
    metadata     = excluded.metadata,
    updated_at   = timezone('utc', now());


-- ── 4. Teams ─────────────────────────────────────────────────────────────

insert into public.teams (id, event_id, name, school_name, division, status, members)
values
  (900000000101, 900000000001, 'BSIT Spikers',  'College of Computer Studies', 'Men''s Division', 'active',
   '[{"name":"J. Ramos","role":"Captain"},{"name":"M. Cruz","role":"Setter"},{"name":"A. Dela Pena","role":"Libero"}]'::jsonb),
  (900000000102, 900000000001, 'BSED Titans',   'College of Education',        'Men''s Division', 'active',
   '[{"name":"R. Santos","role":"Captain"},{"name":"K. Uy","role":"Spiker"},{"name":"D. Lim","role":"Blocker"}]'::jsonb),
  (900000000103, 900000000001, 'BSBA Falcons',  'College of Business',         'Men''s Division', 'active',
   '[{"name":"P. Gomez","role":"Captain"},{"name":"L. Tan","role":"Setter"},{"name":"E. Reyes","role":"Spiker"}]'::jsonb),
  (900000000104, 900000000001, 'BSHM Warriors', 'College of Hospitality',      'Men''s Division', 'active',
   '[{"name":"C. Navarro","role":"Captain"},{"name":"F. Aquino","role":"Libero"},{"name":"G. Bautista","role":"Spiker"}]'::jsonb)
on conflict (id) do update
set name        = excluded.name,
    school_name = excluded.school_name,
    members     = excluded.members,
    updated_at  = timezone('utc', now());


-- ── 5. Judges ────────────────────────────────────────────────────────────

insert into public.judges (id, name, email, role, specialty, status)
values
  (900000000201, 'Prof. Elena Marquez', 'elena.marquez@example.edu',  'judge', 'Technical Skill', 'active'),
  (900000000202, 'Coach Ramon Dizon',   'ramon.dizon@example.edu',    'judge', 'Team Strategy',   'active'),
  (900000000203, 'Ms. Aira Villanueva', 'aira.villanueva@example.edu','judge', 'Performance',     'active')
on conflict (id) do update
set name       = excluded.name,
    email      = excluded.email,
    specialty  = excluded.specialty,
    updated_at = timezone('utc', now());


-- ── 6. Registrations ─────────────────────────────────────────────────────

insert into public.registrations (
  id, event_id, team_id, participant_name, team_name, registration_type,
  email, category, status, metadata
)
values
  (900000000301, 900000000001, 900000000101, 'BSIT Spikers',  'BSIT Spikers',  'team',
   'bsit.spikers@example.edu',  'Men''s Division', 'approved', '{"seedSample":true}'::jsonb),
  (900000000302, 900000000001, 900000000102, 'BSED Titans',   'BSED Titans',   'team',
   'bsed.titans@example.edu',   'Men''s Division', 'approved', '{"seedSample":true}'::jsonb),
  (900000000303, 900000000001, 900000000103, 'BSBA Falcons',  'BSBA Falcons',  'team',
   'bsba.falcons@example.edu',  'Men''s Division', 'approved', '{"seedSample":true}'::jsonb),
  (900000000304, 900000000001, 900000000104, 'BSHM Warriors', 'BSHM Warriors', 'team',
   'bshm.warriors@example.edu', 'Men''s Division', 'approved', '{"seedSample":true}'::jsonb),
  (900000000305, 900000000002, null, 'Static Echo',    'Static Echo',    'team',
   'static.echo@example.edu', 'Band', 'approved', '{"seedSample":true}'::jsonb),
  (900000000306, 900000000002, null, 'The Night Owls', 'The Night Owls', 'team',
   'night.owls@example.edu',  'Band', 'pending',  '{"seedSample":true}'::jsonb)
on conflict (id) do update
set participant_name = excluded.participant_name,
    team_name        = excluded.team_name,
    status           = excluded.status,
    metadata         = excluded.metadata,
    updated_at       = timezone('utc', now());


-- ── 7. Scores ────────────────────────────────────────────────────────────
-- contestant_name / judge_name / event_title are what the public leaderboard
-- groups and labels by, so they are filled in rather than left null.
--
-- Two things guard this section:
--
-- 1. `locked` is seeded false, and the ON CONFLICT branch resets it to false.
--    prevent_locked_score_mutation rejects any UPDATE (and any DELETE) on a
--    row whose stored `locked` is true, so a locked sample row can neither be
--    refreshed nor removed afterwards.
--
-- 2. The trigger is switched off around this one statement, because an
--    earlier version of this file already seeded these four rows as locked.
--    Those rows are in the database now, so without this the upsert fails
--    with "Locked scores cannot be modified." before it can ever unlock them.
--    Once this has run, the rows are unlocked and stay re-runnable.
--
-- This only ever touches the four seed-score-000x rows. Real scores your
-- judges lock are untouched, and the guard is back on immediately.

alter table public.scores disable trigger lock_scores_immutable;

insert into public.scores (
  id, event_id, event_title, judge_id, judge_name, team_id,
  contestant_id, contestant_name, criteria_scores, total_score,
  remarks, round_name, locked
)
values
  ('seed-score-0001', 900000000001, 'Intramurals Volleyball Championship',
   900000000201, 'Prof. Elena Marquez', 900000000101, '900000000101', 'BSIT Spikers',
   '[{"name":"Technical Skill","score":27,"max":30},{"name":"Teamwork","score":26,"max":30},{"name":"Sportsmanship","score":18,"max":20}]'::jsonb,
   88.00, 'Strong serve receive throughout.', 'Semifinals', false),
  ('seed-score-0002', 900000000001, 'Intramurals Volleyball Championship',
   900000000202, 'Coach Ramon Dizon', 900000000102, '900000000102', 'BSED Titans',
   '[{"name":"Technical Skill","score":24,"max":30},{"name":"Teamwork","score":25,"max":30},{"name":"Sportsmanship","score":19,"max":20}]'::jsonb,
   82.00, 'Great communication under pressure.', 'Semifinals', false),
  ('seed-score-0003', 900000000001, 'Intramurals Volleyball Championship',
   900000000201, 'Prof. Elena Marquez', 900000000103, '900000000103', 'BSBA Falcons',
   '[{"name":"Technical Skill","score":22,"max":30},{"name":"Teamwork","score":23,"max":30},{"name":"Sportsmanship","score":18,"max":20}]'::jsonb,
   76.00, 'Solid defense, inconsistent attack.', 'Semifinals', false),
  ('seed-score-0004', 900000000001, 'Intramurals Volleyball Championship',
   900000000203, 'Ms. Aira Villanueva', 900000000104, '900000000104', 'BSHM Warriors',
   '[{"name":"Technical Skill","score":21,"max":30},{"name":"Teamwork","score":22,"max":30},{"name":"Sportsmanship","score":20,"max":20}]'::jsonb,
   74.00, 'Best sportsmanship of the round.', 'Semifinals', false)
on conflict (id) do update
set total_score     = excluded.total_score,
    criteria_scores = excluded.criteria_scores,
    contestant_name = excluded.contestant_name,
    judge_name      = excluded.judge_name,
    event_title     = excluded.event_title,
    remarks         = excluded.remarks,
    -- Clears the lock left by the earlier version of this file, so future
    -- runs no longer depend on the trigger being switched off.
    locked          = false,
    updated_at      = timezone('utc', now());

alter table public.scores enable trigger lock_scores_immutable;


-- ── 8. Tournament bracket ────────────────────────────────────────────────
-- Written to the live table's real columns, matching how the app itself saves
-- a bracket. `rounds` is the same match objects grouped by round, exactly as
-- buildRounds() in src/utils/bracketEngine.js produces them.

insert into public.tournaments (
  id, event_id, name, title, format, bracket_type, status, live_status,
  is_published, is_locked, published_at, current_round, total_rounds,
  total_slots, byes, stream_title, stream_message,
  teams, matches, rounds, standings, bracket, champion
)
values (
  900000000401,
  900000000001,
  'Intramurals Volleyball Championship bracket (single)',
  'Intramurals Volleyball Championship bracket (single)',
  'single',
  'single',
  'active',
  'live',
  true,
  false,
  timezone('utc', now()),
  1,
  2,
  4,
  0,
  'Semifinals in progress',
  'Winners advance to tonight''s final at the Main Gymnasium.',
  jsonb_build_array(
    jsonb_build_object('id', '900000000101', 'name', 'BSIT Spikers',  'seed', 1, 'type', 'team', 'source', 'teams'),
    jsonb_build_object('id', '900000000102', 'name', 'BSED Titans',   'seed', 2, 'type', 'team', 'source', 'teams'),
    jsonb_build_object('id', '900000000103', 'name', 'BSBA Falcons',  'seed', 3, 'type', 'team', 'source', 'teams'),
    jsonb_build_object('id', '900000000104', 'name', 'BSHM Warriors', 'seed', 4, 'type', 'team', 'source', 'teams')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'WB-R1-M1', 'round', 1, 'position', 1, 'status', 'completed',
      'team1', jsonb_build_object('id', '900000000101', 'name', 'BSIT Spikers',  'seed', 1),
      'team2', jsonb_build_object('id', '900000000104', 'name', 'BSHM Warriors', 'seed', 4),
      'score1', 25, 'score2', 19,
      'winner', jsonb_build_object('id', '900000000101', 'name', 'BSIT Spikers', 'seed', 1)
    ),
    jsonb_build_object(
      'id', 'WB-R1-M2', 'round', 1, 'position', 2, 'status', 'in-progress',
      'team1', jsonb_build_object('id', '900000000102', 'name', 'BSED Titans',  'seed', 2),
      'team2', jsonb_build_object('id', '900000000103', 'name', 'BSBA Falcons', 'seed', 3),
      'score1', 18, 'score2', 16,
      'winner', null
    ),
    jsonb_build_object(
      'id', 'WB-R2-M1', 'round', 2, 'position', 1, 'status', 'pending',
      'team1', jsonb_build_object('id', '900000000101', 'name', 'BSIT Spikers', 'seed', 1),
      'team2', null,
      'score1', 0, 'score2', 0,
      'winner', null
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'round', 1, 'label', 'Semifinals',
      'matches', jsonb_build_array(
        jsonb_build_object(
          'id', 'WB-R1-M1', 'round', 1, 'position', 1, 'status', 'completed',
          'team1', jsonb_build_object('id', '900000000101', 'name', 'BSIT Spikers',  'seed', 1),
          'team2', jsonb_build_object('id', '900000000104', 'name', 'BSHM Warriors', 'seed', 4),
          'score1', 25, 'score2', 19,
          'winner', jsonb_build_object('id', '900000000101', 'name', 'BSIT Spikers', 'seed', 1)
        ),
        jsonb_build_object(
          'id', 'WB-R1-M2', 'round', 1, 'position', 2, 'status', 'in-progress',
          'team1', jsonb_build_object('id', '900000000102', 'name', 'BSED Titans',  'seed', 2),
          'team2', jsonb_build_object('id', '900000000103', 'name', 'BSBA Falcons', 'seed', 3),
          'score1', 18, 'score2', 16,
          'winner', null
        )
      )
    ),
    jsonb_build_object(
      'round', 2, 'label', 'Finals',
      'matches', jsonb_build_array(
        jsonb_build_object(
          'id', 'WB-R2-M1', 'round', 2, 'position', 1, 'status', 'pending',
          'team1', jsonb_build_object('id', '900000000101', 'name', 'BSIT Spikers', 'seed', 1),
          'team2', null,
          'score1', 0, 'score2', 0,
          'winner', null
        )
      )
    )
  ),
  '[]'::jsonb,
  '{}'::jsonb,
  null
)
on conflict (id) do update
set rounds       = excluded.rounds,
    matches      = excluded.matches,
    teams        = excluded.teams,
    total_rounds = excluded.total_rounds,
    is_published = excluded.is_published,
    live_status  = excluded.live_status,
    status       = excluded.status,
    updated_at   = timezone('utc', now());


-- ── 9. Put every event under organizer@fairplay.com ──────────────────────
-- Events made while the old built-in demo login was in use were stamped with
-- that demo user's plain numeric id (organizer_id = 2). No real Supabase login
-- can produce 2 again, so those events had become invisible on every
-- dashboard. This re-points all events — old and seeded — at one real owner.
--
-- metadata is merged, not replaced, so every other key each event carries is
-- preserved. If the profile is missing this updates nothing rather than
-- clearing ownership.

with owner as (
  select
    p.id                                as profile_id,
    p.email                             as email,
    public.fairplay_seed_actor_id(p.id) as actor_id
  from public.profiles p
  where lower(p.email) = 'organizer@fairplay.com'
  limit 1
)
update public.events e
set organizer_id = o.actor_id,
    metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
      'organizerEmail', o.email,
      'organizerAuthProfileId', o.profile_id
    ),
    updated_at = timezone('utc', now())
from owner o;


-- ── 10. Clean up the helper (removes the function only, never data) ───────

drop function if exists public.fairplay_seed_actor_id(text);


-- ── Result ───────────────────────────────────────────────────────────────
-- Expect: both accounts password_set = true and confirmed = true,
-- admin@fairplay.com role = admin, and every event on the same organizer_id.

select 'account' as what,
       u.email   as name,
       (u.encrypted_password is not null and u.encrypted_password <> '')::text
         || ' / confirmed=' || (u.email_confirmed_at is not null)::text
         || ' / role=' || coalesce(p.role, '—') as detail
from auth.users u
left join public.profiles p on p.id = u.id::text
where lower(u.email) in ('organizer@fairplay.com', 'admin@fairplay.com')

union all

select 'event', e.title, e.organizer_id::text
from public.events e

order by what, name;


-- ════════════════════════════════════════════════════════════════════════
-- CLEANUP — run this block on its own to remove the sample data.
-- Only the seeded id ranges are touched; your own events stay.
-- (Your own events keep the ownership fix from step 9 — that is not undone.)
-- ════════════════════════════════════════════════════════════════════════
--
-- begin;
--   delete from public.tournaments   where id between 900000000401 and 900000000499;
--   delete from public.scores        where id like 'seed-score-%';
--   delete from public.registrations where id between 900000000301 and 900000000399;
--   delete from public.judges        where id between 900000000201 and 900000000299;
--   delete from public.teams         where id between 900000000101 and 900000000199;
--   delete from public.events        where id between 900000000001 and 900000000099;
-- commit;
