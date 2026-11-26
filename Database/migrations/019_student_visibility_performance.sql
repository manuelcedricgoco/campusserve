-- =============================================================================
-- 019 - Student visibility policies: same rules, evaluated once per query
-- -----------------------------------------------------------------------------
-- Found in Phase 3 load testing. profiles_read and students_read called
-- private.can_view_student(id) for EVERY row. Postgres cannot apply the caller's
-- own filter (id = auth.uid()) first because auth.uid() is not leakproof, so
-- GET /me scanned every profile running the full permission check:
-- ~1.4 ms per row (438 ms with 310 students; seconds for a real campus).
--
-- Access rules are unchanged. The policies now ask two cheap per-query
-- questions first (evaluated once as initplans):
--   can_view_all_students()  - records.view_all, office staff with students.view,
--                              student-government officers with students.view
--                              (the branches of can_view_student that cover everyone)
--   can_view_some_students() - holds students.view anywhere (program heads,
--                              department/club officers); only then is the set
--                              scoped_visible_student_ids() computed (once).
-- Equivalence was verified by comparing every account's visible profiles and
-- students before and after (Database/tests/100_visibility_equivalence.sql).
-- Rollback: Database/rollback/019_down.sql
-- =============================================================================
create or replace function private.can_view_all_students()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.has_global_permission('records.view_all')
    or exists (
      select 1 from public.office_staff s
      join public.position_permissions pp on pp.position_code = s.position_code and pp.permission_code = 'students.view'
      join public.academic_years ay on ay.id = s.academic_year_id and ay.is_current
      join public.profiles p on p.id = s.user_id and p.is_active
      where s.user_id = auth.uid() and s.is_active)
    or exists (
      select 1 from public.organization_assignments a
      join public.organizations o on o.id = a.organization_id and o.organization_type = 'student_government'
      join public.position_permissions pp on pp.position_code = a.position_code and pp.permission_code = 'students.view'
      join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
      join public.profiles p on p.id = a.user_id and p.is_active
      where a.user_id = auth.uid() and a.is_active));
$$;

create or replace function private.can_view_some_students()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and private.has_permission_anywhere('students.view');
$$;

-- The students visible through the scoped branches of can_view_student, computed once per query. It reuses
-- the same permission functions, evaluated per program and per organization (small tables) instead of per
-- student: program/department heads (has_program_permission), officers of a student's confirmed department
-- organization and of organizations the student actively belongs to this year (has_org_permission).
create or replace function private.scoped_visible_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with progs as (
    select p.id from public.programs p where private.has_program_permission(p.id, 'students.view')
  ), orgs as (
    select o.id from public.organizations o where private.has_org_permission(o.id, 'students.view')
  )
  select st.profile_id from public.students st
   where private.is_active_user() and st.program_id in (select id from progs)
  union
  select st.profile_id from public.students st
    join public.programs prg on prg.id = st.program_id and prg.organization_mapping_status = 'confirmed'
   where private.is_active_user() and prg.department_organization_id in (select id from orgs)
  union
  select m.student_id from public.organization_members m
   where private.is_active_user() and m.status = 'active'
     and m.academic_year_id = private.current_academic_year_id()
     and m.organization_id in (select id from orgs);
$$;

revoke all on function private.scoped_visible_student_ids() from public;
grant execute on function private.scoped_visible_student_ids() to authenticated, service_role;
revoke all on function private.can_view_all_students() from public;
revoke all on function private.can_view_some_students() from public;
grant execute on function private.can_view_all_students() to authenticated, service_role;
grant execute on function private.can_view_some_students() to authenticated, service_role;

alter policy profiles_read on public.profiles
  using (
    id = (select auth.uid())
    or (select private.has_global_permission('records.view_all'))
    or (select private.can_view_all_students())
    or ((select private.can_view_some_students()) and id in (select private.scoped_visible_student_ids()))
  );

alter policy students_read on public.students
  using (
    (profile_id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.can_view_all_students())
    or ((select private.can_view_some_students()) and profile_id in (select private.scoped_visible_student_ids()))
  );
