-- ============================================================================
-- Enforce an event's maximum participants when someone registers.
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- register_event_contestant now refuses a new contestant once the event's
-- max_participants is reached (0 / null = no limit). The check happens under
-- the event's row lock, so simultaneous registrations can't overfill it.
-- ============================================================================

create or replace function public.register_event_contestant(p_event_id bigint, p_contestant jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contestants jsonb;
  v_max integer;
begin
  if p_contestant is null or jsonb_typeof(p_contestant) <> 'object' or coalesce(p_contestant->>'id', '') = '' then
    raise exception 'A contestant with an id is required.';
  end if;

  select coalesce(contestants, '[]'::jsonb), coalesce(max_participants, 0) into v_contestants, v_max
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found.';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_contestants) c where c->>'id' = p_contestant->>'id'
  ) then
    -- Enforce the event's maximum here, under the row lock, so two people
    -- registering at the same moment can't both take the last slot.
    if v_max > 0 and (
      select count(*) from jsonb_array_elements(v_contestants) c
      where coalesce(c->>'name', '') <> '' and c->>'id' !~ '^.+-contestant-[0-9]+$'
    ) >= v_max then
      raise exception 'This event is full. It has reached its maximum of % participants.', v_max;
    end if;
    v_contestants := v_contestants || jsonb_build_array(p_contestant);
    update public.events
    set contestants = v_contestants,
        participants = jsonb_array_length(v_contestants)
    where id = p_event_id;
  end if;

  return v_contestants;
end;
$$;

grant execute on function public.register_event_contestant(bigint, jsonb) to anon, authenticated;
