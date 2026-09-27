-- ============================================================================
-- Event content lock: once an event leaves draft/upcoming/pending/rejected
-- (i.e. it has been approved and is on its way to happening, live, or done),
-- its core setup can no longer be changed by the organizer — only by an
-- admin. This mirrors EDITABLE_STATUSES in EditEventDetails.jsx, but is
-- enforced here at the database level so it can't be bypassed by calling
-- the API directly.
--
-- Only these 9 columns are locked — confirmed by auditing every other
-- updateEvent() caller in the app (brackets, scoring, schedule, judge
-- invites, attendance, audience voting) to make sure none of them touch
-- these columns; operational writes to everything else keep working
-- exactly as before, at any event status.
-- ============================================================================

create or replace function public.guard_event_content_lock()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin_user() then
    return new;
  end if;

  if coalesce(old.status, '') not in ('draft', 'upcoming', 'pending', 'rejected') then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.location is distinct from old.location
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.criteria is distinct from old.criteria
      or new.max_participants is distinct from old.max_participants
      or new.attendance_tracking is distinct from old.attendance_tracking
      or new.enable_certificates is distinct from old.enable_certificates
    then
      raise exception 'This event has been approved — its core details can no longer be edited. Contact an admin if a change is needed.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_event_content_lock on public.events;
create trigger guard_event_content_lock
before update on public.events
for each row execute function public.guard_event_content_lock();
