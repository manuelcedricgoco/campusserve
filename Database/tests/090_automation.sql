-- Automation foundation tests.
begin;
\ir _helpers.sql

select pg_temp.as_owner();
select pg_temp.put('docreq', (select s.id from public.services s join public.offices o on o.id = s.office_id
                               where o.code = 'REGISTRAR' and s.code = 'DOCUMENT_REQUEST')::text);

-- Defaults are inert -------------------------------------------------------------------------
select pg_temp.ok(not exists (select 1 from public.automation_rules where is_enabled)
                  and not exists (select 1 from public.scheduled_jobs where is_enabled),
  'all seeded rules and scheduled jobs start disabled');
select pg_temp.act_as('bsit1');
select public.submit_service_request(pg_temp.get('docreq')::uuid, 'Certificate');
select pg_temp.as_owner();
select pg_temp.ok((select count(*) from public.automation_events) = 0,
  'with no enabled rule, business changes record no automation events');
select pg_temp.ok(exists (select 1 from cron.job where jobname = 'campusserve_automation_executor')
                  and not exists (select 1 from cron.job where jobname like 'campusserve_job_%'),
  'only the executor is scheduled in pg_cron; disabled jobs are not');

-- Configuration is permission-controlled ---------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.fails($q$select public.automation_save_rule('x', 'x', 'receipt.verified', '[]',
                       '[{"action_type": "record_note"}]')$q$, 'FORBIDDEN', 'students cannot configure automation');
select pg_temp.ok((select count(*) from public.automation_rules) = 0, 'students cannot read automation rules');
select pg_temp.act_as('admin');
select pg_temp.fails($q$select public.automation_save_rule('bad_op', 'x', 'receipt.verified',
                       '[{"field": "status", "op": "contains", "value": "x"}]', '[{"action_type": "record_note"}]')$q$,
  'INVALID_CONDITION', 'unknown condition operators are rejected');
select pg_temp.fails($q$select public.automation_save_rule('approve', 'x', 'receipt.verified', '[]',
                       '[{"action_type": "approve_clearance"}]')$q$,
  '23514', 'there is no action type that approves, verifies or decides');
select pg_temp.as_owner();
select pg_temp.fails($q$insert into public.automation_actions (rule_id, step_order, action_type)
                       select id, 9, 'verify_payment' from public.automation_rules limit 1$q$,
  '23514', 'the action whitelist also holds for direct writes');

-- Event -> rule -> execution -> clearance re-evaluation (no approval) ---------------------------------
select pg_temp.act_as('admin');
select public.automation_set_rule_enabled((select id from public.automation_rules where code = 'reevaluate_clearance_on_receipt'), true);
select pg_temp.act_as('sas_staff');
select pg_temp.put('clr', (public.initiate_student_clearance(pg_temp.u('bsit1'),
  (select id from public.clearance_templates where code = 'STANDARD' and status = 'active'))).id::text);
select pg_temp.act_as('ssg_treasurer');
select pg_temp.put('rcpt', (public.record_individual_receipt(
  (select ob.id from public.receipt_obligations ob join public.organizations o on o.id = ob.organization_id
    where o.code = 'SSG'), pg_temp.u('bsit1'), 50)).id::text);
select public.verify_receipt_record(pg_temp.get('rcpt')::uuid, 'verified');
select pg_temp.as_owner();
select pg_temp.ok((select count(*) from public.automation_executions x join public.automation_rules r on r.id = x.rule_id
                    where r.code = 'reevaluate_clearance_on_receipt' and x.status = 'queued' and x.executor = 'database') = 1,
  'a verified receipt queues one execution for the enabled rule');
select pg_temp.ok((select status from public.clearance_requirement_status
                    where student_clearance_id = pg_temp.get('clr')::uuid and requirement_key = 'ssg_receipt') = 'not_satisfied',
  'before the executor runs, the stored requirement status is stale');
select pg_temp.act_as_service();
select pg_temp.ok((public.automation_run_due()) ->> 'succeeded' = '1', 'the executor runs the queued execution');
select pg_temp.as_owner();
select pg_temp.ok((select status from public.clearance_requirement_status
                    where student_clearance_id = pg_temp.get('clr')::uuid and requirement_key = 'ssg_receipt') = 'satisfied',
  'automation re-evaluated the clearance requirement');
select pg_temp.ok(not exists (select 1 from public.clearance_approvals
                              where student_clearance_id = pg_temp.get('clr')::uuid and status <> 'pending'),
  'automation never approves a clearance step');
select pg_temp.ok((select count(*) from public.automation_execution_logs l join public.automation_executions x on x.id = l.execution_id
                    join public.automation_rules r on r.id = x.rule_id where r.code = 'reevaluate_clearance_on_receipt') >= 1,
  'execution steps are logged');

-- Idempotency -------------------------------------------------------------------------------------------
select private.emit_automation_event('receipt.verified', 'receipt_records', 'x', null, null,
                                     '{"student_id": null}', 'test-idempotency-key');
select private.emit_automation_event('receipt.verified', 'receipt_records', 'x', null, null,
                                     '{"student_id": null}', 'test-idempotency-key');
select pg_temp.ok((select count(*) from public.automation_events where idempotency_key = 'test-idempotency-key') = 1,
  'the same event is recorded once');
select pg_temp.ok((select count(*) from public.automation_executions x join public.automation_events e on e.id = x.event_id
                    where e.idempotency_key = 'test-idempotency-key') = 1,
  'and produces one execution per rule');

-- Conditions and notification delivery --------------------------------------------------------------------
select pg_temp.act_as('admin');
select public.automation_set_rule_enabled((select id from public.automation_rules where code = 'queue_ticket_office_changes'), true);
select pg_temp.as_owner();
insert into public.queue_slots (service_id, slot_date, start_time, end_time, capacity)
values (pg_temp.get('docreq')::uuid, private.campus_now()::date + 4, '21:00', '21:30', 5)
returning pg_temp.put('slot', id::text);
select pg_temp.act_as('bsit2');
select pg_temp.put('ticket', (public.reserve_queue_slot(pg_temp.get('slot')::uuid)).id::text);
select pg_temp.act_as('registrar');
select public.update_queue_ticket_status(pg_temp.get('ticket')::uuid, 'checked_in');
select pg_temp.as_owner();
select pg_temp.ok(not exists (select 1 from public.automation_executions x join public.automation_rules r on r.id = x.rule_id
                              where r.code = 'queue_ticket_office_changes'),
  'a change that does not meet the rule''s conditions (checked_in) queues nothing');
select pg_temp.act_as('registrar');
select public.update_queue_ticket_status(pg_temp.get('ticket')::uuid, 'no_show');
select pg_temp.act_as_service();
select public.automation_run_due();
select pg_temp.as_owner();
select pg_temp.ok(exists (select 1 from public.notifications
                          where user_id = pg_temp.u('bsit2') and category = 'automation' and title like '%no_show%'),
  'a matching change notifies the student with the rendered template');
select pg_temp.ok(exists (select 1 from public.notification_delivery_logs
                          where recipient_id = pg_temp.u('bsit2') and channel = 'in_app' and status = 'delivered'),
  'the delivery is logged');

-- Retry and dead-letter ----------------------------------------------------------------------------------------
select pg_temp.act_as('admin');
select public.automation_save_rule('broken_template', 'Broken', 'violation.status_changed', '[]',
  '[{"action_type": "send_notification", "parameters": {"template_code": "does_not_exist"}}]');
select public.automation_set_rule_enabled((select id from public.automation_rules where code = 'broken_template'), true);
select pg_temp.act_as('ssg_governor');
select public.report_violation((select p.id from public.violation_policies p join public.organizations o on o.id = p.organization_id
                                 where o.code = 'SSG'), pg_temp.u('bsit2'), 'Test');
select public.review_violation((select id from public.violation_records where student_id = pg_temp.u('bsit2') limit 1), 'verified');
select pg_temp.act_as_service();
select public.automation_run_due();
select pg_temp.as_owner();
select pg_temp.ok((select status = 'queued' and attempts = 1 and next_attempt_at > now() and last_error is not null
                     from public.automation_executions x join public.automation_rules r on r.id = x.rule_id
                    where r.code = 'broken_template'),
  'a failed execution is retried later with backoff');
select pg_temp.ok((select count(*) from public.violation_records where student_id = pg_temp.u('bsit2') and status = 'verified') = 1,
  'the automation failure did not undo the business change');
update public.automation_executions set next_attempt_at = now()
 where rule_id = (select id from public.automation_rules where code = 'broken_template');
select pg_temp.act_as_service();
select public.automation_run_due();
select pg_temp.as_owner();
update public.automation_executions set next_attempt_at = now()
 where rule_id = (select id from public.automation_rules where code = 'broken_template');
select pg_temp.act_as_service();
select public.automation_run_due();
select pg_temp.as_owner();
select pg_temp.ok((select status = 'dead' and attempts = 3 from public.automation_executions x
                     join public.automation_rules r on r.id = x.rule_id where r.code = 'broken_template'),
  'after max attempts the execution is dead-lettered');
select pg_temp.ok((select count(*) from public.automation_error_logs where source = 'executor') = 3,
  'every failure is in the error log');

-- Backend executions ---------------------------------------------------------------------------------------------
select pg_temp.act_as('admin');
select public.automation_save_rule('report_rule', 'Report', 'report.scheduled', '[]',
  '[{"action_type": "generate_report", "parameters": {"report": "queue_summary"}}]');
select public.automation_set_rule_enabled((select id from public.automation_rules where code = 'report_rule'), true);
select pg_temp.as_owner();
select private.emit_automation_event('report.scheduled', 'scheduled_jobs', 'x', null, null, '{}', 'report-test');
select pg_temp.ok((select executor from public.automation_executions x join public.automation_rules r on r.id = x.rule_id
                    where r.code = 'report_rule') = 'backend', 'external actions are routed to the backend worker');
select pg_temp.act_as_service();
select public.automation_run_due();
select pg_temp.ok((select count(*) from public.automation_claim_backend_executions('worker-1', 10)) = 1,
  'the backend worker claims it (the database executor does not)');
select public.automation_complete_execution(
  (select x.id from public.automation_executions x join public.automation_rules r on r.id = x.rule_id where r.code = 'report_rule'),
  true, '{"ok": true}');
select pg_temp.ok((select status from public.automation_executions x join public.automation_rules r on r.id = x.rule_id
                    where r.code = 'report_rule') = 'succeeded', 'the worker records completion');
select pg_temp.act_as('bsit1');
select pg_temp.fails($q$select public.automation_claim_backend_executions('x', 1)$q$, '42501',
  'signed-in users cannot claim worker jobs');

-- Scheduled jobs -----------------------------------------------------------------------------------------------------
select pg_temp.as_owner();
update public.service_requests set submitted_at = now() - interval '3 days' where student_id = pg_temp.u('bsit1');
select pg_temp.act_as('admin');
select public.automation_set_rule_enabled((select id from public.automation_rules where code = 'pending_request_reminder'), true);
select public.automation_update_scheduled_job('pending_request_reminders', true);
select pg_temp.as_owner();
select pg_temp.ok(exists (select 1 from cron.job where jobname = 'campusserve_job_pending_request_reminders'),
  'enabling a scheduled job registers it in pg_cron');
select pg_temp.act_as_service();
select pg_temp.ok((public.automation_run_scheduled_job('pending_request_reminders')) ->> 'count' = '1',
  'the reminder job finds the pending request');
select public.automation_run_scheduled_job('pending_request_reminders');
select pg_temp.as_owner();
select pg_temp.ok((select count(*) from public.automation_events where event_type = 'service_request.pending_reminder') = 1,
  'running the job twice on the same day does not duplicate the reminder');
select pg_temp.act_as_service();
select public.automation_run_due();
select pg_temp.as_owner();
select pg_temp.ok(exists (select 1 from public.notifications
                          where user_id = pg_temp.u('registrar') and category = 'automation'),
  'office staff who handle requests are reminded');
select pg_temp.ok((select last_status = 'succeeded' and run_count = 2 from public.scheduled_jobs
                    where code = 'pending_request_reminders'), 'job runs are recorded');
select pg_temp.act_as('admin');
select public.automation_update_scheduled_job('pending_request_reminders', false);
select pg_temp.as_owner();
select pg_temp.ok(not exists (select 1 from cron.job where jobname = 'campusserve_job_pending_request_reminders'),
  'disabling a scheduled job removes it from pg_cron');
select pg_temp.act_as('bsit1');
select pg_temp.fails($q$select public.automation_run_scheduled_job('pending_request_reminders')$q$, 'FORBIDDEN',
  'students cannot run scheduled jobs');

-- Scoped monitoring -------------------------------------------------------------------------------------------------
select pg_temp.as_owner();
update public.automation_rules set organization_id = (select id from public.organizations where code = 'SSG')
 where code = 'broken_template';
select pg_temp.act_as('ssg_governor');
select pg_temp.ok((select count(*) from public.automation_rules) = 1
                  and (select count(*) from public.automation_executions) >= 1
                  and not exists (select 1 from public.automation_executions
                                  where organization_id is distinct from (select id from public.organizations where code = 'SSG')),
  'an SSG officer sees only SSG-scoped rules and executions');
select pg_temp.act_as('padc_mayor');
select pg_temp.ok((select count(*) from public.automation_rules) = 0, 'other organizations see none of it');

select pg_temp.act_as_anon();
select pg_temp.fails('select count(*) from public.automation_rules', '42501', 'anon has no access to automation tables');

select pg_temp.summary('090_automation');
rollback;
