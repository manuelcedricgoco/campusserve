-- Guidance and Library requirement tests.
begin;
\ir _helpers.sql

select pg_temp.as_owner();
select pg_temp.put('guidance_office', (select id from public.offices where code = 'GUIDANCE')::text);
select pg_temp.put('library_office', (select id from public.offices where code = 'LIBRARY')::text);

-- Guidance -------------------------------------------------------------------------
select pg_temp.act_as('guidance');
select pg_temp.fails(format('select public.issue_guidance_slip(%L, %L)', pg_temp.u('bsit1'), pg_temp.get('guidance_office')),
  'PREREQUISITE_INCOMPLETE', 'guidance slip cannot be issued before teacher evaluations');
select public.confirm_teacher_evaluations(pg_temp.u('bsit1'), pg_temp.get('guidance_office')::uuid);
select pg_temp.ok((public.issue_guidance_slip(pg_temp.u('bsit1'), pg_temp.get('guidance_office')::uuid)).slip_status = 'issued',
  'guidance slip is issued after evaluations are completed');

select pg_temp.as_owner();
insert into public.guidance_records (student_id, academic_year_id, office_id)
values (pg_temp.u('bsit2'), private.current_academic_year_id(), pg_temp.get('guidance_office')::uuid);
select pg_temp.fails(format('update public.guidance_records set slip_status = ''issued'', slip_number = ''X'', '
                            'slip_issued_by = %L where student_id = %L', pg_temp.u('guidance'), pg_temp.u('bsit2')),
  '23514', 'database constraint blocks a guidance slip without evaluations, even for direct writes');

select pg_temp.act_as('library');
select pg_temp.fails(format('select public.confirm_teacher_evaluations(%L, %L)', pg_temp.u('bsit1'), pg_temp.get('guidance_office')),
  'FORBIDDEN', 'library staff cannot manage guidance records');
select pg_temp.act_as('bsit1');
select pg_temp.fails(format('select public.confirm_teacher_evaluations(%L, %L)', pg_temp.u('bsit1'), pg_temp.get('guidance_office')),
  'FORBIDDEN', 'a student cannot confirm their own evaluations');

-- Library ---------------------------------------------------------------------------
select pg_temp.act_as('library');
select pg_temp.fails(format('select public.issue_library_slip(%L, %L)', pg_temp.u('bsit1'), pg_temp.get('library_office')),
  'PREREQUISITE_INCOMPLETE', 'library slip requires a validated library ID (configured prerequisite)');
select public.validate_library_id(pg_temp.u('bsit1'), pg_temp.get('library_office')::uuid, 'LIB-0001', 'validated');
select public.verify_library_receipt(pg_temp.u('bsit1'), pg_temp.get('library_office')::uuid, 'LR-01', 20, 'verified');
select pg_temp.ok((public.issue_library_slip(pg_temp.u('bsit1'), pg_temp.get('library_office')::uuid)).slip_status = 'issued',
  'library slip is issued once prerequisites are met');

-- Configurable prerequisite: add "receipt" and check it is enforced
select pg_temp.as_owner();
update public.system_settings set value = '["id_validation","receipt"]' where key = 'library.slip_prerequisites';
select pg_temp.act_as('library');
select public.validate_library_id(pg_temp.u('bsit2'), pg_temp.get('library_office')::uuid, 'LIB-0002', 'validated');
select pg_temp.fails(format('select public.issue_library_slip(%L, %L)', pg_temp.u('bsit2'), pg_temp.get('library_office')),
  'PREREQUISITE_INCOMPLETE', 'library receipt prerequisite is enforced when configured');

-- Guidance and Library are independent (parallel)
select pg_temp.act_as('bsit1');
select pg_temp.ok((select count(*) from public.guidance_records) = 1
                  and (select count(*) from public.library_records) = 1,
  'student sees own guidance and library records');
select pg_temp.act_as('guidance');
select pg_temp.ok((select count(*) from public.library_records) = 0, 'guidance staff cannot read library records');

select pg_temp.summary('040_guidance_library');
rollback;
