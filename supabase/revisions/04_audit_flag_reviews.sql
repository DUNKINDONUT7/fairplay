-- ============================================================================
-- REVISION W04 — "Needs review" for flagged audit entries
--
-- Run after 03_tournament_controls.sql. Safe to re-run. Adds one table; no
-- existing row is changed.
--
-- The admin Audit page lists the entries that need a look first (deletions,
-- role/status changes, results changed outside the app, bulk deletions,
-- corrections, redraws — see src/utils/auditFlags.js). Marking one reviewed
-- or dismissed, with a note, is stored here so every admin sees who handled
-- it and when. Admins only; entries cannot be deleted.
-- ============================================================================

create table if not exists public.audit_flag_reviews (
  flag_key text primary key,
  status text not null check (status in ('reviewed', 'dismissed')),
  note text not null check (char_length(btrim(note)) >= 5),
  reviewed_by text,
  reviewed_by_email text,
  reviewed_at timestamptz not null default timezone('utc', now())
);

alter table public.audit_flag_reviews enable row level security;
revoke all on public.audit_flag_reviews from anon, authenticated;
grant select, insert, update on public.audit_flag_reviews to authenticated;

drop policy if exists "Admins can read flag reviews" on public.audit_flag_reviews;
create policy "Admins can read flag reviews"
on public.audit_flag_reviews for select
to authenticated
using (public.is_admin_user());

drop policy if exists "Admins can record flag reviews" on public.audit_flag_reviews;
create policy "Admins can record flag reviews"
on public.audit_flag_reviews for insert
to authenticated
with check (public.is_admin_user() and reviewed_by = auth.uid()::text);

drop policy if exists "Admins can update flag reviews" on public.audit_flag_reviews;
create policy "Admins can update flag reviews"
on public.audit_flag_reviews for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user() and reviewed_by = auth.uid()::text);

-- Who reviewed is always the signed-in admin, whatever the client sends.
create or replace function public.stamp_flag_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.reviewed_by := auth.uid()::text;
  new.reviewed_by_email := coalesce((select p.email from public.profiles p where p.id = auth.uid()::text), auth.jwt() ->> 'email');
  new.reviewed_at := timezone('utc', now());
  return new;
end;
$$;

revoke execute on function public.stamp_flag_review() from public, anon, authenticated;

drop trigger if exists stamp_flag_review on public.audit_flag_reviews;
create trigger stamp_flag_review
before insert or update on public.audit_flag_reviews
for each row execute function public.stamp_flag_review();

-- Reviews are themselves audited.
drop trigger if exists audit_audit_flag_reviews on public.audit_flag_reviews;
create trigger audit_audit_flag_reviews
after insert or update or delete on public.audit_flag_reviews
for each row execute function public.write_audit_log();

notify pgrst, 'reload schema';
