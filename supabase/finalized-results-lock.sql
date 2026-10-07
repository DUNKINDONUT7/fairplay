-- ============================================================================
-- Finalized results are permanent.
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- Once results are finalized they can no longer be changed or deleted by
-- anyone using the app or the API — organizers, judges, admins and the
-- service role alike. There is deliberately no admin exception.
--
--   * Brackets: tournaments.is_finalized. After it is set, the matches,
--     scores, rounds, champion, entrants and format are frozen, the bracket
--     cannot be un-finalized or unlocked, and the row cannot be deleted.
--     Only public visibility (publish / unpublish) can still be toggled.
--   * Judge scores: scores.locked already freezes a finalized score
--     (prevent_locked_score_mutation). This adds the missing half — no new
--     score can be added to an event after it has been finalized.
--
-- These are database triggers, so they hold no matter which screen, script or
-- API key makes the request. The one thing a trigger cannot stop is someone
-- with owner access to the database itself removing the trigger.
-- ============================================================================

alter table public.tournaments add column if not exists is_finalized boolean not null default false;
alter table public.tournaments add column if not exists finalized_at timestamptz;

create or replace function public.prevent_finalized_tournament_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.is_finalized then
      raise exception 'This bracket has been finalized. Its results can no longer be deleted.';
    end if;
    return OLD;
  end if;

  if OLD.is_finalized then
    if NEW.is_finalized is distinct from true
      or NEW.is_locked is distinct from true
      or NEW.finalized_at is distinct from OLD.finalized_at
      or NEW.event_id is distinct from OLD.event_id
      or NEW.matches is distinct from OLD.matches
      or NEW.rounds is distinct from OLD.rounds
      or NEW.champion is distinct from OLD.champion
      or NEW.standings is distinct from OLD.standings
      or NEW.teams is distinct from OLD.teams
      or NEW.entrant_snapshot is distinct from OLD.entrant_snapshot
      or NEW.history_log is distinct from OLD.history_log
      or NEW.bracket_type is distinct from OLD.bracket_type
      or NEW.total_rounds is distinct from OLD.total_rounds
      or NEW.total_slots is distinct from OLD.total_slots
      or NEW.byes is distinct from OLD.byes
      or NEW.current_round is distinct from OLD.current_round
    then
      raise exception 'This bracket has been finalized. Its scores and results can no longer be changed.';
    end if;
    return NEW;
  end if;

  -- Being finalized now: stamp the time and lock it in the same write.
  if NEW.is_finalized then
    NEW.finalized_at := coalesce(NEW.finalized_at, timezone('utc', now()));
    NEW.is_locked := true;
  end if;

  return NEW;
end;
$$;

drop trigger if exists lock_finalized_tournaments on public.tournaments;
create trigger lock_finalized_tournaments
before update or delete on public.tournaments
for each row execute function public.prevent_finalized_tournament_mutation();

-- No new judge scores once the event's scoring has been finalized. This is
-- the same condition the judge screens already check before letting a judge
-- submit (status 'completed' with scoringActive switched off).
create or replace function public.prevent_score_after_finalization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.events e
    where e.id = NEW.event_id
      and e.status = 'completed'
      and coalesce(e.metadata->>'scoringActive', '') = 'false'
  ) then
    raise exception 'This event has been finalized. Scores can no longer be submitted.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists block_scores_after_finalization on public.scores;
create trigger block_scores_after_finalization
before insert on public.scores
for each row execute function public.prevent_score_after_finalization();
