-- =============================================================================
-- CampusServe 016: RLS, grants, triggers and scheduling for the new modules
--
-- Same access model as 009: anon has no access (decision D2: public map and
-- public assistant are served by the backend); signed-in users SELECT through
-- RLS; all writes go through checked functions or the backend service role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS on every table (idempotent) and table grants for the new tables
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_provider_settings', 'ai_prompt_templates', 'ai_knowledge_sources', 'ai_knowledge_documents',
    'ai_document_chunks', 'ai_embeddings', 'ai_conversations', 'ai_messages', 'ai_feedback',
    'ai_processing_logs', 'ai_usage_logs',
    'gis_data_sources', 'location_categories', 'campuses', 'campus_map_layers', 'campus_buildings',
    'campus_building_boundaries', 'campus_locations', 'office_locations', 'service_locations',
    'campus_path_nodes', 'campus_paths', 'location_accessibility', 'gis_location_verifications',
    'automation_triggers', 'notification_templates', 'automation_rules', 'automation_actions', 'scheduled_jobs',
    'automation_events', 'automation_executions', 'automation_execution_logs', 'automation_error_logs',
    'notification_delivery_logs']
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all sequences in schema public to service_role;

-- -----------------------------------------------------------------------------
-- 2. Function grants
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- 009 grants, re-applied after the blanket revoke above
grant execute on function
  private.current_academic_year_id(), private.is_active_user(), private.has_role(text),
  private.has_global_permission(text), private.has_org_permission(uuid, text),
  private.has_office_permission(uuid, text), private.has_program_permission(uuid, text),
  private.holds_position(text, uuid, uuid, uuid), private.can_view_student(uuid), private.can_view_clearance(uuid)
to authenticated, service_role;

grant execute on function
  public.record_individual_receipt(uuid, uuid, numeric, text), public.verify_receipt_record(uuid, text, text),
  public.create_remittance_batch(uuid, numeric, uuid, text), public.upsert_remittance_batch_item(uuid, uuid, numeric),
  public.remove_remittance_batch_item(uuid), public.submit_remittance_batch(uuid),
  public.begin_remittance_batch_review(uuid, numeric), public.verify_remittance_batch_item(uuid, text, text),
  public.finish_remittance_batch_review(uuid, text, text),
  public.confirm_teacher_evaluations(uuid, uuid, text), public.issue_guidance_slip(uuid, uuid),
  public.validate_library_id(uuid, uuid, text, text, text),
  public.verify_library_receipt(uuid, uuid, text, numeric, text, text), public.issue_library_slip(uuid, uuid),
  public.calculate_violation_count(uuid, integer), public.calculate_penalty(uuid, integer),
  public.report_violation(uuid, uuid, text, uuid, integer, date, text), public.review_violation(uuid, text, text),
  public.file_violation_dispute(uuid, text), public.decide_violation_dispute(uuid, text, text),
  public.assess_penalty(uuid, uuid), public.select_penalty_resolution(uuid, text),
  public.submit_community_service(uuid, date, numeric, text, text), public.verify_community_service(uuid, text, text),
  public.create_penalty_payment(uuid, text, text), public.verify_penalty_payment(uuid, text, text),
  public.record_payment_reconciliation(uuid, text, text, numeric, text, text),
  public.reserve_queue_slot(uuid), public.cancel_queue_ticket(uuid, text), public.reschedule_queue_ticket(uuid, uuid),
  public.update_queue_ticket_status(uuid, text, text), public.call_next_queue_ticket(uuid),
  public.generate_queue_slots(uuid, date, date), public.submit_service_request(uuid, text, text),
  public.update_service_request_status(uuid, text, text), public.initiate_student_clearance(uuid, uuid),
  public.evaluate_student_clearance(uuid), public.approve_clearance_step(uuid, text),
  public.return_clearance_step(uuid, text), public.cancel_student_clearance(uuid, text)
to authenticated;
grant execute on function
  public.attach_payment_checkout(uuid, text, text, timestamptz),
  public.process_payment_webhook(text, text, text, boolean, jsonb, text, text, text, numeric)
to service_role;

-- New helpers referenced by RLS policies (answer only about auth.uid())
grant execute on function
  private.has_permission_anywhere(text), private.can_access_knowledge_source(uuid),
  private.can_manage_knowledge_source(uuid), private.can_view_gis(text, uuid)
to authenticated, service_role;
-- Used inside CHECK constraints; service-role writes evaluate them as the caller
grant execute on function private.gis_geometry_ok(extensions.geometry), private.gis_status_ok(text)
to authenticated, service_role;

-- New workflow functions for signed-in users (each checks the caller)
grant execute on function
  public.search_knowledge(text, extensions.vector, uuid, integer, double precision, boolean),
  public.ai_register_knowledge_source(text, text, text, text, uuid, uuid, text),
  public.ai_approve_official_source(uuid, boolean),
  public.ai_register_document(uuid, text, text, text, text, integer, text, text, uuid, date, text),
  public.ai_submit_feedback(uuid, smallint, text, text),
  public.record_request_ai_suggestion(uuid, text, numeric),
  public.gis_save_location(uuid, uuid, text, jsonb, text, uuid, text, text, text, text, text, uuid, uuid, text, text),
  public.gis_link_service_location(uuid, uuid, boolean),
  public.gis_save_building(uuid, uuid, text, text, smallint, jsonb, uuid, text, text, text),
  public.gis_set_building_boundary(uuid, jsonb, text, text),
  public.gis_save_path(bigint, uuid, jsonb, text, text, boolean, boolean, boolean, text, text),
  public.gis_verify_feature(text, text, text, text, text, text),
  public.gis_set_campus_geometry(uuid, jsonb, jsonb),
  public.gis_map_features(uuid, text[], boolean, boolean),
  public.gis_search_locations(uuid, text, integer, boolean),
  public.gis_find_route(uuid, uuid, integer, boolean, boolean),
  public.gis_nearest_service_locations(uuid, double precision, double precision, integer),
  public.gis_activity_by_location(uuid, timestamptz, timestamptz, text),
  public.gis_import_geojson(uuid, text, jsonb, text, boolean),
  public.automation_save_rule(text, text, text, jsonb, jsonb, text, uuid, uuid),
  public.automation_set_rule_enabled(uuid, boolean),
  public.automation_update_scheduled_job(text, boolean, text, jsonb),
  public.automation_save_notification_template(text, text, text, text, text),
  public.automation_run_scheduled_job(text)
to authenticated;

-- Backend (service role) only
grant execute on function
  public.search_knowledge(text, extensions.vector, uuid, integer, double precision, boolean),
  public.ai_record_processing_stage(uuid, text, text, integer, text, jsonb),
  public.record_request_ai_suggestion(uuid, text, numeric),
  public.gis_map_features(uuid, text[], boolean, boolean),
  public.gis_search_locations(uuid, text, integer, boolean),
  public.gis_find_route(uuid, uuid, integer, boolean, boolean),
  public.automation_run_due(integer),
  public.automation_claim_backend_executions(text, integer),
  public.automation_complete_execution(bigint, boolean, jsonb, text),
  public.automation_run_scheduled_job(text)
to service_role;

-- -----------------------------------------------------------------------------
-- 3. Policies
-- -----------------------------------------------------------------------------
-- AI
create policy ai_provider_settings_read on public.ai_provider_settings for select to authenticated
  using ((select private.has_global_permission('ai.manage_providers'))
         or (select private.has_global_permission('ai.view_usage')));
create policy ai_prompt_templates_read on public.ai_prompt_templates for select to authenticated
  using ((select private.has_global_permission('ai.manage_providers')));
create policy ai_knowledge_sources_read on public.ai_knowledge_sources for select to authenticated
  using (private.can_access_knowledge_source(id));
create policy ai_knowledge_documents_read on public.ai_knowledge_documents for select to authenticated
  using (private.can_manage_knowledge_source(source_id)
         or (is_current and processing_status = 'ready' and private.can_access_knowledge_source(source_id)));
create policy ai_document_chunks_read on public.ai_document_chunks for select to authenticated
  using (exists (select 1 from public.ai_knowledge_documents d where d.id = document_id));
create policy ai_embeddings_read on public.ai_embeddings for select to authenticated
  using ((select private.has_global_permission('ai.manage_knowledge')));
create policy ai_conversations_read_own on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()));
create policy ai_messages_read_own on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id));
create policy ai_feedback_read on public.ai_feedback for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_global_permission('ai.view_usage')));
create policy ai_processing_logs_read on public.ai_processing_logs for select to authenticated
  using (exists (select 1 from public.ai_knowledge_documents d
                 where d.id = document_id and private.can_manage_knowledge_source(d.source_id)));
create policy ai_usage_logs_read on public.ai_usage_logs for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_global_permission('ai.view_usage')));

-- GIS
create policy gis_data_sources_read on public.gis_data_sources for select to authenticated
  using ((select private.is_active_user()));
create policy location_categories_read on public.location_categories for select to authenticated
  using ((select private.is_active_user()));
create policy campuses_read on public.campuses for select to authenticated
  using ((select private.is_active_user()));
create policy campus_map_layers_read on public.campus_map_layers for select to authenticated
  using (private.can_view_gis(visibility, null) or (select private.has_global_permission('gis.manage')));
create policy campus_buildings_read on public.campus_buildings for select to authenticated
  using (private.can_view_gis(visibility, layer_id) or (select private.has_global_permission('gis.manage')));
create policy campus_building_boundaries_read on public.campus_building_boundaries for select to authenticated
  using (exists (select 1 from public.campus_buildings b where b.id = building_id));
create policy campus_locations_read on public.campus_locations for select to authenticated
  using (private.can_view_gis(visibility, layer_id) or (select private.has_global_permission('gis.manage')));
create policy office_locations_read on public.office_locations for select to authenticated
  using (exists (select 1 from public.campus_locations l where l.id = location_id));
create policy service_locations_read on public.service_locations for select to authenticated
  using (exists (select 1 from public.campus_locations l where l.id = location_id));
create policy campus_path_nodes_read on public.campus_path_nodes for select to authenticated
  using ((select private.is_active_user()));
create policy campus_paths_read on public.campus_paths for select to authenticated
  using (private.can_view_gis(visibility, layer_id) or (select private.has_global_permission('gis.manage')));
create policy location_accessibility_read on public.location_accessibility for select to authenticated
  using ((select private.is_active_user()));
create policy gis_location_verifications_read on public.gis_location_verifications for select to authenticated
  using ((select private.has_global_permission('gis.manage')) or (select private.has_global_permission('gis.verify')));

-- Automation
create policy automation_triggers_read on public.automation_triggers for select to authenticated
  using ((select private.has_permission_anywhere('automation.view')));
create policy automation_rules_read on public.automation_rules for select to authenticated
  using ((select private.has_global_permission('automation.view'))
         or (organization_id is not null and private.has_org_permission(organization_id, 'automation.view'))
         or (office_id is not null and private.has_office_permission(office_id, 'automation.view')));
create policy automation_actions_read on public.automation_actions for select to authenticated
  using (exists (select 1 from public.automation_rules r where r.id = rule_id));
create policy scheduled_jobs_read on public.scheduled_jobs for select to authenticated
  using ((select private.has_global_permission('automation.view')));
create policy notification_templates_read on public.notification_templates for select to authenticated
  using ((select private.has_global_permission('automation.view')));
create policy automation_events_read on public.automation_events for select to authenticated
  using ((select private.has_global_permission('automation.view'))
         or (organization_id is not null and private.has_org_permission(organization_id, 'automation.view'))
         or (office_id is not null and private.has_office_permission(office_id, 'automation.view')));
create policy automation_executions_read on public.automation_executions for select to authenticated
  using ((select private.has_global_permission('automation.view'))
         or (organization_id is not null and private.has_org_permission(organization_id, 'automation.view'))
         or (office_id is not null and private.has_office_permission(office_id, 'automation.view')));
create policy automation_execution_logs_read on public.automation_execution_logs for select to authenticated
  using (exists (select 1 from public.automation_executions x where x.id = execution_id));
create policy automation_error_logs_read on public.automation_error_logs for select to authenticated
  using ((select private.has_global_permission('automation.manage')));
create policy notification_delivery_logs_read on public.notification_delivery_logs for select to authenticated
  using (recipient_id = (select auth.uid()) or (select private.has_global_permission('automation.manage')));

-- -----------------------------------------------------------------------------
-- 4. updated_at and audit triggers for the new tables
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.table_name from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'updated_at'
       and c.table_name in ('ai_provider_settings', 'ai_knowledge_sources', 'ai_knowledge_documents',
                            'ai_conversations', 'campuses', 'campus_map_layers', 'campus_buildings',
                            'campus_locations', 'campus_paths', 'location_accessibility', 'automation_rules',
                            'scheduled_jobs', 'notification_delivery_logs')
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
                   t.table_name || '_set_updated_at', t.table_name);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_provider_settings', 'ai_prompt_templates', 'ai_knowledge_sources', 'ai_knowledge_documents',
    'campuses', 'campus_map_layers', 'campus_buildings', 'campus_building_boundaries', 'campus_locations',
    'office_locations', 'service_locations', 'campus_paths', 'location_accessibility',
    'automation_rules', 'automation_actions', 'scheduled_jobs', 'notification_templates']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I '
                   'for each row execute function private.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. pg_cron: the in-database executor runs every minute. It only processes
--    executions of rules an administrator has enabled (all start disabled).
--    Scheduled jobs are registered only when enabled.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'campusserve_automation_executor') then
    perform cron.unschedule('campusserve_automation_executor');
  end if;
  perform cron.schedule('campusserve_automation_executor', '* * * * *', 'select public.automation_run_due(100)');
end $$;
select private.automation_sync_cron();
