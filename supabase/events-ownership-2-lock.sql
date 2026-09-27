-- ============================================================================
-- Event ownership — PART 2 of 2 (lock). Run only AFTER part 1 and after the
-- app version that uses register_event_contestant / add_event_audience_score
-- / add_event_generated_report is live — older app builds write those
-- straight to the events table and would be refused once this runs.
--
-- Replaces "Allow anon full access to events" (anyone, even signed out,
-- could edit or wipe any event) with:
--   read    anyone (public event pages, landing, registration)
--   create  active organizers and admins
--   edit    the event's owner, or an admin (owner can't hand it to someone else)
--   delete  the event's owner, or an admin
-- The service-role key (cron, backups) bypasses RLS and is unaffected.
-- ============================================================================

drop policy if exists "Allow anon full access to events" on public.events;

drop policy if exists "Anyone can read events" on public.events;
create policy "Anyone can read events"
on public.events for select
to anon, authenticated
using (true);

drop policy if exists "Active organizers and admins can create events" on public.events;
create policy "Active organizers and admins can create events"
on public.events for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()::text
      and profiles.role in ('organizer', 'admin')
      and profiles.status = 'active'
  )
);

drop policy if exists "Owners and admins can edit events" on public.events;
create policy "Owners and admins can edit events"
on public.events for update
to authenticated
using (owner_id = auth.uid()::text or public.is_admin_user())
with check (owner_id = auth.uid()::text or public.is_admin_user());

drop policy if exists "Owners and admins can delete events" on public.events;
create policy "Owners and admins can delete events"
on public.events for delete
to authenticated
using (owner_id = auth.uid()::text or public.is_admin_user());

-- Check: should list the four policies above plus "Only staff can delete".
select policyname, cmd, permissive from pg_policies where schemaname = 'public' and tablename = 'events' order by policyname;
