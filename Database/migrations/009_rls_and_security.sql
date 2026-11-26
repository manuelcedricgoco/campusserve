-- =============================================================================
-- CampusServe 009: Row Level Security, grants, storage, realtime, triggers
--
-- Access model
--   * anon: no table access at all.
--   * authenticated: SELECT only, filtered by RLS. Every write goes through a
--     SECURITY DEFINER workflow function that enforces the business rules
--     (or through the trusted backend with the service role). The one direct
--     write is marking your own notifications as read.
--   * service_role: bypasses RLS; used only by the backend, never in a browser.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enable RLS on every CampusServe table
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Grants
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Functions: nothing is executable by default.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- Helpers referenced by RLS policies (they only answer about auth.uid()).
grant execute on function
  private.current_academic_year_id(),
  private.is_active_user(),
  private.has_role(text),
  private.has_global_permission(text),
  private.has_org_permission(uuid, text),
  private.has_office_permission(uuid, text),
  private.has_program_permission(uuid, text),
  private.holds_position(text, uuid, uuid, uuid),
  private.can_view_student(uuid),
  private.can_view_clearance(uuid)
to authenticated, service_role;

-- Workflow functions callable by signed-in users (each checks the caller).
grant execute on function
  public.record_individual_receipt(uuid, uuid, numeric, text),
  public.verify_receipt_record(uuid, text, text),
  public.create_remittance_batch(uuid, numeric, uuid, text),
  public.upsert_remittance_batch_item(uuid, uuid, numeric),
  public.remove_remittance_batch_item(uuid),
  public.submit_remittance_batch(uuid),
  public.begin_remittance_batch_review(uuid, numeric),
  public.verify_remittance_batch_item(uuid, text, text),
  public.finish_remittance_batch_review(uuid, text, text),
  public.confirm_teacher_evaluations(uuid, uuid, text),
  public.issue_guidance_slip(uuid, uuid),
  public.validate_library_id(uuid, uuid, text, text, text),
  public.verify_library_receipt(uuid, uuid, text, numeric, text, text),
  public.issue_library_slip(uuid, uuid),
  public.calculate_violation_count(uuid, integer),
  public.calculate_penalty(uuid, integer),
  public.report_violation(uuid, uuid, text, uuid, integer, date, text),
  public.review_violation(uuid, text, text),
  public.file_violation_dispute(uuid, text),
  public.decide_violation_dispute(uuid, text, text),
  public.assess_penalty(uuid, uuid),
  public.select_penalty_resolution(uuid, text),
  public.submit_community_service(uuid, date, numeric, text, text),
  public.verify_community_service(uuid, text, text),
  public.create_penalty_payment(uuid, text, text),
  public.verify_penalty_payment(uuid, text, text),
  public.record_payment_reconciliation(uuid, text, text, numeric, text, text),
  public.reserve_queue_slot(uuid),
  public.cancel_queue_ticket(uuid, text),
  public.reschedule_queue_ticket(uuid, uuid),
  public.update_queue_ticket_status(uuid, text, text),
  public.call_next_queue_ticket(uuid),
  public.generate_queue_slots(uuid, date, date),
  public.submit_service_request(uuid, text, text),
  public.update_service_request_status(uuid, text, text),
  public.initiate_student_clearance(uuid, uuid),
  public.evaluate_student_clearance(uuid),
  public.approve_clearance_step(uuid, text),
  public.return_clearance_step(uuid, text),
  public.cancel_student_clearance(uuid, text)
to authenticated;

-- Payment provider integration: backend (service role) only.
grant execute on function
  public.attach_payment_checkout(uuid, text, text, timestamptz),
  public.process_payment_webhook(text, text, text, boolean, jsonb, text, text, text, numeric)
to service_role;

-- -----------------------------------------------------------------------------
-- 3. Policies
-- -----------------------------------------------------------------------------

-- Reference and configuration data: readable by any signed-in user.
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
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_active_user())',
      t || '_read_signed_in', t);
  end loop;
end $$;

-- Identity -------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated
  using (private.can_view_student(id)
         or id = auth.uid()
         or private.has_global_permission('records.view_all'));

create policy students_read on public.students for select to authenticated
  using (private.can_view_student(profile_id));

create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or private.has_global_permission('users.manage'));

create policy office_staff_read on public.office_staff for select to authenticated
  using (user_id = auth.uid()
         or private.has_global_permission('users.manage')
         or private.has_office_permission(office_id, 'queue.manage'));

create policy organization_assignments_read on public.organization_assignments for select to authenticated
  using (user_id = auth.uid()
         or private.has_global_permission('users.manage')
         or private.has_org_permission(organization_id, 'org.view_members'));

create policy academic_assignments_read on public.academic_assignments for select to authenticated
  using (user_id = auth.uid() or private.has_global_permission('users.manage'));

create policy organization_members_read on public.organization_members for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_org_permission(organization_id, 'org.view_members'));

-- Services and queue -----------------------------------------------------------
create policy service_requests_read on public.service_requests for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_office_permission(office_id, 'requests.manage'));

create policy request_documents_read on public.request_documents for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = request_id));

create policy request_status_history_read on public.request_status_history for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = request_id));

create policy queue_tickets_read on public.queue_tickets for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_office_permission(office_id, 'queue.manage'));

create policy queue_events_read on public.queue_events for select to authenticated
  using (exists (select 1 from public.queue_tickets t where t.id = ticket_id));

-- Receipts and remittance -------------------------------------------------------
create policy receipt_records_read on public.receipt_records for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_org_permission(organization_id, 'receipts.view'));

create policy receipt_verifications_read on public.receipt_verifications for select to authenticated
  using (exists (select 1 from public.receipt_records r where r.id = receipt_record_id));

create policy remittance_batches_read on public.remittance_batches for select to authenticated
  using (class_officer_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_org_permission(organization_id, 'remittance.review'));

create policy remittance_batch_items_read on public.remittance_batch_items for select to authenticated
  using (student_id = auth.uid()
         or exists (select 1 from public.remittance_batches b where b.id = batch_id));

-- Guidance and library -------------------------------------------------------------
create policy guidance_records_read on public.guidance_records for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_office_permission(office_id, 'guidance.manage'));

create policy library_records_read on public.library_records for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_office_permission(office_id, 'library.manage'));

-- Violations and penalties ------------------------------------------------------------
create policy violation_records_read on public.violation_records for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_org_permission(organization_id, 'violations.view'));

create policy violation_evidence_read on public.violation_evidence for select to authenticated
  using (exists (select 1 from public.violation_records v where v.id = violation_record_id));

create policy violation_reviews_read on public.violation_reviews for select to authenticated
  using (exists (select 1 from public.violation_records v where v.id = violation_record_id));

create policy violation_disputes_read on public.violation_disputes for select to authenticated
  using (exists (select 1 from public.violation_records v where v.id = violation_record_id));

create policy penalty_assessments_read on public.penalty_assessments for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_org_permission(organization_id, 'penalties.view'));

create policy penalty_resolutions_read on public.penalty_resolutions for select to authenticated
  using (exists (select 1 from public.penalty_assessments a where a.id = assessment_id));

create policy community_service_records_read on public.community_service_records for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('records.view_all')
         or private.has_org_permission(organization_id, 'penalties.view'));

-- Payments -----------------------------------------------------------------------------
create policy penalty_payments_read on public.penalty_payments for select to authenticated
  using (student_id = auth.uid()
         or private.has_global_permission('payments.view_all')
         or private.has_org_permission(organization_id, 'payments.verify')
         or private.has_org_permission(organization_id, 'penalties.view'));

create policy payment_webhook_events_read on public.payment_webhook_events for select to authenticated
  using (private.has_global_permission('payments.view_webhooks'));

create policy payment_reconciliation_records_read on public.payment_reconciliation_records for select to authenticated
  using (private.has_global_permission('payments.view_all')
         or private.has_org_permission(organization_id, 'payments.reconcile'));

-- Clearance -----------------------------------------------------------------------------
create policy student_clearances_read on public.student_clearances for select to authenticated
  using (private.can_view_clearance(id));

create policy clearance_approvals_read on public.clearance_approvals for select to authenticated
  using (private.can_view_clearance(student_clearance_id));

create policy clearance_requirement_status_read on public.clearance_requirement_status for select to authenticated
  using (private.can_view_clearance(student_clearance_id));

create policy clearance_history_read on public.clearance_history for select to authenticated
  using (private.can_view_clearance(student_clearance_id));

-- System --------------------------------------------------------------------------------
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_read_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_logs_read on public.audit_logs for select to authenticated
  using (private.has_global_permission('audit.view'));

-- -----------------------------------------------------------------------------
-- 4. updated_at triggers on every table that has the column
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      t.table_name || '_set_updated_at', t.table_name);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Audit triggers on important tables
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_roles', 'office_staff', 'organization_assignments', 'academic_assignments', 'programs',
    'system_settings', 'receipt_obligations', 'receipt_records', 'remittance_batches', 'remittance_batch_items',
    'guidance_records', 'library_records', 'violation_policies', 'violation_policy_versions',
    'violation_records', 'violation_disputes', 'penalty_assessments', 'penalty_resolutions',
    'community_service_records', 'penalty_payments', 'payment_reconciliation_records',
    'clearance_templates', 'student_clearances', 'clearance_approvals']
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function private.audit_row_change()',
      t || '_audit', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Private storage buckets. No storage.objects policies are created, so only
--    the backend (service role) can read or write files; it checks the
--    caller's access and hands out short-lived signed URLs.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('violation-evidence',       'violation-evidence',       false, 5242880,
     array['image/jpeg', 'image/png', 'application/pdf']),
  ('request-documents',        'request-documents',        false, 10485760,
     array['image/jpeg', 'image/png', 'application/pdf']),
  ('community-service-proofs', 'community-service-proofs', false, 5242880,
     array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 7. Realtime for queue boards and notifications (RLS still applies)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['queue_tickets', 'queue_slots', 'notifications'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 8. Default configuration (system settings, not sample data)
-- -----------------------------------------------------------------------------
insert into public.system_settings (key, value, description, is_confirmed) values
  ('campus.timezone', '"Asia/Manila"', 'Time zone used for queue slot times.', true),
  ('payments.enabled_providers', '[]',
   'Payment providers students may use. Add "gcash", "maya" or "landbank" only after merchant onboarding, '
   'official API access, credentials, webhook validation and end-to-end tests are complete.', true),
  ('library.slip_prerequisites', '["id_validation"]',
   'What must be complete before a library clearance slip is issued: any of "id_validation", "receipt". '
   'UNCONFIRMED default: confirm with the Library.', false),
  ('clearance.guidance_library_parallel', 'true',
   'Guidance and Library requirements can be completed independently or in parallel.', false)
on conflict (key) do nothing;
