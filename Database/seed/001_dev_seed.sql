-- =============================================================================
-- CampusServe DEVELOPMENT SEED — for development and testing only.
--
-- Everything here is sample data. Remove it before production with
-- Database/seed/900_remove_dev_seed.sql.
--
-- What is CONFIRMED by the master specification and seeded as such:
--   * program -> department organization: BSIT->PADC, BEED->YMO, BSOM->JOES, BSFM->JFMS
--   * SSG penalty: 1 hour OR PHP 60 per verified violation, student chooses
--   * PADC count rule: floor(bottles / 10) per event, no carry-over
--
-- What is deliberately NOT invented:
--   * CBAM's organization mapping (seeded as 'unconfirmed', no organization)
--   * PADC's penalty amount and options (penalty_confirmed = false)
--   * any JOES, JFMS or YMO violation policy (none seeded)
--   * real fee amounts (obligations are marked DEV SAMPLE)
--   * full program names (codes are used until confirmed)
--
-- Sample accounts have NO password and cannot sign in. Create real accounts
-- through Supabase Auth and assign roles/positions instead.
-- =============================================================================

begin;

-- Academic year ------------------------------------------------------------------
insert into public.academic_years (code, starts_on, ends_on, is_current)
values ('2026-2027', '2026-08-01', '2027-07-31', true)
on conflict (code) do nothing;

-- Organizations -------------------------------------------------------------------
insert into public.organizations (code, name, organization_type, description) values
  ('SSG',          'Supreme Student Government', 'student_government',     'Campus-wide student government.'),
  ('PADC',         'PADC',                       'department_organization', 'Department organization of BSIT.'),
  ('YMO',          'YMO',                        'department_organization', 'Department organization of BEED.'),
  ('JOES',         'JOES',                       'department_organization', 'Department organization of BSOM.'),
  ('JFMS',         'JFMS',                       'department_organization', 'Department organization of BSFM.'),
  ('ENGLISH_CLUB', 'English Club',               'club', null),
  ('SAMPILKO',     'SAMPILKO',                   'club', null),
  ('PEER_TO_PEER', 'Peer to Peer',               'club', null),
  ('SCI_MATH',     'Sci-Math',                   'club', null),
  ('CYMA',         'CYMA',                       'club', null)
on conflict (code) do nothing;

insert into public.clubs (organization_id, notes)
select id, 'Receipt applicability is configured on the club''s receipt obligation (unconfirmed).'
  from public.organizations where organization_type = 'club'
on conflict (organization_id) do nothing;

-- Programs and the confirmed mappings -------------------------------------------------
insert into public.programs (code, name, department_organization_id, organization_mapping_status, organization_mapping_notes)
select v.code, v.code, o.id, v.status, v.notes
  from (values
    ('BSIT', 'PADC', 'confirmed',   'Confirmed in the master specification.'),
    ('BEED', 'YMO',  'confirmed',   'Confirmed in the master specification.'),
    ('BSOM', 'JOES', 'confirmed',   'Confirmed in the master specification.'),
    ('BSFM', 'JFMS', 'confirmed',   'Confirmed in the master specification.'),
    ('CBAM', null,   'unconfirmed', 'UNCONFIRMED: the CBAM organization mapping is not known. '
                                    'An administrator must configure it (and confirm whether CBAM is a program).')
  ) as v(code, org_code, status, notes)
  left join public.organizations o on o.code = v.org_code
on conflict (code) do nothing;

-- Offices ----------------------------------------------------------------------------------
insert into public.offices (code, name, description) values
  ('SAS',       'Student Affairs and Services', 'Initiates student clearance.'),
  ('GUIDANCE',  'Guidance Office',              'Teacher evaluations and guidance clearance slips.'),
  ('LIBRARY',   'Library',                      'Library ID validation, library receipts and slips.'),
  ('REGISTRAR', 'Registrar''s Office',          'Sample office for document requests.'),
  ('CASHIER',   'Cashier''s Office',            'Sample office for payments at the counter.')
on conflict (code) do nothing;

-- Services, schedules and slots -----------------------------------------------------------
insert into public.services (office_id, code, name, description, service_kind, cancellation_cutoff_minutes)
select o.id, v.code, v.name, v.descr, v.kind, v.cutoff
  from (values
    ('REGISTRAR', 'DOCUMENT_REQUEST',     'Document request',            'Certificates and records (sample).', 'both',  60),
    ('REGISTRAR', 'ENROLLMENT_INQUIRY',   'Enrollment inquiry',          'Walk-in inquiry (sample).',          'queue', 30),
    ('GUIDANCE',  'COUNSELING',           'Counseling appointment',      'Sample service.',                    'queue', 120),
    ('LIBRARY',   'LIBRARY_ID_VALIDATION','Library ID validation',       'Sample service.',                    'queue', 30),
    ('SAS',       'CLEARANCE_ASSISTANCE', 'Clearance assistance',        'Sample service.',                    'queue', 30),
    ('CASHIER',   'COUNTER_PAYMENT',      'Counter payment',             'Sample service.',                    'queue', 15)
  ) as v(office_code, code, name, descr, kind, cutoff)
  join public.offices o on o.code = v.office_code
on conflict (office_id, code) do nothing;

-- Monday to Friday, 08:00-12:00 and 13:00-17:00, 30-minute slots, 5 students each.
insert into public.queue_schedules (service_id, day_of_week, start_time, end_time, slot_minutes,
                                    capacity_per_slot, effective_from, effective_until)
select s.id, dow, t.start_time, t.end_time, 30, 5, '2026-08-01', '2027-07-31'
  from public.services s
  cross join generate_series(1, 5) dow
  cross join (values (time '08:00', time '12:00'), (time '13:00', time '17:00')) t(start_time, end_time)
 where not exists (select 1 from public.queue_schedules q where q.service_id = s.id);

-- Slots for the next 14 days.
insert into public.queue_slots (service_id, schedule_id, slot_date, start_time, end_time, capacity)
select q.service_id, q.id, d::date, ts::time, (ts + make_interval(mins => q.slot_minutes))::time, q.capacity_per_slot
  from public.queue_schedules q
  cross join generate_series(current_date, current_date + 13, interval '1 day') d
  cross join lateral generate_series(d::date + q.start_time,
                                     d::date + q.end_time - make_interval(mins => q.slot_minutes),
                                     make_interval(mins => q.slot_minutes)) ts
 where extract(dow from d) = q.day_of_week
on conflict (service_id, slot_date, start_time) do nothing;

-- Receipt obligations (DEV SAMPLE amounts: NOT the school's real fees) ---------------------
insert into public.receipt_obligations (organization_id, academic_year_id, code, name, amount, applicability,
                                        applicability_confirmed)
select o.id, ay.id, o.code || '_FEE',
       o.name || ' fee (DEV SAMPLE amount)',
       50.00,
       case o.organization_type
         when 'student_government' then 'all_students'
         when 'department_organization' then 'department_members'
         else 'club_members' end,
       false
  from public.organizations o
  cross join public.academic_years ay
 where ay.code = '2026-2027'
on conflict (organization_id, academic_year_id, code) do nothing;

-- Violation policies --------------------------------------------------------------------------
insert into public.violation_policies (organization_id, code, name, description)
select o.id, v.code, v.name, v.descr
  from (values
    ('SSG',  'EVENT_VIOLATION',  'SSG event violation',
     'One verified violation = 1 hour of community service OR PHP 60. The student chooses.'),
    ('PADC', 'BOTTLE_POLICY',    'PADC bottle policy',
     'Every complete 10 bottles = 1 violation (floor division, per event, no carry-over). '
     'Penalty amount and resolution options are UNCONFIRMED.')
  ) as v(org_code, code, name, descr)
  join public.organizations o on o.code = v.org_code
on conflict (organization_id, code) do nothing;

insert into public.violation_policy_versions
  (policy_id, version_number, academic_year_id, calculation_type, quantity_unit, quantity_per_violation,
   hours_per_violation, amount_per_violation, allowed_resolutions, penalty_confirmed, status, notes)
select p.id, 1, ay.id, v.calc, v.unit, v.per, v.hours, v.amount, v.options, v.confirmed, 'active', v.notes
  from (values
    ('SSG',  'EVENT_VIOLATION', 'per_violation',      null::text, null::integer, 1.00::numeric, 60.00::numeric,
     array['community_service', 'payment'], true,  'Confirmed in the master specification.'),
    ('PADC', 'BOTTLE_POLICY',   'quantity_threshold', 'bottles',  10,            null,          null,
     array[]::text[],                       false, 'Count rule confirmed. Penalty UNCONFIRMED: create version 2 once confirmed.')
  ) as v(org_code, policy_code, calc, unit, per, hours, amount, options, confirmed, notes)
  join public.organizations o on o.code = v.org_code
  join public.violation_policies p on p.organization_id = o.id and p.code = v.policy_code
  cross join public.academic_years ay
 where ay.code = '2026-2027'
on conflict (policy_id, version_number) do nothing;

insert into public.organization_events (organization_id, academic_year_id, name, event_date, description)
select o.id, ay.id, v.name, v.event_date::date, 'Sample event'
  from (values ('SSG', 'General Assembly (sample)', '2026-09-15'),
               ('PADC', 'Bottle Drive (sample)', '2026-09-20')) v(org_code, name, event_date)
  join public.organizations o on o.code = v.org_code
  cross join public.academic_years ay where ay.code = '2026-2027'
on conflict (organization_id, name, event_date) do nothing;

-- Clearance template (follows the school's process; editable as configuration) ----------------
insert into public.clearance_templates (code, name, description, academic_year_id, version, initiating_office_id, status)
select 'STANDARD', 'Student clearance', 'Initiated by SAS.', ay.id, 1, o.id, 'draft'
  from public.academic_years ay, public.offices o
 where ay.code = '2026-2027' and o.code = 'SAS'
on conflict (code, academic_year_id, version) do nothing;

insert into public.clearance_steps (template_id, step_key, name, sequence, approver_position_code, approver_scope,
                                    fixed_organization_id, fixed_office_id)
select t.id, v.step_key, v.name, v.seq, v.pos, v.scope,
       (select id from public.organizations where code = v.org_code),
       (select id from public.offices where code = v.office_code)
  from public.clearance_templates t
  cross join (values
    ('ssg_governor',     'SSG Governor',                   1, 'governor',     'fixed_organization',              'SSG', null),
    ('sas_head',         'SAS Head',                       2, 'sas_head',     'fixed_office',                    null,  'SAS'),
    ('department_mayor', 'Department Organization Mayor',  3, 'mayor',        'student_department_organization', null,  null),
    ('program_head',     'Program Head',                   4, 'program_head', 'student_program',                 null,  null)
  ) as v(step_key, name, seq, pos, scope, org_code, office_code)
 where t.code = 'STANDARD' and t.version = 1 and t.status = 'draft'
on conflict (template_id, step_key) do nothing;

insert into public.clearance_requirements (step_id, requirement_key, name, requirement_type, organization_selector, organization_id)
select s.id, v.key, v.name, v.type, v.selector, (select id from public.organizations where code = v.org_code)
  from public.clearance_steps s
  join public.clearance_templates t on t.id = s.template_id and t.code = 'STANDARD' and t.status = 'draft'
  join (values
    ('ssg_governor', 'ssg_receipt',              'SSG receipt',                       'receipt_obligations',     'fixed',                           'SSG'),
    ('ssg_governor', 'department_org_receipt',   'Department organization receipt',   'receipt_obligations',     'student_department_organization', null),
    ('ssg_governor', 'club_receipts',            'Applicable club receipts',          'receipt_obligations',     'student_clubs',                   null),
    ('ssg_governor', 'library_receipt',          'Library receipt',                   'library_receipt',         'none',                            null),
    ('ssg_governor', 'guidance_slip',            'Guidance clearance slip',           'guidance_slip',           'none',                            null),
    ('ssg_governor', 'library_slip',             'Library clearance slip',            'library_slip',            'none',                            null),
    ('ssg_governor', 'ssg_violations',           'No unresolved SSG penalties',       'no_unresolved_penalties', 'fixed',                           'SSG'),
    ('department_mayor', 'department_violations','No unresolved department penalties','no_unresolved_penalties', 'student_department_organization', null)
  ) as v(step_key, key, name, type, selector, org_code) on v.step_key = s.step_key
on conflict (step_id, requirement_key) do nothing;

update public.clearance_templates set status = 'active', activated_at = now()
 where code = 'STANDARD' and version = 1 and status = 'draft';

-- Sample accounts (no password: cannot sign in) -------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email,
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', v.full_name, 'campusserve_dev_seed', true),
       '', '', '', '', now(), now()
  from (values
    ('a0000000-0000-4000-8000-000000000001', 'admin@campusserve.test',            'Sample Administrator'),
    ('a0000000-0000-4000-8000-000000000002', 'cashier@campusserve.test',          'Sample Cashier'),
    ('a0000000-0000-4000-8000-000000000003', 'programhead.bsit@campusserve.test', 'Sample BSIT Program Head'),
    ('a0000000-0000-4000-8000-000000000004', 'sas.staff@campusserve.test',        'Sample SAS Staff'),
    ('a0000000-0000-4000-8000-000000000005', 'sas.head@campusserve.test',         'Sample SAS Head'),
    ('a0000000-0000-4000-8000-000000000006', 'guidance.staff@campusserve.test',   'Sample Guidance Staff'),
    ('a0000000-0000-4000-8000-000000000007', 'library.staff@campusserve.test',    'Sample Library Staff'),
    ('a0000000-0000-4000-8000-000000000008', 'registrar.staff@campusserve.test',  'Sample Registrar Staff'),
    ('a0000000-0000-4000-8000-000000000011', 'ssg.governor@campusserve.test',     'Sample SSG Governor'),
    ('a0000000-0000-4000-8000-000000000012', 'ssg.treasurer@campusserve.test',    'Sample SSG Treasurer'),
    ('a0000000-0000-4000-8000-000000000013', 'padc.mayor@campusserve.test',       'Sample PADC Mayor'),
    ('a0000000-0000-4000-8000-000000000014', 'padc.treasurer@campusserve.test',   'Sample PADC Treasurer'),
    ('a0000000-0000-4000-8000-000000000015', 'class.officer@campusserve.test',    'Sample BSIT 3A Class Officer'),
    ('a0000000-0000-4000-8000-000000000016', 'english.president@campusserve.test','Sample English Club President'),
    ('a0000000-0000-4000-8000-000000000021', 'student.bsit1@campusserve.test',    'Sample Student BSIT 1'),
    ('a0000000-0000-4000-8000-000000000022', 'student.bsit2@campusserve.test',    'Sample Student BSIT 2'),
    ('a0000000-0000-4000-8000-000000000023', 'student.beed@campusserve.test',     'Sample Student BEED'),
    ('a0000000-0000-4000-8000-000000000024', 'student.cbam@campusserve.test',     'Sample Student CBAM')
  ) as v(id, email, full_name)
on conflict (id) do nothing;

-- New auth users start inactive (migration 018); the sample accounts are activated explicitly.
update public.profiles set is_active = true
 where id in (select id from auth.users where raw_user_meta_data ->> 'campusserve_dev_seed' = 'true');
-- The on_auth_user_created trigger created a profile and the student role for each.

-- Staff accounts are not students.
delete from public.user_roles
 where role = 'student'
   and user_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
                   'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004',
                   'a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006',
                   'a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000008');

insert into public.user_roles (user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'administrator'),
  ('a0000000-0000-4000-8000-000000000002', 'cashier'),
  ('a0000000-0000-4000-8000-000000000003', 'department_head'),
  ('a0000000-0000-4000-8000-000000000004', 'office_staff'),
  ('a0000000-0000-4000-8000-000000000005', 'office_staff'),
  ('a0000000-0000-4000-8000-000000000006', 'office_staff'),
  ('a0000000-0000-4000-8000-000000000007', 'office_staff'),
  ('a0000000-0000-4000-8000-000000000008', 'office_staff')
on conflict (user_id, role) do nothing;

-- Students (officers are students too)
insert into public.students (profile_id, student_number, program_id, year_level, section)
select v.id::uuid, v.num, p.id, v.yr, v.sec
  from (values
    ('a0000000-0000-4000-8000-000000000011', 'DEV-0011', 'BSIT', 4, '4A'),
    ('a0000000-0000-4000-8000-000000000012', 'DEV-0012', 'BEED', 3, '3A'),
    ('a0000000-0000-4000-8000-000000000013', 'DEV-0013', 'BSIT', 4, '4B'),
    ('a0000000-0000-4000-8000-000000000014', 'DEV-0014', 'BSIT', 3, '3B'),
    ('a0000000-0000-4000-8000-000000000015', 'DEV-0015', 'BSIT', 3, '3A'),
    ('a0000000-0000-4000-8000-000000000016', 'DEV-0016', 'BEED', 2, '2A'),
    ('a0000000-0000-4000-8000-000000000021', 'DEV-0021', 'BSIT', 3, '3A'),
    ('a0000000-0000-4000-8000-000000000022', 'DEV-0022', 'BSIT', 3, '3A'),
    ('a0000000-0000-4000-8000-000000000023', 'DEV-0023', 'BEED', 2, '2B'),
    ('a0000000-0000-4000-8000-000000000024', 'DEV-0024', 'CBAM', 1, '1A')
  ) as v(id, num, prog, yr, sec)
  join public.programs p on p.code = v.prog
on conflict (profile_id) do nothing;

-- Assignments (current academic year)
insert into public.office_staff (user_id, office_id, position_code, academic_year_id)
select v.id::uuid, o.id, v.pos, ay.id
  from (values
    ('a0000000-0000-4000-8000-000000000004', 'SAS',       'sas_staff'),
    ('a0000000-0000-4000-8000-000000000005', 'SAS',       'sas_head'),
    ('a0000000-0000-4000-8000-000000000006', 'GUIDANCE',  'guidance_staff'),
    ('a0000000-0000-4000-8000-000000000007', 'LIBRARY',   'library_staff'),
    ('a0000000-0000-4000-8000-000000000008', 'REGISTRAR', 'office_staff')
  ) as v(id, office_code, pos)
  join public.offices o on o.code = v.office_code
  cross join public.academic_years ay where ay.code = '2026-2027'
on conflict (user_id, office_id, position_code, academic_year_id) do nothing;

insert into public.organization_assignments (user_id, organization_id, position_code, academic_year_id, program_id, section)
select v.id::uuid, o.id, v.pos, ay.id, (select id from public.programs where code = v.prog), v.sec
  from (values
    ('a0000000-0000-4000-8000-000000000011', 'SSG',          'governor',      null,   null),
    ('a0000000-0000-4000-8000-000000000012', 'SSG',          'treasurer',     null,   null),
    ('a0000000-0000-4000-8000-000000000013', 'PADC',         'mayor',         null,   null),
    ('a0000000-0000-4000-8000-000000000014', 'PADC',         'treasurer',     null,   null),
    ('a0000000-0000-4000-8000-000000000015', 'SSG',          'class_officer', 'BSIT', '3A'),
    ('a0000000-0000-4000-8000-000000000015', 'PADC',         'class_officer', 'BSIT', '3A'),
    ('a0000000-0000-4000-8000-000000000016', 'ENGLISH_CLUB', 'president',     null,   null)
  ) as v(id, org_code, pos, prog, sec)
  join public.organizations o on o.code = v.org_code
  cross join public.academic_years ay where ay.code = '2026-2027'
on conflict do nothing;

insert into public.academic_assignments (user_id, position_code, academic_year_id, program_id)
select 'a0000000-0000-4000-8000-000000000003'::uuid, 'program_head', ay.id, p.id
  from public.academic_years ay, public.programs p
 where ay.code = '2026-2027' and p.code = 'BSIT'
on conflict do nothing;

-- Club membership sample: BSIT student 1 is an English Club member.
insert into public.organization_members (organization_id, student_id, academic_year_id)
select o.id, 'a0000000-0000-4000-8000-000000000021'::uuid, ay.id
  from public.organizations o, public.academic_years ay
 where o.code = 'ENGLISH_CLUB' and ay.code = '2026-2027'
on conflict (organization_id, student_id, academic_year_id) do nothing;

commit;
