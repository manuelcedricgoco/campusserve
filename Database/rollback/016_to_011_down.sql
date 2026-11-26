-- =============================================================================
-- ROLLBACK of migrations 011-016 (AI, GIS, automation extension).
-- Restores the schema to exactly what migrations 001-010 created (verified
-- locally by comparing every function, column, constraint, policy, index and
-- grant). DESTRUCTIVE: deletes all AI, GIS and automation data. Review and
-- back up before running. Audit log rows are append-only and are kept.
-- =============================================================================
begin;

-- pg_cron jobs created by CampusServe
do $$
declare
  j record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for j in select jobname from cron.job where jobname like 'campusserve_%' loop
      perform cron.unschedule(j.jobname);
    end loop;
  end if;
end $$;

-- Triggers added to existing tables
do $$
declare
  t text;
begin
  foreach t in array array['service_requests', 'queue_tickets', 'receipt_records', 'guidance_records', 'library_records',
                           'clearance_approvals', 'student_clearances', 'penalty_payments',
                           'community_service_records', 'violation_records'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_automation_event', t);
  end loop;
end $$;
drop trigger if exists service_requests_set_due_at on public.service_requests;

-- New tables (CASCADE removes only functions/policies that depend on these new tables)
drop table if exists
  public.notification_delivery_logs, public.automation_error_logs, public.automation_execution_logs,
  public.automation_executions, public.automation_events, public.scheduled_jobs, public.automation_actions,
  public.automation_rules, public.notification_templates, public.automation_triggers,
  public.gis_location_verifications, public.location_accessibility, public.campus_paths, public.campus_path_nodes,
  public.service_locations, public.office_locations, public.campus_locations, public.campus_building_boundaries,
  public.campus_buildings, public.campus_map_layers, public.campuses, public.location_categories, public.gis_data_sources,
  public.ai_usage_logs, public.ai_processing_logs, public.ai_feedback, public.ai_messages, public.ai_conversations,
  public.ai_embeddings, public.ai_document_chunks, public.ai_knowledge_documents, public.ai_knowledge_sources,
  public.ai_prompt_templates, public.ai_provider_settings
cascade;

-- Remaining new functions
drop function if exists
  public.record_request_ai_suggestion(uuid, text, numeric),
  private.capture_automation_event(),
  private.set_request_due_at(),
  private.emit_automation_event(text, text, text, uuid, uuid, jsonb, text),
  private.evaluate_automation_conditions(jsonb, jsonb),
  private.validate_automation_conditions(),
  private.render_template(text, jsonb),
  private.automation_recipients(jsonb, uuid, uuid),
  private.automation_notify(bigint, uuid, text, jsonb),
  private.automation_execute(bigint),
  private.automation_sync_cron(),
  public.automation_run_due(integer),
  public.automation_complete_execution(bigint, boolean, jsonb, text),
  public.automation_run_scheduled_job(text),
  public.automation_set_rule_enabled(uuid, boolean),
  public.automation_save_notification_template(text, text, text, text, text),
  public.gis_link_service_location(uuid, uuid, boolean),
  public.gis_verify_feature(text, text, text, text, text, text),
  public.gis_map_features(uuid, text[], boolean, boolean),
  public.gis_search_locations(uuid, text, integer, boolean),
  public.gis_find_route(uuid, uuid, integer, boolean, boolean),
  public.gis_nearest_service_locations(uuid, double precision, double precision, integer),
  public.gis_activity_by_location(uuid, timestamptz, timestamptz, text),
  public.gis_import_geojson(uuid, text, jsonb, text, boolean),
  private.can_view_gis(text, uuid),
  private.can_edit_location(uuid, uuid),
  private.gis_point_from_geojson(jsonb),
  private.gis_require_in_campus(uuid, extensions.geometry),
  private.gis_node_for(uuid, extensions.geometry),
  private.gis_prepare_path(),
  private.prevent_history_mutation(),
  private.gis_geometry_ok(extensions.geometry),
  private.gis_status_ok(text),
  public.search_knowledge(text, extensions.vector, uuid, integer, double precision, boolean),
  public.ai_record_processing_stage(uuid, text, text, integer, text, jsonb),
  public.ai_submit_feedback(uuid, smallint, text, text),
  private.can_access_knowledge_source(uuid),
  private.can_manage_knowledge_source(uuid),
  private.has_permission_anywhere(text);

-- Columns added to existing tables
alter table public.services drop column if exists target_processing_days;
alter table public.service_requests
  drop column if exists due_at, drop column if exists ai_suggested_category,
  drop column if exists ai_suggestion_confidence, drop column if exists ai_suggested_at;
alter table public.student_clearances drop column if exists due_date;

-- Permission catalog additions
delete from public.position_permissions where permission_code like 'ai.%' or permission_code like 'automation.%'
                                          or permission_code like 'gis.%';
delete from public.role_permissions where permission_code like 'ai.%' or permission_code like 'automation.%'
                                      or permission_code like 'gis.%';
delete from public.permissions where code like 'ai.%' or code like 'automation.%' or code like 'gis.%';

-- Buckets (fails if they still contain files, which is intended)
delete from storage.buckets where id in ('ai-knowledge', 'gis-imports');

-- Extensions (no CampusServe object depends on them any more)
drop extension if exists pg_cron;
drop extension if exists pgrouting;
drop extension if exists postgis;
drop extension if exists vector;
drop extension if exists pg_trgm;

commit;
