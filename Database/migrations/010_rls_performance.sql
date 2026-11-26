-- =============================================================================
-- CampusServe 010: RLS performance (Supabase advisor: auth_rls_initplan)
--
-- Wrapping auth.uid() and row-independent permission checks in (select ...)
-- lets PostgreSQL evaluate them once per query (an InitPlan) instead of once
-- per row. The access rules are unchanged; only how often they are evaluated.
-- =============================================================================

alter policy profiles_read on public.profiles
  using (private.can_view_student(id)
         or id = (select auth.uid())
         or (select private.has_global_permission('records.view_all')));

alter policy user_roles_read on public.user_roles
  using (user_id = (select auth.uid()) or (select private.has_global_permission('users.manage')));

alter policy office_staff_read on public.office_staff
  using (user_id = (select auth.uid())
         or (select private.has_global_permission('users.manage'))
         or private.has_office_permission(office_id, 'queue.manage'));

alter policy organization_assignments_read on public.organization_assignments
  using (user_id = (select auth.uid())
         or (select private.has_global_permission('users.manage'))
         or private.has_org_permission(organization_id, 'org.view_members'));

alter policy academic_assignments_read on public.academic_assignments
  using (user_id = (select auth.uid()) or (select private.has_global_permission('users.manage')));

alter policy organization_members_read on public.organization_members
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_org_permission(organization_id, 'org.view_members'));

alter policy service_requests_read on public.service_requests
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_office_permission(office_id, 'requests.manage'));

alter policy queue_tickets_read on public.queue_tickets
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_office_permission(office_id, 'queue.manage'));

alter policy receipt_records_read on public.receipt_records
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_org_permission(organization_id, 'receipts.view'));

alter policy remittance_batches_read on public.remittance_batches
  using (class_officer_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_org_permission(organization_id, 'remittance.review'));

alter policy remittance_batch_items_read on public.remittance_batch_items
  using (student_id = (select auth.uid())
         or exists (select 1 from public.remittance_batches b where b.id = batch_id));

alter policy guidance_records_read on public.guidance_records
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_office_permission(office_id, 'guidance.manage'));

alter policy library_records_read on public.library_records
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_office_permission(office_id, 'library.manage'));

alter policy violation_records_read on public.violation_records
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_org_permission(organization_id, 'violations.view'));

alter policy penalty_assessments_read on public.penalty_assessments
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_org_permission(organization_id, 'penalties.view'));

alter policy community_service_records_read on public.community_service_records
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('records.view_all'))
         or private.has_org_permission(organization_id, 'penalties.view'));

alter policy penalty_payments_read on public.penalty_payments
  using (student_id = (select auth.uid())
         or (select private.has_global_permission('payments.view_all'))
         or private.has_org_permission(organization_id, 'payments.verify')
         or private.has_org_permission(organization_id, 'penalties.view'));

alter policy payment_webhook_events_read on public.payment_webhook_events
  using ((select private.has_global_permission('payments.view_webhooks')));

alter policy payment_reconciliation_records_read on public.payment_reconciliation_records
  using ((select private.has_global_permission('payments.view_all'))
         or private.has_org_permission(organization_id, 'payments.reconcile'));

alter policy notifications_read_own on public.notifications
  using (user_id = (select auth.uid()));

alter policy notifications_mark_read_own on public.notifications
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy audit_logs_read on public.audit_logs
  using ((select private.has_global_permission('audit.view')));

-- Reference data policies: evaluate the active-account check once per query.
do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years', 'departments', 'organizations', 'clubs', 'programs', 'offices',
    'permissions', 'positions', 'position_permissions', 'role_permissions', 'system_settings',
    'services', 'queue_schedules', 'queue_slots', 'receipt_obligations', 'organization_events',
    'violation_policies', 'violation_policy_versions',
    'clearance_templates', 'clearance_steps', 'clearance_requirements']
  loop
    execute format('alter policy %I on public.%I using ((select private.is_active_user()))',
                   t || '_read_signed_in', t);
  end loop;
end $$;
