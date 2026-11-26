-- =============================================================================
-- CampusServe 015: integrate AI, GIS and automation with existing modules
--
-- Changes to existing tables are ADDITIVE and NULLABLE (decision D7): no
-- existing column, constraint, function or row changes. Event-capture
-- triggers only record an event when an enabled automation rule listens for
-- it, and can never make the business change fail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Additive columns
-- -----------------------------------------------------------------------------
alter table public.services
  add column target_processing_days integer check (target_processing_days between 1 and 365);
comment on column public.services.target_processing_days is
  'Optional target processing time (calendar days). Unconfirmed per office: null until configured.';

alter table public.service_requests
  add column due_at timestamptz,
  add column ai_suggested_category text,
  add column ai_suggestion_confidence numeric(4, 3) check (ai_suggestion_confidence between 0 and 1),
  add column ai_suggested_at timestamptz;
comment on column public.service_requests.ai_suggested_category is
  'AI suggestion for office staff only. Never used as a decision.';

alter table public.student_clearances
  add column due_date date;
comment on column public.student_clearances.due_date is 'Optional clearance deadline set by the initiating office.';

-- due_at defaults from the service's target processing time when configured.
create or replace function private.set_request_due_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
begin
  if new.due_at is null then
    select target_processing_days into v_days from public.services where id = new.service_id;
    if v_days is not null then
      new.due_at := new.submitted_at + make_interval(days => v_days);
    end if;
  end if;
  return new;
end;
$$;
create trigger service_requests_set_due_at before insert on public.service_requests
  for each row execute function private.set_request_due_at();

-- Office staff may record the AI suggestion; it changes nothing else.
create or replace function public.record_request_ai_suggestion(
  p_request_id uuid, p_category text, p_confidence numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_office uuid;
begin
  select office_id into v_office from public.service_requests where id = p_request_id;
  if v_office is null then
    perform private.fail('REQUEST_NOT_FOUND', 'Request not found.');
  end if;
  -- service role (backend AI worker) or office staff of the request's office
  if auth.uid() is not null and not private.has_office_permission(v_office, 'requests.manage') then
    perform private.fail('FORBIDDEN', 'You cannot annotate this request.', '42501');
  end if;
  update public.service_requests
     set ai_suggested_category = p_category, ai_suggestion_confidence = p_confidence, ai_suggested_at = now()
   where id = p_request_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Event capture on existing tables
-- -----------------------------------------------------------------------------
create or replace function private.capture_automation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_payload jsonb;
  v_org uuid;
  v_office uuid;
  v_status text;
  v_student uuid;
begin
  begin
    case tg_table_name
      when 'service_requests' then
        if tg_op = 'INSERT' then
          v_type := 'service_request.submitted';
        elsif new.status is distinct from old.status then
          v_type := 'service_request.status_changed';
        end if;
        v_office := new.office_id;
        v_payload := jsonb_build_object('request_id', new.id, 'request_number', new.request_number,
          'student_id', new.student_id, 'office_id', new.office_id, 'service_id', new.service_id,
          'from_status', case when tg_op = 'UPDATE' then old.status end, 'status', new.status);
      when 'queue_tickets' then
        if tg_op = 'UPDATE' and new.status is distinct from old.status then
          v_type := 'queue_ticket.status_changed';
        end if;
        v_office := new.office_id;
        v_payload := jsonb_build_object('ticket_id', new.id, 'student_id', new.student_id, 'office_id', new.office_id,
          'service_id', new.service_id, 'queue_number', new.queue_number,
          'from_status', case when tg_op = 'UPDATE' then old.status end, 'status', new.status);
      when 'receipt_records' then
        if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
          v_type := 'receipt.verified';
        end if;
        v_org := new.organization_id;
        v_payload := jsonb_build_object('receipt_id', new.id, 'receipt_number', new.receipt_number,
          'student_id', new.student_id, 'organization_id', new.organization_id, 'status', new.status);
      when 'guidance_records' then
        if tg_op = 'INSERT' or new.slip_status is distinct from old.slip_status
           or new.teacher_evaluations_status is distinct from old.teacher_evaluations_status then
          v_type := 'clearance.requirement_changed';
        end if;
        v_office := new.office_id;
        v_payload := jsonb_build_object('student_id', new.student_id, 'requirement', 'guidance',
          'status', new.slip_status, 'teacher_evaluations_status', new.teacher_evaluations_status);
      when 'library_records' then
        if tg_op = 'INSERT' or new.slip_status is distinct from old.slip_status
           or new.receipt_status is distinct from old.receipt_status
           or new.id_validation_status is distinct from old.id_validation_status then
          v_type := 'clearance.requirement_changed';
        end if;
        v_office := new.office_id;
        v_payload := jsonb_build_object('student_id', new.student_id, 'requirement', 'library',
          'status', new.slip_status, 'receipt_status', new.receipt_status,
          'id_validation_status', new.id_validation_status);
      when 'clearance_approvals' then
        if tg_op = 'UPDATE' and new.status is distinct from old.status then
          v_type := 'clearance.step_status_changed';
        end if;
        select student_id into v_student from public.student_clearances where id = new.student_clearance_id;
        v_org := new.organization_id;
        v_office := new.office_id;
        v_payload := jsonb_build_object('clearance_id', new.student_clearance_id, 'student_id', v_student,
          'step_key', new.step_key, 'step_name', new.step_name,
          'from_status', case when tg_op = 'UPDATE' then old.status end, 'status', new.status);
      when 'student_clearances' then
        if tg_op = 'UPDATE' and new.status is distinct from old.status then
          v_type := 'clearance.status_changed';
        end if;
        v_payload := jsonb_build_object('clearance_id', new.id, 'student_id', new.student_id,
          'clearance_number', new.clearance_number,
          'from_status', case when tg_op = 'UPDATE' then old.status end, 'status', new.status);
      when 'penalty_payments' then
        if tg_op = 'UPDATE' and new.status is distinct from old.status then
          v_type := 'payment.status_changed';
        end if;
        v_org := new.organization_id;
        v_payload := jsonb_build_object('payment_id', new.id, 'reference', new.reference, 'student_id', new.student_id,
          'organization_id', new.organization_id, 'amount', new.amount, 'provider', new.provider,
          'from_status', case when tg_op = 'UPDATE' then old.status end, 'status', new.status);
      when 'community_service_records' then
        if tg_op = 'UPDATE' and new.status is distinct from old.status then
          v_type := 'community_service.status_changed';
        end if;
        v_org := new.organization_id;
        v_payload := jsonb_build_object('record_id', new.id, 'student_id', new.student_id,
          'organization_id', new.organization_id, 'hours_rendered', new.hours_rendered, 'status', new.status);
      when 'violation_records' then
        if tg_op = 'UPDATE' and new.status is distinct from old.status then
          v_type := 'violation.status_changed';
        end if;
        v_org := new.organization_id;
        v_payload := jsonb_build_object('violation_id', new.id, 'student_id', new.student_id,
          'organization_id', new.organization_id,
          'from_status', case when tg_op = 'UPDATE' then old.status end, 'status', new.status);
    end case;

    if v_type is not null then
      v_status := v_payload ->> 'status';
      perform private.emit_automation_event(v_type, tg_table_name, new.id::text, v_org, v_office, v_payload,
        format('%s:%s:%s:%s:%s', tg_table_name, new.id, v_type, coalesce(v_status, ''), txid_current()));
    end if;
  exception when others then
    insert into public.automation_error_logs (source, error_code, error_message, details)
    values ('event_capture', sqlstate, sqlerrm, jsonb_build_object('table', tg_table_name, 'op', tg_op));
  end;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['service_requests', 'queue_tickets', 'receipt_records', 'guidance_records', 'library_records',
                           'clearance_approvals', 'student_clearances', 'penalty_payments',
                           'community_service_records', 'violation_records'] loop
    execute format('create trigger %I after insert or update on public.%I '
                   'for each row execute function private.capture_automation_event()',
                   t || '_automation_event', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Permissions for the new modules
-- -----------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('ai.view_usage',               'View AI usage and feedback statistics (no conversation content).'),
  ('ai.manage_knowledge',         'Manage AI knowledge sources and documents.'),
  ('ai.manage_providers',         'Configure AI providers, models, limits and prompt templates.'),
  ('automation.view',             'View automation rules and execution history within scope.'),
  ('automation.manage',           'Configure automation rules, templates and scheduled jobs.'),
  ('gis.view_restricted',         'View restricted map layers and locations.'),
  ('gis.manage',                  'Register and edit campus GIS data.'),
  ('gis.manage_office_locations', 'Register and edit the locations of the holder''s office.'),
  ('gis.verify',                  'Verify, reject or retire GIS data entered by someone else.');

insert into public.role_permissions (role, permission_code) values
  ('administrator', 'ai.view_usage'), ('administrator', 'ai.manage_knowledge'), ('administrator', 'ai.manage_providers'),
  ('administrator', 'automation.view'), ('administrator', 'automation.manage'),
  ('administrator', 'gis.view_restricted'), ('administrator', 'gis.manage'), ('administrator', 'gis.verify');

insert into public.position_permissions (position_code, permission_code) values
  ('office_head', 'gis.manage_office_locations'), ('sas_head', 'gis.manage_office_locations'),
  ('office_head', 'ai.manage_knowledge'), ('sas_head', 'ai.manage_knowledge'),
  ('office_head', 'automation.view'), ('sas_head', 'automation.view'),
  ('governor', 'automation.view'), ('mayor', 'automation.view'), ('president', 'automation.view');

-- -----------------------------------------------------------------------------
-- 4. Private storage buckets (backend-only access, as for existing buckets)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('ai-knowledge', 'ai-knowledge', false, 20971520,
     array['application/pdf', 'text/plain', 'text/markdown', 'text/html',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('gis-imports', 'gis-imports', false, 10485760, array['application/geo+json', 'application/json'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
