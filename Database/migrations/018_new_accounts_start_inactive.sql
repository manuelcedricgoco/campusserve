-- =============================================================================
-- 018 - New sign-ups start inactive until an administrator activates them
-- -----------------------------------------------------------------------------
-- Found in Phase 3 security testing. Supabase Auth public sign-up was enabled on
-- the project, and every new auth user got an ACTIVE profile (plus the 'student'
-- role). A self-registered stranger could not reach any student's records, but
-- could read campus-members-only content (assistant knowledge marked
-- 'authenticated', non-public map layers, organizations, policies, fees,
-- clearance templates) and use the assistant quota.
--
-- CampusServe accounts are issued by the university. New profiles are now
-- created with is_active = false; every RLS policy and workflow function already
-- requires an active profile (private.is_active_user()). An administrator
-- activates the account in Administration -> Users (or links it to a student
-- record and activates it). Existing profiles are not changed.
--
-- Also disable public sign-up in the Supabase dashboard (Authentication ->
-- Sign In / Providers -> "Allow new users to sign up"); this migration is the
-- database-side safeguard if sign-up is ever re-enabled.
--
-- First administrator of a NEW project: after creating the auth user, run
--   update public.profiles set is_active = true where email = '<admin email>';
--   insert into public.user_roles (user_id, role) select id, 'administrator'
--     from public.profiles where email = '<admin email>';
-- Rollback: Database/rollback/018_down.sql
-- =============================================================================
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, is_active)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''), false)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;
