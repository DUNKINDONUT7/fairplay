-- ============================================================================
-- Event ownership — PART 1 of 2 (prepare). Safe to run any time: it only
-- adds things, nothing existing changes behavior yet.
--   * events.owner_id — the auth user id of the organizer who owns the event
--   * three SECURITY DEFINER functions for the writes non-owners legitimately
--     make (participant registration, audience votes, scorer reports), so
--     PART 2 can lock direct UPDATEs down to the owner and admins.
-- ============================================================================

-- Same hash the app uses to turn a user id into events.organizer_id
-- (src/utils/identity.js hashToSafeInteger), used to backfill old events.
create or replace function public.fairplay_actor_hash(p_text text)
returns bigint
language plpgsql
immutable
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_hash numeric := 17;
  i int;
begin
  if v_text = '' then
    return null;
  end if;
  for i in 1..char_length(v_text) loop
    v_hash := mod(v_hash * 31 + ascii(substr(v_text, i, 1)), 9007199254740000);
  end loop;
  if v_hash = 0 then
    v_hash := 1;
  end if;
  return v_hash::bigint;
end;
$$;

alter table public.events add column if not exists owner_id text;

-- Backfill: the organizer's auth id stored in metadata, or else the profile
-- whose hashed id matches organizer_id.
update public.events
set owner_id = nullif(metadata->>'organizerAuthProfileId', '')
where owner_id is null
  and nullif(metadata->>'organizerAuthProfileId', '') is not null;

update public.events e
set owner_id = p.id
from public.profiles p
where e.owner_id is null
  and e.organizer_id is not null
  and p.role in ('organizer', 'admin')
  and public.fairplay_actor_hash(p.id) = e.organizer_id;

-- New events are always owned by whoever creates them; only an admin may
-- create one on someone else's behalf.
create or replace function public.set_event_owner()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and (new.owner_id is null or not public.is_admin_user()) then
    new.owner_id := auth.uid()::text;
  end if;
  return new;
end;
$$;

drop trigger if exists set_event_owner on public.events;
create trigger set_event_owner
before insert on public.events
for each row execute function public.set_event_owner();

-- Participant registration: append one contestant and recount participants.
create or replace function public.register_event_contestant(p_event_id bigint, p_contestant jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contestants jsonb;
begin
  if p_contestant is null or jsonb_typeof(p_contestant) <> 'object' or coalesce(p_contestant->>'id', '') = '' then
    raise exception 'A contestant with an id is required.';
  end if;

  select coalesce(contestants, '[]'::jsonb) into v_contestants
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found.';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_contestants) c where c->>'id' = p_contestant->>'id'
  ) then
    v_contestants := v_contestants || jsonb_build_array(p_contestant);
    update public.events
    set contestants = v_contestants,
        participants = jsonb_array_length(v_contestants)
    where id = p_event_id;
  end if;

  return v_contestants;
end;
$$;

-- Audience voting: one score per voter per contestant, kept in metadata.
create or replace function public.add_event_audience_score(p_event_id bigint, p_submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_rows jsonb;
begin
  if p_submission is null or jsonb_typeof(p_submission) <> 'object' or coalesce(p_submission->>'id', '') = '' then
    raise exception 'An audience score with an id is required.';
  end if;

  select coalesce(metadata, '{}'::jsonb) into v_metadata
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found.';
  end if;

  v_rows := case when jsonb_typeof(v_metadata->'audienceScores') = 'array' then v_metadata->'audienceScores' else '[]'::jsonb end;

  if exists (
    select 1 from jsonb_array_elements(v_rows) r
    where r->>'id' = p_submission->>'id'
       or (r->>'contestantId' = p_submission->>'contestantId' and r->>'voterKey' = p_submission->>'voterKey')
  ) then
    raise exception 'This device/session already submitted an audience score for this participant.';
  end if;

  update public.events
  set metadata = jsonb_set(v_metadata, '{audienceScores}', v_rows || jsonb_build_array(p_submission))
  where id = p_event_id;

  return p_submission;
end;
$$;

-- Scorer championship report: replace-or-add by report id in metadata.
create or replace function public.add_event_generated_report(p_event_id bigint, p_report jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_reports jsonb;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' or coalesce(p_report->>'id', '') = '' then
    raise exception 'A report with an id is required.';
  end if;

  select coalesce(metadata, '{}'::jsonb) into v_metadata
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found.';
  end if;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_reports
  from jsonb_array_elements(
    case when jsonb_typeof(v_metadata->'generatedReports') = 'array' then v_metadata->'generatedReports' else '[]'::jsonb end
  ) r
  where r->>'id' <> p_report->>'id';

  update public.events
  set metadata = jsonb_set(v_metadata, '{generatedReports}', jsonb_build_array(p_report) || v_reports)
  where id = p_event_id;
end;
$$;

grant execute on function public.register_event_contestant(bigint, jsonb) to anon, authenticated;
grant execute on function public.add_event_audience_score(bigint, jsonb) to anon, authenticated;
grant execute on function public.add_event_generated_report(bigint, jsonb) to anon, authenticated;

-- Check: every event should now have an owner (expect 0).
select count(*) as events_without_owner from public.events where owner_id is null;
