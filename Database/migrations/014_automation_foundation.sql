-- =============================================================================
-- CampusServe 014: workflow automation foundation
--
-- Flow (decision D4):
--   change in a business table --trigger--> automation_events (idempotent outbox)
--     --> matching enabled rules --> automation_executions (queued)
--     --> executed by public.automation_run_due() (pg_cron, every minute) for
--         in-database actions, or claimed by the backend worker for external
--         actions (email/SMS/report generation)
--   scheduled_jobs --> pg_cron --> public.automation_run_scheduled_job()
--     --> emits events (e.g. pending-request reminders) --> same pipeline.
--
-- Automation NEVER makes official decisions. Action types are a closed list
-- (CHECK constraint) with no approve / verify / reject / assess / pay action.
-- Failures in automation never roll back the business change that caused them.
-- =============================================================================

create table public.automation_triggers (
  code            text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description     text not null,
  source_table    text,
  payload_fields  text[] not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.notification_templates (
  id            uuid primary key default gen_random_uuid(),
  code          text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  channel       text not null default 'in_app' check (channel in ('in_app', 'email', 'sms')),
  version       integer not null default 1 check (version > 0),
  locale        text not null default 'en',
  subject       text not null,
  body          text not null,
  placeholders  text[] not null default '{}',
  is_active     boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (code, channel, locale, version)
);
create unique index notification_templates_one_active_idx
  on public.notification_templates (code, channel, locale) where is_active;

create table public.automation_rules (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name             text not null,
  description      text,
  trigger_code     text not null references public.automation_triggers (code),
  conditions       jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  organization_id  uuid references public.organizations (id) on delete cascade,
  office_id        uuid references public.offices (id) on delete cascade,
  is_enabled       boolean not null default false,
  version          integer not null default 1 check (version > 0),
  created_by       uuid references public.profiles (id) on delete set null,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint automation_rules_one_scope_chk check (num_nonnulls(organization_id, office_id) <= 1)
);
create index automation_rules_trigger_idx on public.automation_rules (trigger_code) where is_enabled;

create table public.automation_actions (
  id           uuid primary key default gen_random_uuid(),
  rule_id      uuid not null references public.automation_rules (id) on delete cascade,
  step_order   integer not null check (step_order > 0),
  -- Closed list. There is deliberately no approve / verify / reject / assess / pay action.
  action_type  text not null check (action_type in
                 ('send_notification', 'send_reminder', 'escalate_to_position', 'reevaluate_clearance',
                  'generate_report', 'send_email', 'record_note')),
  parameters   jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  is_enabled   boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (rule_id, step_order)
);

create table public.scheduled_jobs (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name             text not null,
  job_type         text not null check (job_type in
                     ('pending_request_reminders', 'overdue_request_escalation', 'clearance_deadline_reminders',
                      'generate_queue_slots', 'scheduled_report', 'expire_public_ai_sessions')),
  cron_expression  text not null check (cron_expression ~ '^\s*(\S+\s+){4}\S+\s*$'),
  parameters       jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  is_enabled       boolean not null default false,
  last_run_at      timestamptz,
  last_status      text check (last_status in ('succeeded', 'failed')),
  last_error       text,
  run_count        integer not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.automation_events (
  id               bigint generated always as identity primary key,
  event_type       text not null references public.automation_triggers (code),
  entity_table     text,
  entity_id        text,
  organization_id  uuid references public.organizations (id) on delete set null,
  office_id        uuid references public.offices (id) on delete set null,
  actor_id         uuid,
  payload          jsonb not null default '{}'::jsonb,
  idempotency_key  text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'processed', 'ignored', 'failed')),
  occurred_at      timestamptz not null default now(),
  processed_at     timestamptz
);
create index automation_events_type_idx on public.automation_events (event_type, occurred_at desc);

create table public.automation_executions (
  id               bigint generated always as identity primary key,
  rule_id          uuid not null references public.automation_rules (id) on delete cascade,
  rule_version     integer not null,
  event_id         bigint not null references public.automation_events (id) on delete cascade,
  organization_id  uuid references public.organizations (id) on delete set null,
  office_id        uuid references public.offices (id) on delete set null,
  executor         text not null default 'database' check (executor in ('database', 'backend')),
  idempotency_key  text not null unique,
  status           text not null default 'queued'
                     check (status in ('queued', 'running', 'succeeded', 'failed', 'dead', 'skipped')),
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  locked_by        text,
  started_at       timestamptz,
  finished_at      timestamptz,
  last_error       text,
  result           jsonb,
  created_at       timestamptz not null default now()
);
create index automation_executions_due_idx on public.automation_executions (executor, next_attempt_at)
  where status = 'queued';
create index automation_executions_rule_idx on public.automation_executions (rule_id, created_at desc);

create table public.automation_execution_logs (
  id            bigint generated always as identity primary key,
  execution_id  bigint not null references public.automation_executions (id) on delete cascade,
  step_order    integer,
  action_type   text,
  status        text not null check (status in ('started', 'succeeded', 'failed', 'skipped')),
  message       text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index automation_execution_logs_execution_idx on public.automation_execution_logs (execution_id, id);

create table public.automation_error_logs (
  id                bigint generated always as identity primary key,
  source            text not null check (source in
                      ('event_capture', 'matcher', 'executor', 'scheduler', 'backend_worker', 'delivery')),
  execution_id      bigint references public.automation_executions (id) on delete set null,
  event_id          bigint references public.automation_events (id) on delete set null,
  scheduled_job_id  uuid references public.scheduled_jobs (id) on delete set null,
  error_code        text,
  error_message     text not null,
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index automation_error_logs_created_idx on public.automation_error_logs (created_at desc);

create table public.notification_delivery_logs (
  id                   bigint generated always as identity primary key,
  notification_id      uuid references public.notifications (id) on delete cascade,
  recipient_id         uuid not null references public.profiles (id) on delete cascade,
  channel              text not null check (channel in ('in_app', 'email', 'sms')),
  template_id          uuid references public.notification_templates (id) on delete set null,
  execution_id         bigint references public.automation_executions (id) on delete set null,
  provider             text,
  status               text not null check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  attempts             integer not null default 0,
  provider_message_id  text,
  error_message        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index notification_delivery_logs_recipient_idx on public.notification_delivery_logs (recipient_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Rule validation
-- -----------------------------------------------------------------------------
create or replace function private.validate_automation_conditions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c jsonb;
begin
  for c in select * from jsonb_array_elements(new.conditions) loop
    if jsonb_typeof(c) <> 'object'
       or coalesce(c ->> 'field', '') !~ '^[a-z_]+(\.[a-z_]+)*$'
       or coalesce(c ->> 'op', '') not in ('eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists') then
      perform private.fail('INVALID_CONDITION',
        'Each condition needs a field (a.b) and an operator: eq, neq, in, not_in, gt, gte, lt, lte, exists, not_exists.');
    end if;
    if c ->> 'op' in ('in', 'not_in') and jsonb_typeof(c -> 'value') <> 'array' then
      perform private.fail('INVALID_CONDITION', 'in / not_in need an array value.');
    end if;
  end loop;
  return new;
end;
$$;
create trigger automation_rules_validate before insert or update of conditions on public.automation_rules
  for each row execute function private.validate_automation_conditions();

create or replace function private.evaluate_automation_conditions(p_conditions jsonb, p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  c jsonb;
  v jsonb;
  v_text text;
  v_num numeric;
begin
  for c in select * from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) loop
    v := p_payload #> string_to_array(c ->> 'field', '.');
    v_text := p_payload #>> string_to_array(c ->> 'field', '.');
    case c ->> 'op'
      when 'exists' then if v is null or v = 'null'::jsonb then return false; end if;
      when 'not_exists' then if v is not null and v <> 'null'::jsonb then return false; end if;
      when 'eq' then if v_text is distinct from (c ->> 'value') then return false; end if;
      when 'neq' then if v_text is not distinct from (c ->> 'value') then return false; end if;
      when 'in' then if v_text is null or not ((c -> 'value') ? v_text) then return false; end if;
      when 'not_in' then if v_text is not null and ((c -> 'value') ? v_text) then return false; end if;
      else
        begin
          v_num := v_text::numeric;
        exception when others then
          return false;
        end;
        if v_num is null then return false; end if;
        if (c ->> 'op' = 'gt' and not v_num > (c ->> 'value')::numeric)
           or (c ->> 'op' = 'gte' and not v_num >= (c ->> 'value')::numeric)
           or (c ->> 'op' = 'lt' and not v_num < (c ->> 'value')::numeric)
           or (c ->> 'op' = 'lte' and not v_num <= (c ->> 'value')::numeric) then
          return false;
        end if;
    end case;
  end loop;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Event capture and matching
-- -----------------------------------------------------------------------------
-- Records an event (only when at least one enabled rule listens for it) and
-- queues matching executions. Never raises: errors are logged instead, so a
-- business transaction can never fail because of automation.
create or replace function private.emit_automation_event(
  p_event_type text, p_entity_table text, p_entity_id text, p_organization_id uuid, p_office_id uuid,
  p_payload jsonb, p_idempotency_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;
  r public.automation_rules;
  v_backend boolean;
begin
  if not exists (select 1 from public.automation_rules where trigger_code = p_event_type and is_enabled) then
    return null;
  end if;
  begin
    insert into public.automation_events
      (event_type, entity_table, entity_id, organization_id, office_id, actor_id, payload, idempotency_key)
    values (p_event_type, p_entity_table, p_entity_id, p_organization_id, p_office_id, auth.uid(),
            coalesce(p_payload, '{}'::jsonb), p_idempotency_key)
    on conflict (idempotency_key) do nothing
    returning id into v_event_id;
    if v_event_id is null then
      return null; -- duplicate
    end if;

    for r in select * from public.automation_rules
              where trigger_code = p_event_type and is_enabled
                and (organization_id is null or organization_id = p_organization_id)
                and (office_id is null or office_id = p_office_id) loop
      if private.evaluate_automation_conditions(r.conditions, coalesce(p_payload, '{}'::jsonb)) then
        select exists (select 1 from public.automation_actions a
                        where a.rule_id = r.id and a.is_enabled and a.action_type in ('generate_report', 'send_email'))
          into v_backend;
        insert into public.automation_executions
          (rule_id, rule_version, event_id, organization_id, office_id, executor, idempotency_key)
        values (r.id, r.version, v_event_id, p_organization_id, p_office_id,
                case when v_backend then 'backend' else 'database' end, r.id || ':' || v_event_id)
        on conflict (idempotency_key) do nothing;
      end if;
    end loop;
    update public.automation_events set status = 'processed', processed_at = now() where id = v_event_id;
  exception when others then
    insert into public.automation_error_logs (source, event_id, error_code, error_message, details)
    values ('matcher', v_event_id, sqlstate, sqlerrm,
            jsonb_build_object('event_type', p_event_type, 'entity_id', p_entity_id));
  end;
  return v_event_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Executor (in-database actions)
-- -----------------------------------------------------------------------------
create or replace function private.render_template(p_text text, p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := p_text;
  k text;
begin
  for k in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if k ~ '^[a-z_]+$' then
      v_out := replace(v_out, '{{' || k || '}}', coalesce(p_payload ->> k, ''));
    end if;
  end loop;
  return regexp_replace(v_out, '\{\{[a-z_]+\}\}', '', 'g');
end;
$$;

-- Recipients of an escalation: active holders of the given positions (or of a
-- permission) in the event's office or organization, current academic year.
create or replace function private.automation_recipients(p_parameters jsonb, p_office_id uuid, p_organization_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct s.user_id
    from public.office_staff s
    join public.academic_years ay on ay.id = s.academic_year_id and ay.is_current
    join public.profiles p on p.id = s.user_id and p.is_active
   where s.is_active and s.office_id = p_office_id
     and ((p_parameters ? 'position_codes' and s.position_code in
             (select jsonb_array_elements_text(p_parameters -> 'position_codes')))
          or (p_parameters ? 'permission' and exists (
                select 1 from public.position_permissions pp
                 where pp.position_code = s.position_code and pp.permission_code = p_parameters ->> 'permission')))
  union
  select distinct a.user_id
    from public.organization_assignments a
    join public.academic_years ay on ay.id = a.academic_year_id and ay.is_current
    join public.profiles p on p.id = a.user_id and p.is_active
   where a.is_active and a.organization_id = p_organization_id
     and ((p_parameters ? 'position_codes' and a.position_code in
             (select jsonb_array_elements_text(p_parameters -> 'position_codes')))
          or (p_parameters ? 'permission' and exists (
                select 1 from public.position_permissions pp
                 where pp.position_code = a.position_code and pp.permission_code = p_parameters ->> 'permission')));
$$;

create or replace function private.automation_notify(
  p_execution_id bigint, p_recipient uuid, p_template_code text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.notification_templates;
  v_notification uuid;
begin
  select * into t from public.notification_templates
   where code = p_template_code and channel = 'in_app' and is_active order by version desc limit 1;
  if not found then
    perform private.fail('TEMPLATE_NOT_FOUND', format('No active in-app template %s.', p_template_code));
  end if;
  insert into public.notifications (user_id, category, title, body, link)
  values (p_recipient, 'automation', private.render_template(t.subject, p_payload),
          private.render_template(t.body, p_payload), p_payload ->> 'link')
  returning id into v_notification;
  insert into public.notification_delivery_logs
    (notification_id, recipient_id, channel, template_id, execution_id, provider, status, attempts)
  values (v_notification, p_recipient, 'in_app', t.id, p_execution_id, 'campusserve', 'delivered', 1);
end;
$$;

create or replace function private.automation_execute(p_execution_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.automation_executions;
  e public.automation_events;
  a public.automation_actions;
  v_recipient uuid;
  v_count integer;
  v_done integer := 0;
  c record;
begin
  select * into x from public.automation_executions where id = p_execution_id;
  select * into e from public.automation_events where id = x.event_id;
  for a in select * from public.automation_actions where rule_id = x.rule_id and is_enabled order by step_order loop
    case a.action_type
      when 'send_notification', 'send_reminder' then
        v_recipient := coalesce((e.payload ->> 'student_id')::uuid, (e.payload ->> 'recipient_id')::uuid);
        if (a.parameters ->> 'recipient') = 'actor' then
          v_recipient := e.actor_id;
        end if;
        if v_recipient is null then
          insert into public.automation_execution_logs (execution_id, step_order, action_type, status, message)
          values (x.id, a.step_order, a.action_type, 'skipped', 'No recipient in the event payload.');
        else
          perform private.automation_notify(x.id, v_recipient, a.parameters ->> 'template_code', e.payload);
          insert into public.automation_execution_logs (execution_id, step_order, action_type, status, details)
          values (x.id, a.step_order, a.action_type, 'succeeded', jsonb_build_object('recipient', v_recipient));
        end if;
      when 'escalate_to_position' then
        v_count := 0;
        for v_recipient in select * from private.automation_recipients(a.parameters, e.office_id, e.organization_id) loop
          perform private.automation_notify(x.id, v_recipient, a.parameters ->> 'template_code', e.payload);
          v_count := v_count + 1;
        end loop;
        insert into public.automation_execution_logs (execution_id, step_order, action_type, status, message, details)
        values (x.id, a.step_order, a.action_type, case when v_count > 0 then 'succeeded' else 'skipped' end,
                case when v_count = 0 then 'No active assignee holds the target position.' end,
                jsonb_build_object('recipients', v_count));
      when 'reevaluate_clearance' then
        v_count := 0;
        for c in select sc.id from public.student_clearances sc
                  where sc.student_id = (e.payload ->> 'student_id')::uuid and sc.status = 'in_progress' loop
          perform private.refresh_clearance_requirements(c.id);
          insert into public.clearance_history (student_clearance_id, event_type, actor_id, details)
          values (c.id, 'evaluated', null, jsonb_build_object('source', 'automation', 'execution_id', x.id));
          v_count := v_count + 1;
        end loop;
        insert into public.automation_execution_logs (execution_id, step_order, action_type, status, details)
        values (x.id, a.step_order, a.action_type, 'succeeded', jsonb_build_object('clearances', v_count));
      when 'record_note' then
        insert into public.automation_execution_logs (execution_id, step_order, action_type, status, message)
        values (x.id, a.step_order, a.action_type, 'succeeded', a.parameters ->> 'note');
      else
        -- generate_report / send_email are backend actions; a database execution never contains them.
        perform private.fail('BACKEND_ACTION', format('Action %s must run in the backend worker.', a.action_type));
    end case;
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('actions', v_done);
end;
$$;

-- Runs due in-database executions. Called by pg_cron every minute (service role / owner only).
create or replace function public.automation_run_due(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.automation_executions;
  v_result jsonb;
  v_ok integer := 0;
  v_failed integer := 0;
begin
  for x in
    select * from public.automation_executions
     where status = 'queued' and executor = 'database' and next_attempt_at <= now()
     order by next_attempt_at
     limit greatest(1, least(coalesce(p_limit, 50), 500))
     for update skip locked
  loop
    update public.automation_executions
       set status = 'running', attempts = attempts + 1, started_at = now(), locked_at = now(), locked_by = 'database'
     where id = x.id;
    begin
      v_result := private.automation_execute(x.id);
      update public.automation_executions
         set status = 'succeeded', finished_at = now(), result = v_result, last_error = null, locked_at = null
       where id = x.id;
      v_ok := v_ok + 1;
    exception when others then
      update public.automation_executions
         set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
             next_attempt_at = now() + make_interval(mins => power(2, attempts)::int),
             last_error = sqlerrm, finished_at = case when attempts >= max_attempts then now() end, locked_at = null
       where id = x.id;
      insert into public.automation_execution_logs (execution_id, status, message)
      values (x.id, 'failed', sqlerrm);
      insert into public.automation_error_logs (source, execution_id, error_code, error_message)
      values ('executor', x.id, sqlstate, sqlerrm);
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('succeeded', v_ok, 'failed', v_failed);
end;
$$;

-- Backend worker (service role): claim and complete 'backend' executions.
create or replace function public.automation_claim_backend_executions(p_worker text, p_limit integer default 10)
returns setof public.automation_executions
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.automation_executions x
     set status = 'running', attempts = x.attempts + 1, started_at = now(), locked_at = now(), locked_by = p_worker
   where x.id in (select id from public.automation_executions
                   where status = 'queued' and executor = 'backend' and next_attempt_at <= now()
                   order by next_attempt_at
                   limit greatest(1, least(coalesce(p_limit, 10), 100))
                   for update skip locked)
  returning x.*;
end;
$$;

create or replace function public.automation_complete_execution(
  p_execution_id bigint, p_succeeded boolean, p_result jsonb default null, p_error text default null)
returns public.automation_executions
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.automation_executions;
begin
  update public.automation_executions
     set status = case when p_succeeded then 'succeeded'
                       when attempts >= max_attempts then 'dead' else 'queued' end,
         result = p_result, last_error = p_error, locked_at = null,
         finished_at = case when p_succeeded or attempts >= max_attempts then now() end,
         next_attempt_at = case when p_succeeded then next_attempt_at
                                else now() + make_interval(mins => power(2, attempts)::int) end
   where id = p_execution_id and status = 'running'
  returning * into x;
  if not found then
    perform private.fail('INVALID_STATE', 'Execution is not running.');
  end if;
  if not p_succeeded then
    insert into public.automation_error_logs (source, execution_id, error_message)
    values ('backend_worker', p_execution_id, coalesce(p_error, 'unknown error'));
  end if;
  return x;
end;
$$;

-- -----------------------------------------------------------------------------
-- Scheduled jobs
-- -----------------------------------------------------------------------------
create or replace function public.automation_run_scheduled_job(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.scheduled_jobs;
  v_emitted integer := 0;
  v_day text := to_char(now() at time zone private.campus_timezone(), 'YYYY-MM-DD');
  r record;
  v_from date;
  v_to date;
begin
  select * into j from public.scheduled_jobs where code = p_code;
  if not found then
    perform private.fail('JOB_NOT_FOUND', 'Scheduled job not found.');
  end if;
  -- Signed-in callers need automation.manage ("run now"); pg_cron / service role have no auth.uid().
  if auth.uid() is not null and not private.has_global_permission('automation.manage') then
    perform private.fail('FORBIDDEN', 'You cannot run scheduled jobs.', '42501');
  end if;
  begin
    case j.job_type
      when 'pending_request_reminders' then
        for r in select sr.* from public.service_requests sr
                  where sr.status in ('submitted', 'in_review')
                    and sr.submitted_at < now() - make_interval(hours => coalesce((j.parameters ->> 'older_than_hours')::int, 48)) loop
          perform private.emit_automation_event('service_request.pending_reminder', 'service_requests', r.id::text,
            null, r.office_id,
            jsonb_build_object('request_id', r.id, 'request_number', r.request_number, 'status', r.status,
                               'office_id', r.office_id, 'hours_pending',
                               floor(extract(epoch from now() - r.submitted_at) / 3600)),
            'pending_reminder:' || r.id || ':' || v_day);
          v_emitted := v_emitted + 1;
        end loop;
      when 'overdue_request_escalation' then
        for r in select sr.* from public.service_requests sr
                  where sr.due_at is not null and sr.due_at < now()
                    and sr.status not in ('released', 'rejected', 'cancelled') loop
          perform private.emit_automation_event('service_request.overdue', 'service_requests', r.id::text,
            null, r.office_id,
            jsonb_build_object('request_id', r.id, 'request_number', r.request_number, 'status', r.status,
                               'office_id', r.office_id, 'due_at', r.due_at),
            'overdue:' || r.id || ':' || v_day);
          v_emitted := v_emitted + 1;
        end loop;
      when 'clearance_deadline_reminders' then
        for r in select sc.* from public.student_clearances sc
                  where sc.status = 'in_progress' and sc.due_date is not null
                    and sc.due_date - (now() at time zone private.campus_timezone())::date
                        between 0 and coalesce((j.parameters ->> 'days_before')::int, 3) loop
          perform private.emit_automation_event('clearance.deadline_approaching', 'student_clearances', r.id::text,
            null, null,
            jsonb_build_object('student_id', r.student_id, 'clearance_id', r.id,
                               'clearance_number', r.clearance_number, 'due_date', r.due_date),
            'clearance_deadline:' || r.id || ':' || v_day);
          v_emitted := v_emitted + 1;
        end loop;
      when 'generate_queue_slots' then
        v_from := (now() at time zone private.campus_timezone())::date;
        v_to := v_from + coalesce((j.parameters ->> 'days_ahead')::int, 14);
        insert into public.queue_slots (service_id, schedule_id, slot_date, start_time, end_time, capacity)
        select q.service_id, q.id, d::date, t::time, (t + make_interval(mins => q.slot_minutes))::time, q.capacity_per_slot
          from public.queue_schedules q
          join public.services s on s.id = q.service_id and s.is_active
          cross join lateral generate_series(greatest(v_from, q.effective_from),
                                             least(v_to, coalesce(q.effective_until, v_to)), interval '1 day') d
          cross join lateral generate_series(d::date + q.start_time,
                                             d::date + q.end_time - make_interval(mins => q.slot_minutes),
                                             make_interval(mins => q.slot_minutes)) t
         where q.is_active and extract(dow from d) = q.day_of_week
        on conflict (service_id, slot_date, start_time) do nothing;
        get diagnostics v_emitted = row_count;
      when 'expire_public_ai_sessions' then
        delete from public.ai_conversations where channel = 'public' and expires_at < now();
        get diagnostics v_emitted = row_count;
      when 'scheduled_report' then
        perform private.emit_automation_event('report.scheduled', 'scheduled_jobs', j.id::text, null, null,
          jsonb_build_object('job_code', j.code, 'parameters', j.parameters), 'report:' || j.id || ':' || v_day);
        v_emitted := 1;
    end case;
    update public.scheduled_jobs
       set last_run_at = now(), last_status = 'succeeded', last_error = null, run_count = run_count + 1
     where id = j.id;
  exception when others then
    update public.scheduled_jobs
       set last_run_at = now(), last_status = 'failed', last_error = sqlerrm, run_count = run_count + 1
     where id = j.id;
    insert into public.automation_error_logs (source, scheduled_job_id, error_code, error_message)
    values ('scheduler', j.id, sqlstate, sqlerrm);
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
  return jsonb_build_object('status', 'succeeded', 'count', v_emitted);
end;
$$;

-- Keeps pg_cron in step with scheduled_jobs (enabled jobs scheduled, others removed).
create or replace function private.automation_sync_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.scheduled_jobs;
begin
  for j in select * from public.scheduled_jobs loop
    if exists (select 1 from cron.job where jobname = 'campusserve_job_' || j.code) then
      perform cron.unschedule('campusserve_job_' || j.code);
    end if;
    if j.is_enabled then
      perform cron.schedule('campusserve_job_' || j.code, j.cron_expression,
                            format('select public.automation_run_scheduled_job(%L)', j.code));
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Configuration functions (automation.manage)
-- -----------------------------------------------------------------------------
create or replace function public.automation_save_rule(
  p_code text, p_name text, p_trigger_code text, p_conditions jsonb, p_actions jsonb,
  p_description text default null, p_organization_id uuid default null, p_office_id uuid default null)
returns public.automation_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rule public.automation_rules;
  a jsonb;
  v_step integer := 0;
begin
  if not private.has_global_permission('automation.manage') then
    perform private.fail('FORBIDDEN', 'You cannot configure automation.', '42501');
  end if;
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) = 0 then
    perform private.fail('ACTIONS_REQUIRED', 'A rule needs at least one action.');
  end if;
  insert into public.automation_rules (code, name, description, trigger_code, conditions, organization_id, office_id,
                                       created_by, updated_by)
  values (p_code, p_name, p_description, p_trigger_code, coalesce(p_conditions, '[]'::jsonb), p_organization_id,
          p_office_id, v_actor, v_actor)
  on conflict (code) do update
    set name = excluded.name, description = excluded.description, trigger_code = excluded.trigger_code,
        conditions = excluded.conditions, organization_id = excluded.organization_id, office_id = excluded.office_id,
        updated_by = v_actor, version = public.automation_rules.version + 1
  returning * into v_rule;
  delete from public.automation_actions where rule_id = v_rule.id;
  for a in select * from jsonb_array_elements(p_actions) loop
    v_step := v_step + 1;
    insert into public.automation_actions (rule_id, step_order, action_type, parameters)
    values (v_rule.id, v_step, a ->> 'action_type', coalesce(a -> 'parameters', '{}'::jsonb));
  end loop;
  return v_rule;
end;
$$;

create or replace function public.automation_set_rule_enabled(p_rule_id uuid, p_enabled boolean)
returns public.automation_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_rule public.automation_rules;
begin
  if not private.has_global_permission('automation.manage') then
    perform private.fail('FORBIDDEN', 'You cannot configure automation.', '42501');
  end if;
  update public.automation_rules set is_enabled = p_enabled, updated_by = v_actor where id = p_rule_id
  returning * into v_rule;
  if not found then
    perform private.fail('RULE_NOT_FOUND', 'Rule not found.');
  end if;
  return v_rule;
end;
$$;

create or replace function public.automation_update_scheduled_job(
  p_code text, p_enabled boolean, p_cron_expression text default null, p_parameters jsonb default null)
returns public.scheduled_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  j public.scheduled_jobs;
begin
  if not private.has_global_permission('automation.manage') then
    perform private.fail('FORBIDDEN', 'You cannot configure scheduled jobs.', '42501');
  end if;
  update public.scheduled_jobs
     set is_enabled = p_enabled, cron_expression = coalesce(p_cron_expression, cron_expression),
         parameters = coalesce(p_parameters, parameters), updated_by = v_actor
   where code = p_code returning * into j;
  if not found then
    perform private.fail('JOB_NOT_FOUND', 'Scheduled job not found.');
  end if;
  perform private.automation_sync_cron();
  return j;
end;
$$;

create or replace function public.automation_save_notification_template(
  p_code text, p_subject text, p_body text, p_channel text default 'in_app', p_locale text default 'en')
returns public.notification_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  t public.notification_templates;
begin
  if not private.has_global_permission('automation.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage notification templates.', '42501');
  end if;
  update public.notification_templates set is_active = false
   where code = p_code and channel = p_channel and locale = p_locale and is_active;
  insert into public.notification_templates (code, channel, locale, version, subject, body, placeholders, created_by)
  values (p_code, p_channel, p_locale,
          coalesce((select max(version) from public.notification_templates
                     where code = p_code and channel = p_channel and locale = p_locale), 0) + 1,
          p_subject, p_body,
          array(select distinct m[1] from regexp_matches(p_subject || ' ' || p_body, '\{\{([a-z_]+)\}\}', 'g') m),
          v_actor)
  returning * into t;
  return t;
end;
$$;

-- -----------------------------------------------------------------------------
-- System catalogs and defaults (all rules and jobs start DISABLED)
-- -----------------------------------------------------------------------------
insert into public.automation_triggers (code, description, source_table, payload_fields) values
  ('service_request.submitted',       'A student submitted a service request', 'service_requests',
   array['request_id', 'request_number', 'student_id', 'office_id', 'service_id', 'status']),
  ('service_request.status_changed',  'A service request changed status', 'service_requests',
   array['request_id', 'request_number', 'student_id', 'office_id', 'from_status', 'status']),
  ('service_request.pending_reminder','A request has been pending longer than the configured time (scheduled)', 'service_requests',
   array['request_id', 'request_number', 'office_id', 'status', 'hours_pending']),
  ('service_request.overdue',         'A request passed its due time (scheduled)', 'service_requests',
   array['request_id', 'request_number', 'office_id', 'status', 'due_at']),
  ('queue_ticket.status_changed',     'A queue ticket changed status', 'queue_tickets',
   array['ticket_id', 'student_id', 'office_id', 'service_id', 'queue_number', 'from_status', 'status']),
  ('receipt.verified',                'A receipt was verified', 'receipt_records',
   array['receipt_id', 'receipt_number', 'student_id', 'organization_id']),
  ('clearance.requirement_changed',   'A guidance or library requirement changed', 'guidance_records/library_records',
   array['student_id', 'requirement', 'status']),
  ('clearance.step_status_changed',   'A clearance step was approved or returned', 'clearance_approvals',
   array['clearance_id', 'student_id', 'step_key', 'from_status', 'status']),
  ('clearance.status_changed',        'A clearance changed status', 'student_clearances',
   array['clearance_id', 'student_id', 'clearance_number', 'from_status', 'status']),
  ('clearance.deadline_approaching',  'A clearance deadline is near (scheduled)', 'student_clearances',
   array['clearance_id', 'student_id', 'clearance_number', 'due_date']),
  ('payment.status_changed',          'A penalty payment changed provider status', 'penalty_payments',
   array['payment_id', 'reference', 'student_id', 'organization_id', 'from_status', 'status']),
  ('community_service.status_changed','Community service was verified or rejected', 'community_service_records',
   array['record_id', 'student_id', 'organization_id', 'hours_rendered', 'status']),
  ('violation.status_changed',        'A violation record changed status', 'violation_records',
   array['violation_id', 'student_id', 'organization_id', 'from_status', 'status']),
  ('report.scheduled',                'A scheduled report is due', 'scheduled_jobs', array['job_code', 'parameters']);

insert into public.notification_templates (code, channel, subject, body, placeholders) values
  ('request_pending_staff_reminder', 'in_app', 'Request {{request_number}} is waiting',
   'Request {{request_number}} has been {{status}} for {{hours_pending}} hours.', array['request_number', 'status', 'hours_pending']),
  ('request_overdue_escalation', 'in_app', 'Request {{request_number}} is overdue',
   'Request {{request_number}} passed its due time ({{due_at}}) and is still {{status}}. Please review it.',
   array['request_number', 'due_at', 'status']),
  ('queue_ticket_status', 'in_app', 'Queue ticket {{queue_number}}: {{status}}',
   'Your queue ticket {{queue_number}} is now {{status}}.', array['queue_number', 'status']),
  ('clearance_deadline_reminder', 'in_app', 'Clearance {{clearance_number}} is due {{due_date}}',
   'Your clearance {{clearance_number}} is due on {{due_date}}. Check which requirements are still pending.',
   array['clearance_number', 'due_date']),
  ('community_service_update', 'in_app', 'Community service {{status}}',
   'Your community service entry ({{hours_rendered}} hours) was {{status}} by the organization.',
   array['hours_rendered', 'status']),
  ('payment_status_update', 'in_app', 'Payment {{reference}}: {{status}}',
   'Your payment {{reference}} is now {{status}}.', array['reference', 'status']);

insert into public.scheduled_jobs (code, name, job_type, cron_expression, parameters) values
  ('pending_request_reminders',  'Remind offices of pending requests',     'pending_request_reminders',  '0 8 * * 1-5', '{"older_than_hours": 48}'),
  ('overdue_request_escalation', 'Escalate overdue requests',              'overdue_request_escalation', '30 8 * * 1-5', '{}'),
  ('clearance_deadline_reminders','Remind students of clearance deadlines','clearance_deadline_reminders','0 7 * * *',  '{"days_before": 3}'),
  ('generate_queue_slots',       'Generate queue slots from schedules',    'generate_queue_slots',       '0 1 * * *',  '{"days_ahead": 14}'),
  ('expire_public_ai_sessions',  'Delete expired public assistant sessions','expire_public_ai_sessions', '15 * * * *', '{}');
-- Note: pg_cron interprets cron expressions in UTC (08:00 UTC = 16:00 Manila). Adjust when enabling.

-- Default rules (disabled). They complement, never duplicate, the
-- notifications the workflow functions already send.
insert into public.automation_rules (code, name, description, trigger_code, conditions) values
  ('pending_request_reminder', 'Remind office staff of pending requests', null,
   'service_request.pending_reminder', '[]'),
  ('overdue_request_escalation', 'Escalate overdue requests to the office head', 'Notification only; no decision is made.',
   'service_request.overdue', '[]'),
  ('reevaluate_clearance_on_receipt', 'Re-check open clearances when a receipt is verified', null,
   'receipt.verified', '[]'),
  ('reevaluate_clearance_on_requirement', 'Re-check open clearances when a guidance or library item changes', null,
   'clearance.requirement_changed', '[]'),
  ('clearance_deadline_reminder', 'Remind students before their clearance deadline', null,
   'clearance.deadline_approaching', '[]'),
  ('queue_ticket_office_changes', 'Tell students when the office marks a ticket no-show or cancelled', null,
   'queue_ticket.status_changed', '[{"field": "status", "op": "in", "value": ["no_show", "cancelled", "completed"]}]'),
  ('community_service_updates', 'Tell students when community service is verified or rejected', null,
   'community_service.status_changed', '[]'),
  ('payment_failure_notice', 'Tell students when a payment fails or expires', null,
   'payment.status_changed', '[{"field": "status", "op": "in", "value": ["failed", "expired", "refunded"]}]');

insert into public.automation_actions (rule_id, step_order, action_type, parameters)
select r.id, 1, v.action_type, v.parameters::jsonb
  from public.automation_rules r
  join (values
    ('pending_request_reminder', 'escalate_to_position', '{"permission": "requests.manage", "template_code": "request_pending_staff_reminder"}'),
    ('overdue_request_escalation', 'escalate_to_position', '{"position_codes": ["office_head", "sas_head"], "template_code": "request_overdue_escalation"}'),
    ('reevaluate_clearance_on_receipt', 'reevaluate_clearance', '{}'),
    ('reevaluate_clearance_on_requirement', 'reevaluate_clearance', '{}'),
    ('clearance_deadline_reminder', 'send_reminder', '{"template_code": "clearance_deadline_reminder"}'),
    ('queue_ticket_office_changes', 'send_notification', '{"template_code": "queue_ticket_status"}'),
    ('community_service_updates', 'send_notification', '{"template_code": "community_service_update"}'),
    ('payment_failure_notice', 'send_notification', '{"template_code": "payment_status_update"}')
  ) as v(rule_code, action_type, parameters) on v.rule_code = r.code;
