-- Reverts 019: per-row student visibility policies (Phase 1 form).
alter policy profiles_read on public.profiles
  using (private.can_view_student(id) or (id = (select auth.uid())) or (select private.has_global_permission('records.view_all')));
alter policy students_read on public.students
  using (private.can_view_student(profile_id));
drop function if exists private.can_view_all_students();
drop function if exists private.can_view_some_students();
drop function if exists private.scoped_visible_student_ids();
