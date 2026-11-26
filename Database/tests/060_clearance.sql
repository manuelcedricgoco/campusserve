-- Clearance workflow tests (STANDARD template seeded from the school process).
begin;
\ir _helpers.sql

select pg_temp.as_owner();
select pg_temp.put('tpl', (select id from public.clearance_templates where code = 'STANDARD' and status = 'active')::text);
select pg_temp.put('ssg_policy', (select p.id from public.violation_policies p join public.organizations o
                                  on o.id = p.organization_id where o.code = 'SSG')::text);
select pg_temp.put('padc_policy', (select p.id from public.violation_policies p join public.organizations o
                                   on o.id = p.organization_id where o.code = 'PADC')::text);
select pg_temp.put('padc_event', (select e.id from public.organization_events e join public.organizations o
                                  on o.id = e.organization_id where o.code = 'PADC')::text);

-- Template is configuration and locked once active ----------------------------------
select pg_temp.fails(format('update public.clearance_steps set sequence = 9 where template_id = %L', pg_temp.get('tpl')),
  'TEMPLATE_LOCKED', 'an active template''s steps cannot be edited');

-- Initiation ---------------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.fails(format('select public.initiate_student_clearance(%L, %L)', pg_temp.u('bsit1'), pg_temp.get('tpl')),
  'FORBIDDEN', 'a student cannot initiate a clearance');
select pg_temp.act_as('library');
select pg_temp.fails(format('select public.initiate_student_clearance(%L, %L)', pg_temp.u('bsit1'), pg_temp.get('tpl')),
  'FORBIDDEN', 'only the configured initiating office (SAS) can initiate');
select pg_temp.act_as('sas_staff');
select pg_temp.fails(format('select public.initiate_student_clearance(%L, %L)', pg_temp.u('cbam'), pg_temp.get('tpl')),
  'DEPARTMENT_ORGANIZATION_UNCONFIRMED', 'CBAM clearance is blocked until its mapping is configured');
select pg_temp.put('c1', (public.initiate_student_clearance(pg_temp.u('bsit1'), pg_temp.get('tpl')::uuid)).id::text);
select pg_temp.put('c2', (public.initiate_student_clearance(pg_temp.u('bsit2'), pg_temp.get('tpl')::uuid)).id::text);
select pg_temp.fails(format('select public.initiate_student_clearance(%L, %L)', pg_temp.u('bsit1'), pg_temp.get('tpl')),
  '23505', 'one live clearance per student per template');

select pg_temp.as_owner();
select pg_temp.put('ap_gov', (select id from public.clearance_approvals where student_clearance_id = pg_temp.get('c1')::uuid and step_key = 'ssg_governor')::text);
select pg_temp.put('ap_sas', (select id from public.clearance_approvals where student_clearance_id = pg_temp.get('c1')::uuid and step_key = 'sas_head')::text);
select pg_temp.put('ap_mayor', (select id from public.clearance_approvals where student_clearance_id = pg_temp.get('c1')::uuid and step_key = 'department_mayor')::text);
select pg_temp.put('ap_ph', (select id from public.clearance_approvals where student_clearance_id = pg_temp.get('c1')::uuid and step_key = 'program_head')::text);
select pg_temp.ok((select organization_id from public.clearance_approvals where id = pg_temp.get('ap_mayor')::uuid)
                  = (select id from public.organizations where code = 'PADC'),
  'BSIT student''s mayor step resolves to PADC');
select pg_temp.ok((select template_snapshot -> 'steps' -> 0 ->> 'step_key' from public.student_clearances
                   where id = pg_temp.get('c1')::uuid) = 'ssg_governor',
  'clearance stores a snapshot of the template');

-- Gates -----------------------------------------------------------------------------------
select pg_temp.act_as('ssg_governor');
select pg_temp.fails(format('select public.approve_clearance_step(%L)', pg_temp.get('ap_gov')),
  'CLEARANCE_REQUIREMENTS_NOT_MET', 'SSG Governor cannot approve with receipts and slips missing');
select pg_temp.act_as('sas_head');
select pg_temp.fails(format('select public.approve_clearance_step(%L)', pg_temp.get('ap_sas')),
  'PREVIOUS_STEPS_PENDING', 'SAS Head cannot approve before the SSG Governor');
select pg_temp.act_as('admin');
select pg_temp.fails(format('select public.approve_clearance_step(%L)', pg_temp.get('ap_gov')),
  'FORBIDDEN', 'administrator cannot approve clearance steps');
select pg_temp.act_as('padc_mayor');
select pg_temp.fails(format('select public.approve_clearance_step(%L)', pg_temp.get('ap_gov')),
  'FORBIDDEN', 'PADC mayor cannot approve the SSG Governor step');
select pg_temp.act_as('ssg_treasurer');
select pg_temp.fails(format('select public.approve_clearance_step(%L)', pg_temp.get('ap_gov')),
  'FORBIDDEN', 'an SSG officer who is not the Governor cannot approve the Governor step');

-- Complete the student's requirements --------------------------------------------------------
select pg_temp.as_owner();
insert into public.receipt_records (obligation_id, organization_id, academic_year_id, student_id, amount,
                                    source, status, recorded_by, verified_by, verified_at)
select ob.id, ob.organization_id, ob.academic_year_id, s.sid, ob.amount, 'individual', 'verified',
       pg_temp.u('ssg_treasurer'), pg_temp.u('ssg_treasurer'), now()
  from public.receipt_obligations ob
  join public.organizations o on o.id = ob.organization_id
  cross join (values (pg_temp.u('bsit1')), (pg_temp.u('bsit2'))) s(sid)
 where o.code in ('SSG', 'PADC') or (o.code = 'ENGLISH_CLUB' and s.sid = pg_temp.u('bsit1'));

select pg_temp.act_as('guidance');
select public.confirm_teacher_evaluations(pg_temp.u('bsit1'), (select id from public.offices where code = 'GUIDANCE'));
select public.issue_guidance_slip(pg_temp.u('bsit1'), (select id from public.offices where code = 'GUIDANCE'));
select pg_temp.act_as('library');
select public.validate_library_id(pg_temp.u('bsit1'), (select id from public.offices where code = 'LIBRARY'), 'LIB-1', 'validated');
select public.verify_library_receipt(pg_temp.u('bsit1'), (select id from public.offices where code = 'LIBRARY'), 'LR-1', 20, 'verified');
select public.issue_library_slip(pg_temp.u('bsit1'), (select id from public.offices where code = 'LIBRARY'));

-- Unverified and disputed violations must NOT block ------------------------------------------
select pg_temp.act_as('ssg_governor');
select public.report_violation(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit1'), 'Reported only, not verified');
select pg_temp.put('vd', (public.report_violation(pg_temp.get('ssg_policy')::uuid, pg_temp.u('bsit1'), 'Will be disputed')).id::text);
select public.review_violation(pg_temp.get('vd')::uuid, 'verified');
select pg_temp.act_as('bsit1');
select public.file_violation_dispute(pg_temp.get('vd')::uuid, 'I attended; please check the sign-in sheet.');

select pg_temp.ok((select bool_and(status = 'satisfied') from public.evaluate_student_clearance(pg_temp.get('c1')::uuid)),
  'student can re-evaluate their own clearance: every requirement satisfied');
select pg_temp.act_as('ssg_governor');
select public.approve_clearance_step(pg_temp.get('ap_gov')::uuid, 'All receipts and slips checked');
select pg_temp.pass('SSG Governor approves once requirements are met (reported/disputed violations do not block)');
select pg_temp.fails(format('select public.approve_clearance_step(%L)', pg_temp.get('ap_gov')),
  'INVALID_STATE', 'a step cannot be approved twice');

select pg_temp.act_as('sas_head');
select public.approve_clearance_step(pg_temp.get('ap_sas')::uuid);
select pg_temp.act_as('program_head');
select pg_temp.fails(format('select public.approve_clearance_step(%L)', pg_temp.get('ap_ph')),
  'PREVIOUS_STEPS_PENDING', 'Program Head waits for the department Mayor');
select pg_temp.act_as('padc_mayor');
select public.approve_clearance_step(pg_temp.get('ap_mayor')::uuid);
select pg_temp.act_as('program_head');
select public.approve_clearance_step(pg_temp.get('ap_ph')::uuid);
select pg_temp.as_owner();
select pg_temp.ok((select status from public.student_clearances where id = pg_temp.get('c1')::uuid) = 'completed',
  'clearance completes after the Program Head approves');
select pg_temp.ok((select count(*) from public.clearance_history where student_clearance_id = pg_temp.get('c1')::uuid
                   and event_type in ('initiated', 'approved', 'completed')) = 6,
  'clearance history records initiation, 4 approvals and completion');

-- A verified, unresolved department violation blocks the Mayor --------------------------------
select pg_temp.as_owner();
update public.clearance_approvals set status = 'approved', acted_by = pg_temp.u('sas_head'), acted_at = now()
 where student_clearance_id = pg_temp.get('c2')::uuid and step_key in ('ssg_governor', 'sas_head');
select pg_temp.act_as('padc_mayor');
select pg_temp.put('pv', (public.report_violation(pg_temp.get('padc_policy')::uuid, pg_temp.u('bsit2'), 'Bottle drive',
                                                  pg_temp.get('padc_event')::uuid, 12)).id::text);
select public.review_violation(pg_temp.get('pv')::uuid, 'verified');
select pg_temp.fails(format('select public.approve_clearance_step(%L)',
                            (select id from public.clearance_approvals where student_clearance_id = pg_temp.get('c2')::uuid
                              and step_key = 'department_mayor')),
  'CLEARANCE_REQUIREMENTS_NOT_MET', 'a verified, unresolved PADC violation blocks the Mayor step');
select pg_temp.ok((select details -> 'unresolved_violations' -> 0 ->> 'violation_count'
                     from public.evaluate_student_clearance(pg_temp.get('c2')::uuid)
                    where requirement_key = 'department_violations') = '1',
  'requirement details show the unresolved violation (12 bottles = 1)');

-- Visibility -----------------------------------------------------------------------------------
select pg_temp.act_as('bsit2');
select pg_temp.ok((select count(*) from public.student_clearances) = 1, 'student sees only their own clearance');
select pg_temp.act_as('padc_treasurer');
select pg_temp.ok((select count(*) from public.student_clearances) = 0, 'officers without an approval step see no clearances');
select pg_temp.act_as('program_head');
select pg_temp.ok((select count(*) from public.student_clearances) = 2, 'BSIT Program Head sees BSIT clearances');

select pg_temp.summary('060_clearance');
rollback;
